/**
 * Kit-native instruction builders for Lucid program.
 *
 * Uses @solana/kit Instruction type with branded address() types.
 * Matches the on-chain instruction format exactly.
 */
import { address, type Address } from '@solana/kit';
import {
  ROLE_READONLY,
  ROLE_WRITABLE,
  ROLE_READONLY_SIGNER,
  ROLE_WRITABLE_SIGNER,
} from './constants';

/** Instruction type compatible with @solana/kit */
export interface LucidInstruction {
  programAddress: Address;
  accounts: Array<{
    address: Address;
    role: number;
  }>;
  data: Uint8Array;
}

// Well-known addresses
const ED25519_PROGRAM = address('Ed25519SigVerify111111111111111111111111111');
const SYSVAR_INSTRUCTIONS = address('Sysvar1nstructions1111111111111111111111111');
export const SYSTEM_PROGRAM_ADDR = address('11111111111111111111111111111111');
export const LUCID_PROGRAM_ADDR = address('LUC5TbUhLpT2dZuC2qA4vMZdxJXsbcsUVejTqLJBJWR');

/**
 * Build Ed25519 precompile instruction from a pre-existing signature.
 *
 * This is used when the signature comes from wallet signMessage(),
 * not from a keypair. We build the instruction data manually.
 *
 * Layout:
 *   [0]:     num_signatures (u8) = 1
 *   [1]:     padding (u8) = 0
 *   [2-3]:   signature_offset (u16 LE) = 16
 *   [4-5]:   signature_instruction_index (u16 LE) = 0xFFFF (this instruction)
 *   [6-7]:   public_key_offset (u16 LE) = 80
 *   [8-9]:   public_key_instruction_index (u16 LE) = 0xFFFF
 *   [10-11]: message_data_offset (u16 LE) = 112
 *   [12-13]: message_data_size (u16 LE) = message.length
 *   [14-15]: message_instruction_index (u16 LE) = 0xFFFF
 *   [16-79]: signature (64 bytes)
 *   [80-111]: public_key (32 bytes)
 *   [112+]:  message (variable)
 */
export function buildEd25519Instruction(
  signature: Uint8Array,
  publicKey: Uint8Array,
  message: Uint8Array
): LucidInstruction {
  const HEADER_LEN = 16;
  const SIG_LEN = 64;
  const PK_LEN = 32;
  const totalLen = HEADER_LEN + SIG_LEN + PK_LEN + message.length;
  const data = new Uint8Array(totalLen);
  const view = new DataView(data.buffer);

  // Header
  data[0] = 1; // num_signatures
  data[1] = 0; // padding
  view.setUint16(2, HEADER_LEN, true); // signature_offset = 16
  view.setUint16(4, 0xffff, true); // signature_instruction_index = this ix
  view.setUint16(6, HEADER_LEN + SIG_LEN, true); // public_key_offset = 80
  view.setUint16(8, 0xffff, true); // public_key_instruction_index = this ix
  view.setUint16(10, HEADER_LEN + SIG_LEN + PK_LEN, true); // message_data_offset = 112
  view.setUint16(12, message.length, true); // message_data_size
  view.setUint16(14, 0xffff, true); // message_instruction_index = this ix

  // Payload
  data.set(signature, HEADER_LEN);
  data.set(publicKey, HEADER_LEN + SIG_LEN);
  data.set(message, HEADER_LEN + SIG_LEN + PK_LEN);

  return {
    programAddress: ED25519_PROGRAM,
    accounts: [],
    data,
  };
}

/** Create wallet instruction (discriminator = 0) */
export function buildCreateWalletInstruction(
  wallet: Address,
  vault: Address,
  intent0: Address,
  intent1: Address,
  intent2: Address,
  payer: Address,
  createKey: Uint8Array,
  name: string,
  proposers: Uint8Array[],
  approvers: Uint8Array[],
  approvalThreshold: number,
  cancellationThreshold: number,
  timelockSeconds: number,
): LucidInstruction {
  const nameBytes = new TextEncoder().encode(name);
  // Data: [0, create_key(32), name_len(1), name_bytes, proposer_count(1),
  //   proposer_pubkeys(32 each), approver_count(1), approver_pubkeys(32 each),
  //   approval_threshold(1), cancellation_threshold(1), timelock(u32 LE)]
  const dataLen = 1 + 32 + 1 + nameBytes.length + 1 + proposers.length * 32 + 1 + approvers.length * 32 + 1 + 1 + 4;
  const data = new Uint8Array(dataLen);
  let offset = 0;
  data[offset++] = 0; // discriminator
  data.set(createKey, offset); offset += 32;
  data[offset++] = nameBytes.length;
  data.set(nameBytes, offset); offset += nameBytes.length;
  data[offset++] = proposers.length;
  for (const p of proposers) { data.set(p, offset); offset += 32; }
  data[offset++] = approvers.length;
  for (const a of approvers) { data.set(a, offset); offset += 32; }
  data[offset++] = approvalThreshold;
  data[offset++] = cancellationThreshold;
  new DataView(data.buffer).setUint32(offset, timelockSeconds, true);

  return {
    programAddress: LUCID_PROGRAM_ADDR,
    accounts: [
      { address: wallet, role: ROLE_WRITABLE },
      { address: vault, role: ROLE_WRITABLE },
      { address: intent0, role: ROLE_WRITABLE },
      { address: intent1, role: ROLE_WRITABLE },
      { address: intent2, role: ROLE_WRITABLE },
      { address: payer, role: ROLE_WRITABLE_SIGNER },
      { address: SYSTEM_PROGRAM_ADDR, role: ROLE_READONLY },
    ],
    data,
  };
}

/** Propose instruction (discriminator = 10) */
export function buildProposeInstruction(
  wallet: Address,
  intent: Address,
  proposal: Address,
  payer: Address,
  proposalIndex: bigint,
  paramsData: Uint8Array
): LucidInstruction {
  // Data: [10, proposalIndex(u64 LE), ...paramsData]
  const data = new Uint8Array(1 + 8 + paramsData.length);
  data[0] = 10;
  new DataView(data.buffer).setBigUint64(1, proposalIndex, true);
  data.set(paramsData, 9);

  return {
    programAddress: LUCID_PROGRAM_ADDR,
    accounts: [
      { address: wallet, role: ROLE_WRITABLE },
      { address: intent, role: ROLE_WRITABLE },
      { address: proposal, role: ROLE_WRITABLE },
      { address: SYSVAR_INSTRUCTIONS, role: ROLE_READONLY },
      { address: payer, role: ROLE_WRITABLE_SIGNER },
      { address: SYSTEM_PROGRAM_ADDR, role: ROLE_READONLY },
    ],
    data,
  };
}

/** Approve instruction (discriminator = 11) */
export function buildApproveInstruction(
  wallet: Address,
  intent: Address,
  proposal: Address
): LucidInstruction {
  return {
    programAddress: LUCID_PROGRAM_ADDR,
    accounts: [
      { address: wallet, role: ROLE_READONLY },
      { address: intent, role: ROLE_READONLY },
      { address: proposal, role: ROLE_WRITABLE },
      { address: SYSVAR_INSTRUCTIONS, role: ROLE_READONLY },
    ],
    data: new Uint8Array([11]),
  };
}

/** Cancel instruction (discriminator = 12) */
export function buildCancelInstruction(
  wallet: Address,
  intent: Address,
  proposal: Address
): LucidInstruction {
  return {
    programAddress: LUCID_PROGRAM_ADDR,
    accounts: [
      { address: wallet, role: ROLE_READONLY },
      { address: intent, role: ROLE_READONLY },
      { address: proposal, role: ROLE_WRITABLE },
      { address: SYSVAR_INSTRUCTIONS, role: ROLE_READONLY },
    ],
    data: new Uint8Array([12]),
  };
}

/** Execute instruction (discriminator = 20) */
export function buildExecuteInstruction(
  wallet: Address,
  vault: Address,
  intent: Address,
  proposal: Address,
  eventAuthority: Address,
  remainingAccounts: Array<{ address: Address; role: number }>
): LucidInstruction {
  return {
    programAddress: LUCID_PROGRAM_ADDR,
    accounts: [
      { address: wallet, role: ROLE_WRITABLE },
      { address: vault, role: ROLE_READONLY },
      { address: intent, role: ROLE_WRITABLE },
      { address: proposal, role: ROLE_WRITABLE },
      { address: eventAuthority, role: ROLE_READONLY },
      { address: LUCID_PROGRAM_ADDR, role: ROLE_READONLY },
      ...remainingAccounts,
    ],
    data: new Uint8Array([20]),
  };
}
