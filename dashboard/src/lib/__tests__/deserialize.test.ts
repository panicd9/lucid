import { describe, it, expect } from 'vitest';
import {
  deserializeWallet,
  deserializeIntent,
  deserializeProposal,
  countBits,
} from '../deserialize';
import {
  DISC_WALLET,
  DISC_INTENT,
  DISC_PROPOSAL,
  PREFIX_LEN,
  PARAM_ENTRY_SIZE,
  ACCOUNT_ENTRY_SIZE,
  INSTRUCTION_ENTRY_SIZE,
  DATA_SEGMENT_ENTRY_SIZE,
  SEED_ENTRY_SIZE,
} from '../constants';
import { PublicKey } from '@solana/web3.js';

// ─── Helpers ────────────────────────────────────────────────────────

function buildWalletBuffer(opts: {
  proposalIndex?: bigint;
  intentCount?: number;
  frozen?: boolean;
  bump?: number;
  name?: string;
}): Buffer {
  const buf = Buffer.alloc(82, 0); // PREFIX_LEN(2) + WALLET_DATA_LEN(80)
  buf[0] = DISC_WALLET; // discriminator
  buf[1] = 1; // version
  if (opts.proposalIndex !== undefined) buf.writeBigUInt64LE(opts.proposalIndex, 2);
  buf[10] = opts.intentCount ?? 3;
  buf[11] = opts.frozen ? 1 : 0;
  buf[12] = opts.bump ?? 255;
  const name = opts.name ?? 'test';
  buf[13] = name.length;
  // skip 4 reserved bytes (14-17)
  // skip 32-byte create_key (18-49) — left as zeros
  Buffer.from(name).copy(buf, 50);
  return buf;
}

function buildIntentBuffer(opts: {
  wallet?: Buffer;
  targetProgram?: Buffer;
  timelockSeconds?: number;
  activeProposalCount?: number;
  bump?: number;
  intentIndex?: number;
  intentType?: number;
  approved?: boolean;
  approvalThreshold?: number;
  cancellationThreshold?: number;
  proposerCount?: number;
  approverCount?: number;
  paramCount?: number;
  accountCount?: number;
  instructionCount?: number;
  dataSegmentCount?: number;
  seedCount?: number;
  proposers?: Buffer[];
  approvers?: Buffer[];
  params?: Buffer[];
  accounts?: Buffer[];
  instructions?: Buffer[];
  dataSegments?: Buffer[];
  seeds?: Buffer[];
  bytePool?: Buffer;
}): Buffer {
  const proposerCount = opts.proposerCount ?? (opts.proposers?.length ?? 0);
  const approverCount = opts.approverCount ?? (opts.approvers?.length ?? 0);
  const paramCount = opts.paramCount ?? (opts.params?.length ?? 0);
  const accountCount = opts.accountCount ?? (opts.accounts?.length ?? 0);
  const instructionCount = opts.instructionCount ?? (opts.instructions?.length ?? 0);
  const dataSegmentCount = opts.dataSegmentCount ?? (opts.dataSegments?.length ?? 0);
  const seedCount = opts.seedCount ?? (opts.seeds?.length ?? 0);
  const bytePool = opts.bytePool ?? Buffer.alloc(0);

  const variableLen =
    proposerCount * 32 +
    approverCount * 32 +
    paramCount * PARAM_ENTRY_SIZE +
    accountCount * ACCOUNT_ENTRY_SIZE +
    instructionCount * INSTRUCTION_ENTRY_SIZE +
    dataSegmentCount * DATA_SEGMENT_ENTRY_SIZE +
    seedCount * SEED_ENTRY_SIZE +
    bytePool.length;

  const totalLen = PREFIX_LEN + 88 + variableLen;
  const buf = Buffer.alloc(totalLen, 0);

  let offset = 0;
  buf[offset++] = DISC_INTENT; // disc
  buf[offset++] = 1; // version

  // wallet (32 bytes)
  const walletBuf = opts.wallet ?? Buffer.alloc(32, 0);
  walletBuf.copy(buf, offset);
  offset += 32;

  // targetProgram (32 bytes)
  const targetProgramBuf = opts.targetProgram ?? Buffer.alloc(32, 0);
  targetProgramBuf.copy(buf, offset);
  offset += 32;

  // timelockSeconds (u32 LE)
  buf.writeUInt32LE(opts.timelockSeconds ?? 0, offset);
  offset += 4;

  // activeProposalCount (u16 LE)
  buf.writeUInt16LE(opts.activeProposalCount ?? 0, offset);
  offset += 2;

  // bytePoolLen (u16 LE)
  buf.writeUInt16LE(bytePool.length, offset);
  offset += 2;

  buf[offset++] = opts.bump ?? 254;
  buf[offset++] = opts.intentIndex ?? 0;
  buf[offset++] = opts.intentType ?? 0;
  buf[offset++] = opts.approved ? 1 : 0;
  buf[offset++] = opts.approvalThreshold ?? 1;
  buf[offset++] = opts.cancellationThreshold ?? 1;
  buf[offset++] = proposerCount;
  buf[offset++] = approverCount;
  buf[offset++] = paramCount;
  buf[offset++] = accountCount;
  buf[offset++] = instructionCount;
  buf[offset++] = dataSegmentCount;
  buf[offset++] = seedCount;

  offset += 3; // reserved

  // We should now be at PREFIX_LEN + 88 = 90
  // Proposers
  for (const p of opts.proposers ?? []) {
    p.copy(buf, offset);
    offset += 32;
  }

  // Approvers
  for (const a of opts.approvers ?? []) {
    a.copy(buf, offset);
    offset += 32;
  }

  // Params
  for (const p of opts.params ?? []) {
    p.copy(buf, offset);
    offset += PARAM_ENTRY_SIZE;
  }

  // Accounts
  for (const a of opts.accounts ?? []) {
    a.copy(buf, offset);
    offset += ACCOUNT_ENTRY_SIZE;
  }

  // Instructions
  for (const instr of opts.instructions ?? []) {
    instr.copy(buf, offset);
    offset += INSTRUCTION_ENTRY_SIZE;
  }

  // Data segments
  for (const ds of opts.dataSegments ?? []) {
    ds.copy(buf, offset);
    offset += DATA_SEGMENT_ENTRY_SIZE;
  }

  // Seeds
  for (const s of opts.seeds ?? []) {
    s.copy(buf, offset);
    offset += SEED_ENTRY_SIZE;
  }

  // Byte pool
  bytePool.copy(buf, offset);

  return buf;
}

function buildProposalBuffer(opts: {
  wallet?: Buffer;
  intent?: Buffer;
  proposalIndex?: bigint;
  proposer?: Buffer;
  approvalBitmap?: number;
  cancellationBitmap?: number;
  status?: number;
  bump?: number;
  proposedAt?: bigint;
  approvedAt?: bigint;
  rentRefund?: Buffer;
  paramsData?: Buffer;
}): Buffer {
  const paramsData = opts.paramsData ?? Buffer.alloc(0);
  const totalLen = PREFIX_LEN + 168 + paramsData.length;
  const buf = Buffer.alloc(totalLen, 0);

  let offset = 0;
  buf[offset++] = DISC_PROPOSAL;
  buf[offset++] = 1; // version

  // wallet (32)
  (opts.wallet ?? Buffer.alloc(32, 0)).copy(buf, offset);
  offset += 32;

  // intent (32)
  (opts.intent ?? Buffer.alloc(32, 0)).copy(buf, offset);
  offset += 32;

  // proposalIndex (u64 LE)
  buf.writeBigUInt64LE(opts.proposalIndex ?? 0n, offset);
  offset += 8;

  // proposer (32)
  (opts.proposer ?? Buffer.alloc(32, 0)).copy(buf, offset);
  offset += 32;

  // approvalBitmap (u16 LE)
  buf.writeUInt16LE(opts.approvalBitmap ?? 0, offset);
  offset += 2;

  // cancellationBitmap (u16 LE)
  buf.writeUInt16LE(opts.cancellationBitmap ?? 0, offset);
  offset += 2;

  // status (u8)
  buf[offset++] = opts.status ?? 0;

  // bump (u8)
  buf[offset++] = opts.bump ?? 253;

  // pad (2 bytes)
  offset += 2;

  // proposedAt (i64 LE)
  buf.writeBigInt64LE(opts.proposedAt ?? 0n, offset);
  offset += 8;

  // approvedAt (i64 LE)
  buf.writeBigInt64LE(opts.approvedAt ?? 0n, offset);
  offset += 8;

  // rentRefund (32)
  (opts.rentRefund ?? Buffer.alloc(32, 0)).copy(buf, offset);
  offset += 32;

  // paramsDataLen (u16 LE)
  buf.writeUInt16LE(paramsData.length, offset);
  offset += 2;

  // reserved (6)
  offset += 6;

  // paramsData
  paramsData.copy(buf, offset);

  return buf;
}

function makeKey(seed: number): Buffer {
  const buf = Buffer.alloc(32, 0);
  buf[0] = seed;
  return buf;
}

function buildParamEntry(opts: {
  constraintValue?: bigint;
  nameOffset?: number;
  nameLen?: number;
  paramType?: number;
  constraintType?: number;
}): Buffer {
  const buf = Buffer.alloc(PARAM_ENTRY_SIZE, 0);
  buf.writeBigUInt64LE(opts.constraintValue ?? 0n, 0);
  buf.writeUInt16LE(opts.nameOffset ?? 0, 8);
  buf.writeUInt16LE(opts.nameLen ?? 0, 10);
  buf[12] = opts.paramType ?? 0;
  buf[13] = opts.constraintType ?? 0;
  // bytes 14-15 are padding
  return buf;
}

// ─── Wallet Tests ───────────────────────────────────────────────────

describe('deserializeWallet', () => {
  it('parses a basic wallet buffer correctly', () => {
    const buf = buildWalletBuffer({
      proposalIndex: 42n,
      intentCount: 5,
      frozen: false,
      bump: 254,
      name: 'treasury',
    });
    const wallet = deserializeWallet(buf);
    expect(wallet.proposalIndex).toBe(42n);
    expect(wallet.intentCount).toBe(5);
    expect(wallet.frozen).toBe(false);
    expect(wallet.bump).toBe(254);
    expect(wallet.name).toBe('treasury');
  });

  it('parses frozen=true when byte 11 is 1', () => {
    const buf = buildWalletBuffer({ frozen: true });
    const wallet = deserializeWallet(buf);
    expect(wallet.frozen).toBe(true);
  });

  it('parses frozen=false when byte 11 is 0', () => {
    const buf = buildWalletBuffer({ frozen: false });
    const wallet = deserializeWallet(buf);
    expect(wallet.frozen).toBe(false);
  });

  it('throws on wrong discriminator', () => {
    const buf = buildWalletBuffer({});
    buf[0] = 0xFF;
    expect(() => deserializeWallet(buf)).toThrow('Invalid wallet discriminator');
  });

  it('throws on truncated buffer (30 bytes)', () => {
    const buf = Buffer.alloc(30, 0);
    buf[0] = DISC_WALLET;
    buf[1] = 1;
    expect(() => deserializeWallet(buf)).toThrow('data too short');
  });

  it('parses empty name when name_len=0', () => {
    const buf = buildWalletBuffer({ name: '' });
    const wallet = deserializeWallet(buf);
    expect(wallet.name).toBe('');
  });
});

// ─── Intent Tests ───────────────────────────────────────────────────

describe('deserializeIntent', () => {
  it('parses intent with 1 proposer, 1 approver, 1 param, and a template', () => {
    const proposerKey = makeKey(0xAA);
    const approverKey = makeKey(0xBB);

    // Build byte pool: template_offset(u16)=4, template_len(u16)=18, then "transfer {amount}" (18 bytes)
    // Also put param name "amount" at offset 22 (4 + 18 = 22), length 6
    const templateStr = 'transfer {amount}';
    const paramName = 'amount';
    const templateBytes = Buffer.from(templateStr);
    const paramNameBytes = Buffer.from(paramName);

    // byte pool layout:
    //   [0..1] template_offset = 4 (u16 LE)
    //   [2..3] template_len = length of templateStr (u16 LE)
    //   [4..4+templateStr.length-1] template string
    //   [4+templateStr.length..] param name string
    const bytePoolLen = 4 + templateBytes.length + paramNameBytes.length;
    const bytePool = Buffer.alloc(bytePoolLen, 0);
    bytePool.writeUInt16LE(4, 0); // template_offset
    bytePool.writeUInt16LE(templateBytes.length, 2); // template_len
    templateBytes.copy(bytePool, 4);
    paramNameBytes.copy(bytePool, 4 + templateBytes.length);

    // Param entry: nameOffset points into byte pool relative to bytePoolStart
    // paramName is at bytePool offset 4 + templateStr.length = 4+17 = 21
    const paramNameOffset = 4 + templateBytes.length;
    const param = buildParamEntry({
      constraintValue: 1000000n,
      nameOffset: paramNameOffset,
      nameLen: paramNameBytes.length,
      paramType: 1, // u64
      constraintType: 1, // Max
    });

    const buf = buildIntentBuffer({
      timelockSeconds: 3600,
      bump: 252,
      intentIndex: 0,
      intentType: 3,
      approved: true,
      approvalThreshold: 2,
      cancellationThreshold: 1,
      proposers: [proposerKey],
      approvers: [approverKey],
      params: [param],
      bytePool,
    });

    const intent = deserializeIntent(buf);
    expect(intent.timelockSeconds).toBe(3600);
    expect(intent.bump).toBe(252);
    expect(intent.intentIndex).toBe(0);
    expect(intent.intentType).toBe(3);
    expect(intent.approved).toBe(true);
    expect(intent.approvalThreshold).toBe(2);
    expect(intent.cancellationThreshold).toBe(1);
    expect(intent.proposerCount).toBe(1);
    expect(intent.approverCount).toBe(1);
    expect(intent.paramCount).toBe(1);
    expect(intent.proposers).toHaveLength(1);
    expect(intent.proposers[0].toBuffer()).toEqual(proposerKey);
    expect(intent.approvers).toHaveLength(1);
    expect(intent.approvers[0].toBuffer()).toEqual(approverKey);
    expect(intent.template).toBe('transfer {amount}');
    expect(intent.params[0].name).toBe('amount');
    expect(intent.params[0].constraintValue).toBe(1000000n);
    expect(intent.params[0].paramType).toBe(1);
    expect(intent.params[0].constraintType).toBe(1);
    expect(intent.bytePoolLen).toBe(bytePoolLen);
  });

  it('throws on wrong discriminator', () => {
    const buf = buildIntentBuffer({});
    buf[0] = 0xFF;
    expect(() => deserializeIntent(buf)).toThrow('Invalid intent discriminator');
  });

  it('throws when proposer_count > 16', () => {
    // Build a buffer with proposerCount=17 in the header but don't bother adding actual proposer data
    // The validation for MAX_SIGNERS happens before the length check
    const buf = Buffer.alloc(PREFIX_LEN + 88, 0);
    buf[0] = DISC_INTENT;
    buf[1] = 1;
    // proposerCount is at offset PREFIX_LEN + 32 + 32 + 4 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 1 = PREFIX_LEN + 78
    buf[PREFIX_LEN + 78] = 17; // proposerCount = 17
    buf[PREFIX_LEN + 79] = 0;  // approverCount = 0
    expect(() => deserializeIntent(buf)).toThrow('Invalid signer counts');
  });

  it('throws when data is truncated for declared arrays', () => {
    // Create header that claims 2 proposers but buffer is too short
    const buf = Buffer.alloc(PREFIX_LEN + 88, 0);
    buf[0] = DISC_INTENT;
    buf[1] = 1;
    // proposerCount at offset PREFIX_LEN + 78
    buf[PREFIX_LEN + 78] = 2; // 2 proposers = 64 bytes needed after header
    buf[PREFIX_LEN + 79] = 0; // 0 approvers
    expect(() => deserializeIntent(buf)).toThrow('truncated');
  });
});

// ─── Proposal Tests ─────────────────────────────────────────────────

describe('deserializeProposal', () => {
  it('parses an active proposal with known bitmaps', () => {
    const walletKey = makeKey(0x01);
    const intentKey = makeKey(0x02);
    const proposerKey = makeKey(0x03);
    const refundKey = makeKey(0x04);

    const buf = buildProposalBuffer({
      wallet: walletKey,
      intent: intentKey,
      proposalIndex: 7n,
      proposer: proposerKey,
      approvalBitmap: 0b0011,
      cancellationBitmap: 0b0000,
      status: 0, // Active
      bump: 250,
      proposedAt: 1700000000n,
      approvedAt: 0n,
      rentRefund: refundKey,
      paramsData: Buffer.from([0xDE, 0xAD]),
    });

    const proposal = deserializeProposal(buf);
    expect(proposal.wallet.toBuffer()).toEqual(walletKey);
    expect(proposal.intent.toBuffer()).toEqual(intentKey);
    expect(proposal.proposalIndex).toBe(7n);
    expect(proposal.proposer.toBuffer()).toEqual(proposerKey);
    expect(proposal.approvalBitmap).toBe(3);
    expect(proposal.cancellationBitmap).toBe(0);
    expect(proposal.status).toBe(0);
    expect(proposal.bump).toBe(250);
    expect(proposal.proposedAt).toBe(1700000000n);
    expect(proposal.approvedAt).toBe(0n);
    expect(proposal.rentRefund.toBuffer()).toEqual(refundKey);
    expect(proposal.paramsDataLen).toBe(2);
    expect(Buffer.from(proposal.paramsData)).toEqual(Buffer.from([0xDE, 0xAD]));
  });

  it('parses an approved proposal with approval bitmap 0b0111', () => {
    const buf = buildProposalBuffer({
      status: 1, // Approved
      approvalBitmap: 0b0111,
    });

    const proposal = deserializeProposal(buf);
    expect(proposal.status).toBe(1);
    expect(proposal.approvalBitmap).toBe(7);
  });

  it('throws on truncated proposal buffer', () => {
    const buf = Buffer.alloc(50, 0);
    buf[0] = DISC_PROPOSAL;
    buf[1] = 1;
    expect(() => deserializeProposal(buf)).toThrow('data too short');
  });
});

// ─── countBits Tests ────────────────────────────────────────────────

describe('countBits', () => {
  it('returns 0 for bitmap 0', () => {
    expect(countBits(0)).toBe(0);
  });

  it('returns 1 for bitmap 1', () => {
    expect(countBits(1)).toBe(1);
  });

  it('returns 3 for bitmap 7 (0b111)', () => {
    expect(countBits(7)).toBe(3);
  });

  it('returns 16 for bitmap 0xFFFF', () => {
    expect(countBits(0xFFFF)).toBe(16);
  });
});
