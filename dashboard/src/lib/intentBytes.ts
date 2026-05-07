import bs58 from 'bs58';
import { computeTemplateHash, type CanonicalIntent } from './templateHash';
import {
  INTENT_TYPE_CUSTOM,
  PARAM_TYPE_ADDRESS,
  PARAM_TYPE_U64,
  PARAM_TYPE_I64,
  PARAM_TYPE_STRING,
  PARAM_TYPE_BOOL,
  PARAM_TYPE_U8,
  PARAM_TYPE_U16,
  PARAM_TYPE_U32,
  PARAM_TYPE_U128,
  CONSTRAINT_NONE,
  CONSTRAINT_LESS_THAN_U64,
  CONSTRAINT_GREATER_THAN_U64,
  SOURCE_STATIC,
  SOURCE_PARAM,
  SOURCE_VAULT,
  SOURCE_PDA,
  SOURCE_HAS_ONE,
  SEGMENT_LITERAL,
  SEGMENT_PARAM,
  SEED_LITERAL,
  SEED_PARAM,
  SEED_ACCOUNT,
  SEED_ACCOUNT_FIELD,
  FIELD_OP_SKIP_FIXED,
  FIELD_OP_SKIP_OPTION,
} from './constants';

const HEADER_BYTES = 120;

function paramTypeFromString(s: string): number {
  switch (s) {
    case 'address':
    case 'publicKey': return PARAM_TYPE_ADDRESS;
    case 'u64': return PARAM_TYPE_U64;
    case 'i64': return PARAM_TYPE_I64;
    case 'string': return PARAM_TYPE_STRING;
    case 'bool': return PARAM_TYPE_BOOL;
    case 'u8': return PARAM_TYPE_U8;
    case 'u16': return PARAM_TYPE_U16;
    case 'u32': return PARAM_TYPE_U32;
    case 'u128': return PARAM_TYPE_U128;
    default: throw new Error(`Unknown param type '${s}'`);
  }
}

function constraintFromString(s: string | undefined): number {
  switch (s) {
    case 'less_than': return CONSTRAINT_LESS_THAN_U64;
    case 'greater_than': return CONSTRAINT_GREATER_THAN_U64;
    default: return CONSTRAINT_NONE;
  }
}

function sourceFromString(s: string): number {
  switch (s) {
    case 'static': return SOURCE_STATIC;
    case 'param': return SOURCE_PARAM;
    case 'vault': return SOURCE_VAULT;
    case 'pda': return SOURCE_PDA;
    case 'has_one': return SOURCE_HAS_ONE;
    default: throw new Error(`Unknown account source '${s}'`);
  }
}

function fieldOpFromString(s: string): number {
  switch (s) {
    case 'skip_fixed': return FIELD_OP_SKIP_FIXED;
    case 'skip_option': return FIELD_OP_SKIP_OPTION;
    default: throw new Error(`Unknown fieldPath op '${s}'`);
  }
}

function segmentDataAsBytes(data: unknown): Uint8Array {
  if (Array.isArray(data)) {
    return Uint8Array.from(data.map((v) => Number(v) & 0xff));
  }
  if (typeof data === 'string') {
    // hex-decoded; if string ever appears here, mirror CLI's hex::decode best-effort
    const hex = data.replace(/^0x/, '');
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  return new Uint8Array(0);
}

function seedValueAsBytes(value: unknown): Uint8Array {
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value.map((v) => Number(v) & 0xff));
  }
  return new Uint8Array(0);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function u16le(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function u64le(n: bigint | number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}

/**
 * Serialize a canonical intent JSON into the on-chain byte layout that
 * AddIntent (disc=1) expects after its discriminator. Mirrors
 * `build_intent_bytes` in `cli/src/commands/wallet.rs:395+` exactly — a
 * round-trip test against the CLI catches any drift.
 *
 * The 32-byte `wallet`, 1-byte `bump`, 1-byte `intent_index`, and 1-byte
 * `approved` fields are emitted as zeroes; the program fills them in.
 */
export function serializeIntentDefinition(
  intent: CanonicalIntent & { timelockSeconds?: number },
  approvalThreshold: number,
  cancellationThreshold: number,
  proposers: Uint8Array[],
  approvers: Uint8Array[],
): Uint8Array {
  const programIdBytes = bs58.decode(intent.programId);
  if (programIdBytes.length !== 32) throw new Error('programId must be 32 bytes');

  // ── Build byte_pool while tracking offsets ──────────────────────────
  const pool: number[] = [];
  const pushBytes = (bytes: Uint8Array | number[]) => {
    for (const b of bytes) pool.push(b & 0xff);
  };

  // 1. Template at offset 0: [off:u16=0, len:u16, bytes]
  const templateBytes = new TextEncoder().encode(intent.template);
  pushBytes(u16le(0));
  pushBytes(u16le(templateBytes.length));
  pushBytes(templateBytes);

  // 2. Static account addresses
  const staticPoolOffsets = new Map<number, number>();
  intent.accounts.forEach((acct, i) => {
    if (acct.source === 'static' && typeof acct.sourceData === 'string') {
      const addr = bs58.decode(acct.sourceData as string);
      if (addr.length === 32) {
        staticPoolOffsets.set(i, pool.length);
        pushBytes(addr);
      }
    }
  });

  // 3. Target program (always present)
  const targetProgPoolOff = pool.length;
  pushBytes(programIdBytes);

  // 4. PDA program addresses
  const pdaProgPoolOffsets = new Map<number, number>();
  intent.accounts.forEach((acct, i) => {
    if (acct.source !== 'pda') return;
    const sd = acct.sourceData;
    if (sd && typeof sd === 'object' && !Array.isArray(sd)) {
      const prog = (sd as Record<string, unknown>).program;
      if (typeof prog === 'string') {
        const progBytes = bs58.decode(prog);
        if (progBytes.length === 32) {
          pdaProgPoolOffsets.set(i, pool.length);
          pushBytes(progBytes);
        }
      }
    }
  });

  // 5. Literal data segments (in order)
  const literalSegPoolOffsets: Array<{ off: number; len: number }> = [];
  for (const seg of intent.dataSegments) {
    if (seg.segmentType === 'literal') {
      const bytes = segmentDataAsBytes(seg.data);
      const off = pool.length;
      pushBytes(bytes);
      literalSegPoolOffsets.push({ off, len: bytes.length });
    }
  }

  // 6. Seed literals (in order)
  const seedLitPoolOffsets: Array<{ off: number; len: number }> = [];
  const seeds = intent.seeds ?? [];
  for (const seed of seeds) {
    if (seed.seedType === 'literal') {
      const bytes = seedValueAsBytes(seed.value);
      const off = pool.length;
      pushBytes(bytes);
      seedLitPoolOffsets.push({ off, len: bytes.length });
    }
  }

  // 7. Field plans for account_field seeds (per-seed, in seed order)
  const fieldPlanPoolOffsets: Array<number | null> = [];
  for (const seed of seeds) {
    if (seed.seedType !== 'account_field') {
      fieldPlanPoolOffsets.push(null);
      continue;
    }
    const path = seed.fieldPath;
    if (!Array.isArray(path)) throw new Error('account_field seed requires fieldPath');
    if (path.length > 0xff) throw new Error('account_field fieldPath has too many ops');
    const off = pool.length;
    fieldPlanPoolOffsets.push(off);
    pool.push(path.length & 0xff);
    for (const op of path as Array<{ op: string; size: number }>) {
      pool.push(fieldOpFromString(op.op));
      pushBytes(u16le(op.size));
    }
  }

  // 8. Param names
  const paramNameOffsets: Array<{ off: number; len: number }> = [];
  for (const param of intent.params) {
    const nb = new TextEncoder().encode(param.name);
    const off = pool.length;
    pushBytes(nb);
    paramNameOffsets.push({ off, len: nb.length });
  }

  // ── Header (120 bytes) ──────────────────────────────────────────────
  const proposerCount = proposers.length;
  const approverCount = approvers.length;
  const accountCount = intent.accounts.length + 1; // +1 for appended target_program account
  const dataSegmentCount = intent.dataSegments.length;
  const seedCount = seeds.length;
  const paramCount = intent.params.length;

  // Validate proposer/approver byte width
  for (const p of proposers) if (p.length !== 32) throw new Error('proposer must be 32 bytes');
  for (const a of approvers) if (a.length !== 32) throw new Error('approver must be 32 bytes');

  const templateHash = computeTemplateHash(intent);
  const headerParts: Uint8Array[] = [
    new Uint8Array(32),                                // wallet (zero, filled by program)
    programIdBytes,                                    // target_program
    u32le(intent.timelockSeconds ?? 0),                // timelock_seconds
    u16le(0),                                          // active_proposal_count
    u16le(pool.length),                                // byte_pool_len
    new Uint8Array([0]),                               // bump (filled by program)
    new Uint8Array([0]),                               // intent_index (filled by program)
    new Uint8Array([INTENT_TYPE_CUSTOM]),              // intent_type
    new Uint8Array([0]),                               // approved (filled by program)
    new Uint8Array([approvalThreshold]),
    new Uint8Array([cancellationThreshold]),
    new Uint8Array([proposerCount]),
    new Uint8Array([approverCount]),
    new Uint8Array([paramCount]),
    new Uint8Array([accountCount]),
    new Uint8Array([1]),                               // instruction_count
    new Uint8Array([dataSegmentCount]),
    new Uint8Array([seedCount]),
    templateHash,                                      // 32 bytes
    new Uint8Array([0, 0, 0]),                         // reserved
  ];
  const header = concatBytes(headerParts);
  if (header.length !== HEADER_BYTES) {
    throw new Error(`header size ${header.length} != ${HEADER_BYTES}`);
  }

  // ── Param entries (16 bytes each) ───────────────────────────────────
  const paramEntries: Uint8Array[] = [];
  intent.params.forEach((p, i) => {
    const constraintValue = BigInt(p.constraintValue ?? 0);
    const { off, len } = paramNameOffsets[i] ?? { off: 0, len: 0 };
    paramEntries.push(concatBytes([
      u64le(constraintValue),
      u16le(off),
      u16le(len),
      new Uint8Array([paramTypeFromString(p.paramType)]),
      new Uint8Array([constraintFromString(p.constraintType)]),
      new Uint8Array([p.displayDecimals ?? 0]),
      new Uint8Array([p.decimalsParam ?? 0]),
    ]));
  });

  // ── Account entries (8 bytes each) + target_program account ────────
  const accountEntries: Uint8Array[] = [];
  intent.accounts.forEach((acct, i) => {
    const source = sourceFromString(acct.source);
    const head = new Uint8Array([
      source,
      acct.writable ? 1 : 0,
      acct.isSigner ? 1 : 0,
      0, // pad
    ]);
    let tail: Uint8Array;
    switch (source) {
      case SOURCE_STATIC: {
        const off = staticPoolOffsets.get(i) ?? 0;
        tail = concatBytes([u16le(off), new Uint8Array([0, 0])]);
        break;
      }
      case SOURCE_PARAM: {
        const pi = typeof acct.sourceData === 'number' ? (acct.sourceData & 0xff) : 0;
        tail = new Uint8Array([pi, 0, 0, 0]);
        break;
      }
      case SOURCE_VAULT: {
        tail = new Uint8Array([0, 0, 0, 0]);
        break;
      }
      case SOURCE_PDA: {
        const sd = (acct.sourceData ?? {}) as Record<string, unknown>;
        const seedStart = Number(sd.seedStart ?? 0) & 0xff;
        const seedCnt = Number(sd.seedCount ?? 0) & 0xff;
        const progOff = pdaProgPoolOffsets.get(i) ?? targetProgPoolOff;
        tail = concatBytes([new Uint8Array([seedStart, seedCnt]), u16le(progOff)]);
        break;
      }
      case SOURCE_HAS_ONE: {
        const sd = (acct.sourceData ?? {}) as Record<string, unknown>;
        const srcIdx = Number(sd.sourceAccountIndex ?? 0) & 0xff;
        const dataOff = Number(sd.dataOffset ?? 0) & 0xffff;
        tail = concatBytes([new Uint8Array([srcIdx]), u16le(dataOff), new Uint8Array([0])]);
        break;
      }
      default:
        tail = new Uint8Array([0, 0, 0, 0]);
    }
    accountEntries.push(concatBytes([head, tail]));
  });
  // Appended target program account (always SOURCE_STATIC, readonly, non-signer)
  accountEntries.push(concatBytes([
    new Uint8Array([SOURCE_STATIC, 0, 0, 0]),
    u16le(targetProgPoolOff),
    new Uint8Array([0, 0]),
  ]));

  // ── Instruction entry (1, 8 bytes) ──────────────────────────────────
  const progAcctIdx = intent.accounts.length;
  const instructionEntry = concatBytes([
    new Uint8Array([
      progAcctIdx & 0xff,                  // program_account_index
      0,                                   // account_start_index
      intent.accounts.length & 0xff,       // account_count
      0,                                   // data_segment_start_index
      dataSegmentCount & 0xff,             // data_segment_count
    ]),
    new Uint8Array([0, 0, 0]),              // pad
  ]);

  // ── Data segment entries (6 bytes each) ─────────────────────────────
  const dataSegEntries: Uint8Array[] = [];
  let litIdx = 0;
  for (const seg of intent.dataSegments) {
    if (seg.segmentType === 'literal') {
      const { off, len } = literalSegPoolOffsets[litIdx++];
      dataSegEntries.push(concatBytes([
        new Uint8Array([SEGMENT_LITERAL, 0]),
        u16le(off),
        u16le(len),
      ]));
    } else if (seg.segmentType === 'param') {
      const pi = (seg.paramIndex ?? 0) & 0xff;
      dataSegEntries.push(new Uint8Array([SEGMENT_PARAM, 0, pi, 0, 0, 0]));
    } else {
      throw new Error(`Unknown data segment type '${seg.segmentType}'`);
    }
  }

  // ── Seed entries (6 bytes each) ─────────────────────────────────────
  const seedEntries: Uint8Array[] = [];
  let seedLitIdx = 0;
  seeds.forEach((seed, seedI) => {
    switch (seed.seedType) {
      case 'literal': {
        const { off, len } = seedLitPoolOffsets[seedLitIdx++];
        seedEntries.push(concatBytes([
          new Uint8Array([SEED_LITERAL, 0]),
          u16le(off),
          u16le(len),
        ]));
        break;
      }
      case 'param': {
        const pi = (seed.paramIndex ?? 0) & 0xff;
        seedEntries.push(new Uint8Array([SEED_PARAM, 0, pi, 0, 0, 0]));
        break;
      }
      case 'account': {
        const ai = (seed.accountIndex ?? 0) & 0xff;
        seedEntries.push(new Uint8Array([SEED_ACCOUNT, 0, ai, 0, 0, 0]));
        break;
      }
      case 'account_field': {
        const ai = seed.accountIndex;
        const fl = seed.fieldLen;
        if (ai == null) throw new Error('account_field seed requires accountIndex');
        if (fl == null || fl <= 0 || fl > 32) throw new Error('account_field fieldLen must be 1..=32');
        const planOff = fieldPlanPoolOffsets[seedI];
        if (planOff == null) throw new Error(`account_field seed at ${seedI} missing plan offset`);
        seedEntries.push(concatBytes([
          new Uint8Array([SEED_ACCOUNT_FIELD, 0, ai & 0xff]),
          u16le(planOff),
          new Uint8Array([fl & 0xff]),
        ]));
        break;
      }
      default:
        throw new Error(`Unknown seed type '${seed.seedType}'`);
    }
  });

  // ── Assemble full intent bytes ──────────────────────────────────────
  return concatBytes([
    header,
    ...proposers,
    ...approvers,
    ...paramEntries,
    ...accountEntries,
    instructionEntry,
    ...dataSegEntries,
    ...seedEntries,
    Uint8Array.from(pool),
  ]);
}
