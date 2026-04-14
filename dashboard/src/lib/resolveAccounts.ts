/**
 * Resolve remaining accounts for the execute instruction.
 *
 * Matches the CLI logic in cli/src/commands/execute.rs:
 * - SOURCE_STATIC: read pubkey from byte pool
 * - SOURCE_PARAM: read pubkey from params_data
 * - SOURCE_VAULT: use vault PDA
 * - SOURCE_PDA / SOURCE_HAS_ONE: skipped (same as CLI)
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

  const bytePoolOffset =
    PREFIX_LEN +
    INTENT_HEADER_SIZE +
    proposerCount * 32 +
    approverCount * 32 +
    paramCount * PARAM_ENTRY_SIZE +
    accountCount * ACCOUNT_ENTRY_SIZE +
    instructionCount * INSTRUCTION_ENTRY_SIZE +
    dataSegmentCount * DATA_SEGMENT_ENTRY_SIZE +
    seedCount * SEED_ENTRY_SIZE;

  const paramsData = proposal.paramsData;
  const results: ResolvedAccount[] = [];
  let skippedPDA = false;

  for (let a = 0; a < accountCount; a++) {
    const entryOffset = accountsOffset + a * ACCOUNT_ENTRY_SIZE;
    if (entryOffset + ACCOUNT_ENTRY_SIZE > rawIntent.length) break;

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
      case SOURCE_PDA:
      case SOURCE_HAS_ONE:
        skippedPDA = true;
        continue;
      default:
        continue;
    }

    if (!resolved) continue;

    let role: number;
    if (writable && isSigner) role = ROLE_WRITABLE_SIGNER;
    else if (writable) role = ROLE_WRITABLE;
    else if (isSigner) role = ROLE_READONLY_SIGNER;
    else role = ROLE_READONLY;

    results.push({ address: address(resolved), role });
  }

  if (skippedPDA) {
    console.warn(
      'Execute: skipped SOURCE_PDA/SOURCE_HAS_ONE accounts — not yet supported'
    );
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
