import { PublicKey } from '@solana/web3.js';
import {
  PREFIX_LEN,
  DISC_WALLET,
  DISC_INTENT,
  DISC_PROPOSAL,
  PARAM_ENTRY_SIZE,
  ACCOUNT_ENTRY_SIZE,
  INSTRUCTION_ENTRY_SIZE,
  DATA_SEGMENT_ENTRY_SIZE,
  SEED_ENTRY_SIZE,
} from './constants';

// ─── Wallet ──────────────────────────────────────────────────────────

export interface WalletAccount {
  proposalIndex: bigint;
  intentCount: number;
  frozen: boolean;
  bump: number;
  createKey: PublicKey;
  name: string;
}

const MAX_SIGNERS = 16;
const WALLET_MIN_LEN = PREFIX_LEN + 80; // header + data

export function deserializeWallet(data: Buffer): WalletAccount {
  if (data.length < WALLET_MIN_LEN) {
    throw new Error(`Wallet data too short: ${data.length} < ${WALLET_MIN_LEN}`);
  }
  if (data[0] !== DISC_WALLET) {
    throw new Error(`Invalid wallet discriminator: ${data[0]}`);
  }

  let offset = PREFIX_LEN;

  const proposalIndex = data.readBigUInt64LE(offset);
  offset += 8;

  const intentCount = data[offset++];
  const frozen = data[offset++] !== 0;
  const bump = data[offset++];
  const nameLen = data[offset++];

  if (nameLen > 32) {
    throw new Error(`Invalid wallet name length: ${nameLen}`);
  }

  offset += 4; // reserved

  const createKey = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  if (offset + nameLen > data.length) {
    throw new Error('Wallet data truncated: name extends beyond buffer');
  }
  const name = data.subarray(offset, offset + nameLen).toString('utf-8');

  return { proposalIndex, intentCount, frozen, bump, createKey, name };
}

// ─── IntentHeader ────────────────────────────────────────────────────

export interface ParamEntry {
  constraintValue: bigint;
  nameOffset: number;
  nameLen: number;
  paramType: number;
  constraintType: number;
  name: string; // resolved from byte_pool
}

export interface AccountEntry {
  source: number;
  writable: boolean;
  isSigner: boolean;
  sourceData: Uint8Array;
}

export interface InstructionEntry {
  programAccountIndex: number;
  accountStartIndex: number;
  accountCount: number;
  dataSegmentStartIndex: number;
  dataSegmentCount: number;
}

export interface DataSegmentEntry {
  segmentType: number;
  segmentData: Uint8Array;
}

export interface SeedEntry {
  seedType: number;
  seedData: Uint8Array;
}

export interface IntentAccount {
  wallet: PublicKey;
  targetProgram: PublicKey;
  timelockSeconds: number;
  activeProposalCount: number;
  bytePoolLen: number;
  bump: number;
  intentIndex: number;
  intentType: number;
  approved: boolean;
  approvalThreshold: number;
  cancellationThreshold: number;
  proposerCount: number;
  approverCount: number;
  paramCount: number;
  accountCount: number;
  instructionCount: number;
  dataSegmentCount: number;
  seedCount: number;
  // Variable data
  proposers: PublicKey[];
  approvers: PublicKey[];
  params: ParamEntry[];
  accounts: AccountEntry[];
  instructions: InstructionEntry[];
  dataSegments: DataSegmentEntry[];
  seeds: SeedEntry[];
  template: string;
}

const INTENT_HEADER_MIN_LEN = PREFIX_LEN + 88;

export function deserializeIntent(data: Buffer): IntentAccount {
  if (data.length < INTENT_HEADER_MIN_LEN) {
    throw new Error(`Intent data too short: ${data.length} < ${INTENT_HEADER_MIN_LEN}`);
  }
  if (data[0] !== DISC_INTENT) {
    throw new Error(`Invalid intent discriminator: ${data[0]}`);
  }

  let offset = PREFIX_LEN;

  const wallet = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const targetProgram = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const timelockSeconds = data.readUInt32LE(offset);
  offset += 4;

  const activeProposalCount = data.readUInt16LE(offset);
  offset += 2;

  const bytePoolLen = data.readUInt16LE(offset);
  offset += 2;

  const bump = data[offset++];
  const intentIndex = data[offset++];
  const intentType = data[offset++];
  const approved = data[offset++] !== 0;
  const approvalThreshold = data[offset++];
  const cancellationThreshold = data[offset++];
  const proposerCount = data[offset++];
  const approverCount = data[offset++];
  const paramCount = data[offset++];
  const accountCount = data[offset++];
  const instructionCount = data[offset++];
  const dataSegmentCount = data[offset++];
  const seedCount = data[offset++];

  offset += 3; // reserved

  // Validate counts are reasonable before looping
  if (proposerCount > MAX_SIGNERS || approverCount > MAX_SIGNERS) {
    throw new Error(`Invalid signer counts: proposers=${proposerCount}, approvers=${approverCount}`);
  }

  // Validate we have enough data for all variable arrays
  const expectedLen = offset
    + (proposerCount * 32)
    + (approverCount * 32)
    + (paramCount * PARAM_ENTRY_SIZE)
    + (accountCount * ACCOUNT_ENTRY_SIZE)
    + (instructionCount * INSTRUCTION_ENTRY_SIZE)
    + (dataSegmentCount * DATA_SEGMENT_ENTRY_SIZE)
    + (seedCount * SEED_ENTRY_SIZE)
    + bytePoolLen;
  if (expectedLen > data.length) {
    throw new Error(`Intent data truncated: need ${expectedLen}, have ${data.length}`);
  }

  // Proposers
  const proposers: PublicKey[] = [];
  for (let i = 0; i < proposerCount; i++) {
    proposers.push(new PublicKey(data.subarray(offset, offset + 32)));
    offset += 32;
  }

  // Approvers
  const approvers: PublicKey[] = [];
  for (let i = 0; i < approverCount; i++) {
    approvers.push(new PublicKey(data.subarray(offset, offset + 32)));
    offset += 32;
  }

  // Params
  const params: ParamEntry[] = [];
  for (let i = 0; i < paramCount; i++) {
    const constraintValue = data.readBigUInt64LE(offset);
    const nameOffset = data.readUInt16LE(offset + 8);
    const nameLen = data.readUInt16LE(offset + 10);
    const paramType = data[offset + 12];
    const constraintType = data[offset + 13];
    params.push({
      constraintValue,
      nameOffset,
      nameLen,
      paramType,
      constraintType,
      name: '', // resolved below
    });
    offset += PARAM_ENTRY_SIZE;
  }

  // Accounts
  const accounts: AccountEntry[] = [];
  for (let i = 0; i < accountCount; i++) {
    accounts.push({
      source: data[offset],
      writable: data[offset + 1] !== 0,
      isSigner: data[offset + 2] !== 0,
      sourceData: data.subarray(offset + 4, offset + 8),
    });
    offset += ACCOUNT_ENTRY_SIZE;
  }

  // Instructions
  const instructions: InstructionEntry[] = [];
  for (let i = 0; i < instructionCount; i++) {
    instructions.push({
      programAccountIndex: data[offset],
      accountStartIndex: data[offset + 1],
      accountCount: data[offset + 2],
      dataSegmentStartIndex: data[offset + 3],
      dataSegmentCount: data[offset + 4],
    });
    offset += INSTRUCTION_ENTRY_SIZE;
  }

  // Data segments
  const dataSegments: DataSegmentEntry[] = [];
  for (let i = 0; i < dataSegmentCount; i++) {
    dataSegments.push({
      segmentType: data[offset],
      segmentData: data.subarray(offset + 2, offset + 6),
    });
    offset += DATA_SEGMENT_ENTRY_SIZE;
  }

  // Seeds
  const seedsArr: SeedEntry[] = [];
  for (let i = 0; i < seedCount; i++) {
    seedsArr.push({
      seedType: data[offset],
      seedData: data.subarray(offset + 2, offset + 6),
    });
    offset += SEED_ENTRY_SIZE;
  }

  // Byte pool starts here
  const bytePoolStart = offset;

  // Template: first 4 bytes of byte pool are template_offset (u16) + template_len (u16)
  let template = '';
  if (bytePoolLen >= 4) {
    const templateOffset = data.readUInt16LE(bytePoolStart);
    const templateLen = data.readUInt16LE(bytePoolStart + 2);
    if (templateLen > 0 && bytePoolStart + templateOffset + templateLen <= data.length) {
      template = data
        .subarray(
          bytePoolStart + templateOffset,
          bytePoolStart + templateOffset + templateLen
        )
        .toString('utf-8');
    }
  }

  // Resolve param names from byte pool
  for (const p of params) {
    if (p.nameLen > 0 && bytePoolStart + p.nameOffset + p.nameLen <= data.length) {
      p.name = data
        .subarray(
          bytePoolStart + p.nameOffset,
          bytePoolStart + p.nameOffset + p.nameLen
        )
        .toString('utf-8');
    }
  }

  return {
    wallet,
    targetProgram,
    timelockSeconds,
    activeProposalCount,
    bytePoolLen,
    bump,
    intentIndex,
    intentType,
    approved,
    approvalThreshold,
    cancellationThreshold,
    proposerCount,
    approverCount,
    paramCount,
    accountCount,
    instructionCount,
    dataSegmentCount,
    seedCount,
    proposers,
    approvers,
    params,
    accounts,
    instructions,
    dataSegments,
    seeds: seedsArr,
    template,
  };
}

// ─── Proposal ────────────────────────────────────────────────────────

export interface ProposalAccount {
  wallet: PublicKey;
  intent: PublicKey;
  proposalIndex: bigint;
  proposer: PublicKey;
  approvalBitmap: number;
  cancellationBitmap: number;
  status: number;
  bump: number;
  proposedAt: bigint;
  approvedAt: bigint;
  rentRefund: PublicKey;
  paramsDataLen: number;
  paramsData: Uint8Array;
}

const PROPOSAL_MIN_LEN = PREFIX_LEN + 168;

export function deserializeProposal(data: Buffer): ProposalAccount {
  if (data.length < PROPOSAL_MIN_LEN) {
    throw new Error(`Proposal data too short: ${data.length} < ${PROPOSAL_MIN_LEN}`);
  }
  if (data[0] !== DISC_PROPOSAL) {
    throw new Error(`Invalid proposal discriminator: ${data[0]}`);
  }

  let offset = PREFIX_LEN;

  const wallet = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const intent = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const proposalIndex = data.readBigUInt64LE(offset);
  offset += 8;

  const proposer = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const approvalBitmap = data.readUInt16LE(offset);
  offset += 2;

  const cancellationBitmap = data.readUInt16LE(offset);
  offset += 2;

  const status = data[offset++];
  const bump = data[offset++];

  offset += 2; // pad

  const proposedAt = data.readBigInt64LE(offset);
  offset += 8;

  const approvedAt = data.readBigInt64LE(offset);
  offset += 8;

  const rentRefund = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const paramsDataLen = data.readUInt16LE(offset);
  offset += 2;

  offset += 6; // reserved

  if (offset + paramsDataLen > data.length) {
    throw new Error(`Proposal params data truncated: need ${offset + paramsDataLen}, have ${data.length}`);
  }
  const paramsData = data.subarray(offset, offset + paramsDataLen);

  return {
    wallet,
    intent,
    proposalIndex,
    proposer,
    approvalBitmap,
    cancellationBitmap,
    status,
    bump,
    proposedAt,
    approvedAt,
    rentRefund,
    paramsDataLen,
    paramsData,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function countBits(bitmap: number): number {
  let count = 0;
  let n = bitmap;
  while (n) {
    count += n & 1;
    n >>>= 1;
  }
  return count;
}
