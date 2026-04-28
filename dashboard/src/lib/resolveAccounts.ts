/**
 * Resolve remaining accounts for the execute instruction.
 *
 * Matches the CLI logic in cli/src/commands/execute.rs:
 * - SOURCE_STATIC: read pubkey from byte pool
 * - SOURCE_PARAM: read pubkey from params_data
 * - SOURCE_VAULT: use vault PDA
 * - SOURCE_PDA: derive PDA from seed entries + program in byte pool
 * - SOURCE_HAS_ONE: read pubkey from referenced account's data
 *
 * For meta-intents (add/remove/update), returns the fixed accounts.
 */
import { PublicKey, Connection } from '@solana/web3.js';
import { address, type Address } from '@solana/kit';
import {
  PREFIX_LEN,
  PARAM_ENTRY_SIZE,
  ACCOUNT_ENTRY_SIZE,
  INSTRUCTION_ENTRY_SIZE,
  DATA_SEGMENT_ENTRY_SIZE,
  SEED_ENTRY_SIZE,
  INTENT_TYPE_ADD,
  INTENT_TYPE_REMOVE,
  INTENT_TYPE_UPDATE,
  INTENT_TYPE_CUSTOM,
  SOURCE_STATIC,
  SOURCE_PARAM,
  SOURCE_VAULT,
  SOURCE_PDA,
  SOURCE_HAS_ONE,
  SEED_LITERAL,
  SEED_PARAM,
  SEED_ACCOUNT,
  SEED_ACCOUNT_FIELD,
  FIELD_OP_SKIP_FIXED,
  FIELD_OP_SKIP_OPTION,
  ROLE_READONLY,
  ROLE_WRITABLE,
  ROLE_READONLY_SIGNER,
  ROLE_WRITABLE_SIGNER,
  RPC_ENDPOINTS,
} from './constants';
import { paramTypeSize } from './params';
import { findIntentPDA, findVaultPDA, findEventAuthorityPDA } from './pda';
import { deserializeWallet } from './deserialize';
import type { IntentAccount, ProposalAccount } from './deserialize';

const INTENT_HEADER_SIZE = 88; // header size after PREFIX_LEN (distinct from constants.ts INTENT_HEADER_SIZE which includes prefix)

export interface ResolvedAccount {
  address: Address;
  role: number;
}

export interface ExecuteContext {
  walletAddress: Address;
  vaultAddress: Address;
  intentAddress: Address;
  proposalAddress: Address;
  eventAuthority: Address;
  remainingAccounts: ResolvedAccount[];
}

/**
 * Build the full execute context: derive PDAs and resolve remaining accounts.
 */
export async function buildExecuteContext(
  walletPubkey: PublicKey,
  proposal: ProposalAccount & { address: PublicKey },
  intentData: IntentAccount,
  network: string,
  payerAddress: string
): Promise<ExecuteContext> {
  const connection = new Connection(RPC_ENDPOINTS[network]);

  const [vaultPda] = findVaultPDA(walletPubkey);
  const [eventAuthority] = findEventAuthorityPDA();

  const walletAddr = address(walletPubkey.toBase58());
  const vaultAddr = address(vaultPda.toBase58());
  const intentAddr = address(proposal.intent.toBase58());
  const proposalAddr = address(proposal.address.toBase58());
  const eventAuthAddr = address(eventAuthority.toBase58());

  let remainingAccounts: ResolvedAccount[];

  if (intentData.intentType === INTENT_TYPE_CUSTOM) {
    remainingAccounts = await resolveCustomAccounts(
      connection,
      proposal.intent,
      proposal,
      vaultPda
    );
  } else if (intentData.intentType === INTENT_TYPE_ADD) {
    remainingAccounts = await resolveAddAccounts(
      connection,
      walletPubkey,
      payerAddress
    );
  } else if (
    intentData.intentType === INTENT_TYPE_REMOVE ||
    intentData.intentType === INTENT_TYPE_UPDATE
  ) {
    remainingAccounts = resolveRemoveUpdateAccounts(
      walletPubkey,
      proposal.paramsData
    );
  } else {
    remainingAccounts = [];
  }

  return {
    walletAddress: walletAddr,
    vaultAddress: vaultAddr,
    intentAddress: intentAddr,
    proposalAddress: proposalAddr,
    eventAuthority: eventAuthAddr,
    remainingAccounts,
  };
}

/**
 * Meta-add: new_intent PDA (wallet.intentCount), payer, system_program
 */
async function resolveAddAccounts(
  connection: Connection,
  walletPubkey: PublicKey,
  payerAddress: string
): Promise<ResolvedAccount[]> {
  const walletInfo = await connection.getAccountInfo(walletPubkey);
  if (!walletInfo) throw new Error('Wallet account not found');
  const walletData = deserializeWallet(Buffer.from(walletInfo.data));
  const newIntentIndex = walletData.intentCount;
  const [newIntentPda] = findIntentPDA(walletPubkey, newIntentIndex);

  return [
    { address: address(newIntentPda.toBase58()), role: ROLE_WRITABLE },
    { address: address(payerAddress), role: ROLE_WRITABLE_SIGNER },
    { address: address('11111111111111111111111111111111'), role: ROLE_READONLY },
  ];
}

/**
 * Meta-remove/update: target_intent PDA derived from first param (u8 intent index)
 */
function resolveRemoveUpdateAccounts(
  walletPubkey: PublicKey,
  paramsData: Uint8Array
): ResolvedAccount[] {
  if (paramsData.length === 0) return [];
  const targetIndex = paramsData[0];
  const [targetIntentPda] = findIntentPDA(walletPubkey, targetIndex);
  return [
    { address: address(targetIntentPda.toBase58()), role: ROLE_WRITABLE },
  ];
}

/**
 * Custom intents: walk account entries, resolve addresses from byte pool / params_data / vault.
 * Skips SOURCE_PDA and SOURCE_HAS_ONE (same as CLI).
 */
async function resolveCustomAccounts(
  connection: Connection,
  intentPubkey: PublicKey,
  proposal: ProposalAccount,
  vaultPda: PublicKey
): Promise<ResolvedAccount[]> {
  // Re-fetch raw intent data for byte pool access
  const intentInfo = await connection.getAccountInfo(intentPubkey);
  if (!intentInfo) throw new Error('Intent account not found');
  const rawIntent = Buffer.from(intentInfo.data);

  // Cache fetched account data so a single source account referenced by
  // multiple SEED_ACCOUNT_FIELD seeds doesn't trigger duplicate round-trips.
  const accountDataCache = new Map<string, Buffer>();

  // Parse header fields — IntentHeader: wallet(32) + target_program(32) + timelock(4) + active_proposals(2) + byte_pool_len(2) + bump(1) + ...
  const ih = rawIntent.subarray(PREFIX_LEN);
  const proposerCount = ih[78];
  const approverCount = ih[79];
  const paramCount = ih[80];
  const accountCount = ih[81];
  const instructionCount = ih[82];
  const dataSegmentCount = ih[83];
  const seedCount = ih[84];

  // Calculate offsets
  const accountsOffset =
    PREFIX_LEN +
    INTENT_HEADER_SIZE +
    proposerCount * 32 +
    approverCount * 32 +
    paramCount * PARAM_ENTRY_SIZE;

  const seedsOffset =
    PREFIX_LEN +
    INTENT_HEADER_SIZE +
    proposerCount * 32 +
    approverCount * 32 +
    paramCount * PARAM_ENTRY_SIZE +
    accountCount * ACCOUNT_ENTRY_SIZE +
    instructionCount * INSTRUCTION_ENTRY_SIZE +
    dataSegmentCount * DATA_SEGMENT_ENTRY_SIZE;

  const bytePoolOffset = seedsOffset + seedCount * SEED_ENTRY_SIZE;

  const paramsData = proposal.paramsData;
  const results: ResolvedAccount[] = [];

  for (let a = 0; a < accountCount; a++) {
    const entryOffset = accountsOffset + a * ACCOUNT_ENTRY_SIZE;
    if (entryOffset + ACCOUNT_ENTRY_SIZE > rawIntent.length) {
      console.warn(`Execute: intent buffer truncated at account ${a}/${accountCount}`);
      break;
    }

    const source = rawIntent[entryOffset];
    const writable = rawIntent[entryOffset + 1] === 1;
    const isSigner = rawIntent[entryOffset + 2] === 1;
    const sourceData = rawIntent.subarray(entryOffset + 4, entryOffset + 8);

    let resolved: string | null = null;

    switch (source) {
      case SOURCE_STATIC: {
        const poolOff = sourceData[0] | (sourceData[1] << 8);
        if (bytePoolOffset + poolOff + 32 <= rawIntent.length) {
          const pubkey = new PublicKey(
            rawIntent.subarray(
              bytePoolOffset + poolOff,
              bytePoolOffset + poolOff + 32
            )
          );
          resolved = pubkey.toBase58();
        }
        break;
      }
      case SOURCE_PARAM: {
        const paramIdx = sourceData[0];
        const addr = readParamAddress(
          rawIntent,
          paramsData,
          paramIdx,
          proposerCount,
          approverCount
        );
        if (addr) resolved = addr.toBase58();
        break;
      }
      case SOURCE_VAULT:
        resolved = vaultPda.toBase58();
        break;
      case SOURCE_HAS_ONE: {
        const srcIdx = sourceData[0];
        const dataOff = sourceData[1] | (sourceData[2] << 8);
        if (srcIdx < results.length) {
          const srcAddr = results[srcIdx].address;
          const srcInfo = await connection.getAccountInfo(new PublicKey(srcAddr));
          if (srcInfo && dataOff + 32 <= srcInfo.data.length) {
            const pk = new PublicKey(srcInfo.data.subarray(dataOff, dataOff + 32));
            resolved = pk.toBase58();
          }
        }
        break;
      }
      case SOURCE_PDA: {
        const seedStart = sourceData[0];
        const pdaSeedCount = sourceData[1];
        const progOff = sourceData[2] | (sourceData[3] << 8);

        // Read program address from byte pool
        const progPubkey = new PublicKey(
          rawIntent.subarray(bytePoolOffset + progOff, bytePoolOffset + progOff + 32)
        );

        // Resolve each seed
        const seeds: Buffer[] = [];
        for (let s = 0; s < pdaSeedCount; s++) {
          const seOffset = seedsOffset + (seedStart + s) * SEED_ENTRY_SIZE;
          const seedType = rawIntent[seOffset];
          const seedData = rawIntent.subarray(seOffset + 2, seOffset + 6);

          switch (seedType) {
            case SEED_LITERAL: {
              const litOff = seedData[0] | (seedData[1] << 8);
              const litLen = seedData[2] | (seedData[3] << 8);
              seeds.push(Buffer.from(rawIntent.subarray(
                bytePoolOffset + litOff,
                bytePoolOffset + litOff + litLen
              )));
              break;
            }
            case SEED_PARAM: {
              const pi = seedData[0];
              const paramBytes = readParamBytes(
                rawIntent, paramsData, pi,
                proposerCount, approverCount, paramCount
              );
              if (paramBytes) seeds.push(Buffer.from(paramBytes));
              break;
            }
            case SEED_ACCOUNT: {
              // Resolve the referenced account's address and use as seed
              const ai = seedData[0];
              if (ai < results.length) {
                seeds.push(Buffer.from(new PublicKey(results[ai].address).toBytes()));
              }
              break;
            }
            case SEED_ACCOUNT_FIELD: {
              const ai = seedData[0];
              const planOff = seedData[1] | (seedData[2] << 8);
              const targetLen = seedData[3];
              if (targetLen === 0 || targetLen > 32) {
                throw new Error(
                  `SEED_ACCOUNT_FIELD target_len must be 1..=32, got ${targetLen}`
                );
              }
              if (ai >= results.length) {
                throw new Error(
                  `SEED_ACCOUNT_FIELD account index ${ai} out of range`
                );
              }

              // Read the plan from intent's byte pool.
              const planStart = bytePoolOffset + planOff;
              if (planStart + 1 > rawIntent.length) {
                throw new Error('plan_offset out of bounds');
              }
              const opCount = rawIntent[planStart];
              const planBytesStart = planStart + 1;
              if (planBytesStart + opCount * 3 > rawIntent.length) {
                throw new Error('plan body out of bounds');
              }

              const srcAddr = new PublicKey(results[ai].address);
              const cacheKey = srcAddr.toBase58();
              let data = accountDataCache.get(cacheKey);
              if (!data) {
                const info = await connection.getAccountInfo(srcAddr);
                if (!info) {
                  throw new Error(
                    `SEED_ACCOUNT_FIELD: account ${cacheKey} not found`
                  );
                }
                data = info.data;
                accountDataCache.set(cacheKey, data);
              }

              let o = 8;
              for (let i = 0; i < opCount; i++) {
                const p = planBytesStart + i * 3;
                const op = rawIntent[p];
                const size = rawIntent[p + 1] | (rawIntent[p + 2] << 8);
                if (op === FIELD_OP_SKIP_FIXED) {
                  o += size;
                  if (o > data.length) {
                    throw new Error('plan SKIP_FIXED past end of data');
                  }
                } else if (op === FIELD_OP_SKIP_OPTION) {
                  if (o >= data.length) {
                    throw new Error('plan SKIP_OPTION read past end');
                  }
                  const tag = data[o];
                  o += 1;
                  if (tag !== 0) {
                    o += size;
                    if (o > data.length) {
                      throw new Error('plan SKIP_OPTION Some past end');
                    }
                  }
                } else {
                  throw new Error(`unknown plan op ${op}`);
                }
              }

              if (o + targetLen > data.length) {
                throw new Error(
                  `SEED_ACCOUNT_FIELD slice [${o}, ${o + targetLen}) exceeds account data len ${data.length}`
                );
              }
              seeds.push(Buffer.from(data.subarray(o, o + targetLen)));
              break;
            }
          }
        }

        const [pda] = PublicKey.findProgramAddressSync(seeds, progPubkey);
        resolved = pda.toBase58();
        break;
      }
      default:
        continue;
    }

    if (!resolved) continue;

    // VAULT and PDA sources sign via invoke_signed in CPI, not at the transaction level.
    // HAS_ONE has no client-side keypair either.
    const txSigner = isSigner && source !== SOURCE_VAULT && source !== SOURCE_PDA && source !== SOURCE_HAS_ONE;
    let role: number;
    if (writable && txSigner) role = ROLE_WRITABLE_SIGNER;
    else if (writable) role = ROLE_WRITABLE;
    else if (txSigner) role = ROLE_READONLY_SIGNER;
    else role = ROLE_READONLY;

    results.push({ address: address(resolved), role });
  }

  return results;
}

/**
 * Walk params_data to find a pubkey at param index `paramIdx`.
 * Mirrors CLI's read_param_address().
 */
function readParamAddress(
  rawIntent: Buffer,
  paramsData: Uint8Array,
  paramIdx: number,
  proposerCount: number,
  approverCount: number
): PublicKey | null {
  const paramsEntryOffset =
    PREFIX_LEN +
    INTENT_HEADER_SIZE +
    proposerCount * 32 +
    approverCount * 32;

  let offset = 0;
  for (let i = 0; i < paramIdx; i++) {
    const entryOff = paramsEntryOffset + i * PARAM_ENTRY_SIZE;
    if (entryOff + PARAM_ENTRY_SIZE > rawIntent.length) return null;
    const pt = rawIntent[entryOff + 12]; // paramType byte
    const size = paramTypeSize(pt);
    if (size === 0) {
      // String: u16 len + bytes
      if (offset + 2 > paramsData.length) return null;
      const slen = paramsData[offset] | (paramsData[offset + 1] << 8);
      offset += 2 + slen;
    } else {
      offset += size;
    }
  }

  if (offset + 32 > paramsData.length) return null;
  return new PublicKey(paramsData.slice(offset, offset + 32));
}

/**
 * Walk params_data to get raw bytes for param at `paramIdx`.
 * Mirrors on-chain read_param_bytes().
 */
function readParamBytes(
  rawIntent: Buffer,
  paramsData: Uint8Array,
  paramIdx: number,
  proposerCount: number,
  approverCount: number,
  paramCount: number
): Uint8Array | null {
  const paramsEntryOffset =
    PREFIX_LEN +
    INTENT_HEADER_SIZE +
    proposerCount * 32 +
    approverCount * 32;

  let offset = 0;
  for (let i = 0; i < paramIdx; i++) {
    const entryOff = paramsEntryOffset + i * PARAM_ENTRY_SIZE;
    if (entryOff + PARAM_ENTRY_SIZE > rawIntent.length) return null;
    const pt = rawIntent[entryOff + 12]; // paramType byte
    const size = paramTypeSize(pt);
    if (size === 0) {
      if (offset + 2 > paramsData.length) return null;
      const slen = paramsData[offset] | (paramsData[offset + 1] << 8);
      offset += 2 + slen;
    } else {
      offset += size;
    }
  }

  if (paramIdx >= paramCount) return null;
  const entryOff = paramsEntryOffset + paramIdx * PARAM_ENTRY_SIZE;
  if (entryOff + PARAM_ENTRY_SIZE > rawIntent.length) return null;
  const pt = rawIntent[entryOff + 12];
  const size = paramTypeSize(pt);
  if (size === 0) {
    // String: u16 len prefix + bytes
    if (offset + 2 > paramsData.length) return null;
    const slen = paramsData[offset] | (paramsData[offset + 1] << 8);
    if (offset + 2 + slen > paramsData.length) return null;
    return paramsData.slice(offset, offset + 2 + slen);
  } else {
    if (offset + size > paramsData.length) return null;
    return paramsData.slice(offset, offset + size);
  }
}
