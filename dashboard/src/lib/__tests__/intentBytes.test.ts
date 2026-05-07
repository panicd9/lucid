import { describe, it, expect } from 'vitest';
import { Buffer } from 'buffer';
import { serializeIntentDefinition } from '../intentBytes';
import { deserializeIntent } from '../deserialize';
import { computeTemplateHash } from '../templateHash';
import {
  DISC_INTENT,
  INTENT_TYPE_CUSTOM,
  PARAM_ENTRY_SIZE,
  ACCOUNT_ENTRY_SIZE,
  INSTRUCTION_ENTRY_SIZE,
  DATA_SEGMENT_ENTRY_SIZE,
  SEED_ENTRY_SIZE,
} from '../constants';
import { PRESET_INTENTS } from '../../templates';

const SAMPLE_PROPOSER = new Uint8Array(32).fill(1);
const SAMPLE_APPROVER = new Uint8Array(32).fill(2);
const HEADER_BYTES = 120;

function storeWithPrefix(bytes: Uint8Array): Buffer {
  return Buffer.concat([Buffer.from([DISC_INTENT, 0]), Buffer.from(bytes)]);
}

describe('serializeIntentDefinition — SOL Transfer round-trip', () => {
  const sol = PRESET_INTENTS[0]!;

  it('round-trips through deserializeIntent', () => {
    const bytes = serializeIntentDefinition(sol, 1, 1, [SAMPLE_PROPOSER], [SAMPLE_APPROVER]);
    const stored = storeWithPrefix(bytes);
    const deser = deserializeIntent(stored);

    expect(deser.intentType).toBe(INTENT_TYPE_CUSTOM);
    expect(deser.approvalThreshold).toBe(1);
    expect(deser.cancellationThreshold).toBe(1);
    expect(deser.proposerCount).toBe(1);
    expect(deser.approverCount).toBe(1);
    expect(Array.from(deser.proposers[0]!.toBytes())).toEqual(Array.from(SAMPLE_PROPOSER));
    expect(Array.from(deser.approvers[0]!.toBytes())).toEqual(Array.from(SAMPLE_APPROVER));
    expect(deser.template).toBe(sol.template);
    expect(deser.paramCount).toBe(sol.params.length);
    expect(deser.accountCount).toBe(sol.accounts.length + 1); // +1 for appended target_program
    expect(deser.instructionCount).toBe(1);
    expect(deser.dataSegmentCount).toBe(sol.dataSegments.length);
    expect(deser.seedCount).toBe(sol.seeds.length);
    expect(deser.timelockSeconds).toBe(sol.timelockSeconds);
  });

  it('embeds the canonical template hash in the header', () => {
    const bytes = serializeIntentDefinition(sol, 1, 1, [SAMPLE_PROPOSER], [SAMPLE_APPROVER]);
    const stored = storeWithPrefix(bytes);
    const deser = deserializeIntent(stored);

    const expectedHash = computeTemplateHash(sol);
    expect(Buffer.from(deser.templateHash).equals(Buffer.from(expectedHash))).toBe(true);
  });

  it('byte_pool_len equals total length minus fixed sections', () => {
    const bytes = serializeIntentDefinition(sol, 1, 1, [SAMPLE_PROPOSER], [SAMPLE_APPROVER]);
    const stored = storeWithPrefix(bytes);
    const deser = deserializeIntent(stored);

    const fixed =
      HEADER_BYTES +
      32 +
      32 +
      sol.params.length * PARAM_ENTRY_SIZE +
      (sol.accounts.length + 1) * ACCOUNT_ENTRY_SIZE +
      1 * INSTRUCTION_ENTRY_SIZE +
      sol.dataSegments.length * DATA_SEGMENT_ENTRY_SIZE +
      sol.seeds.length * SEED_ENTRY_SIZE;

    expect(bytes.length).toBe(fixed + deser.bytePoolLen);
  });

  it('resolves param names through the byte pool', () => {
    const bytes = serializeIntentDefinition(sol, 1, 1, [SAMPLE_PROPOSER], [SAMPLE_APPROVER]);
    const deser = deserializeIntent(storeWithPrefix(bytes));
    const inputNames = sol.params.map((p) => p.name);
    const decodedNames = deser.params.map((p) => p.name);
    expect(decodedNames).toEqual(inputNames);
  });
});

describe('serializeIntentDefinition — SPL Transfer (PDA, account-seeds)', () => {
  const spl = PRESET_INTENTS[1]!;

  it('round-trips and preserves seed count + dataSegment shape', () => {
    const bytes = serializeIntentDefinition(spl, 2, 2, [SAMPLE_PROPOSER], [SAMPLE_APPROVER]);
    const deser = deserializeIntent(storeWithPrefix(bytes));

    expect(deser.template).toBe(spl.template);
    expect(deser.paramCount).toBe(spl.params.length);
    expect(deser.seedCount).toBe(spl.seeds.length);
    expect(deser.dataSegmentCount).toBe(spl.dataSegments.length);
    expect(deser.timelockSeconds).toBe(spl.timelockSeconds);
    expect(deser.approvalThreshold).toBe(2);
    expect(deser.cancellationThreshold).toBe(2);
  });

  it('produces stable bytes across calls (deterministic)', () => {
    const a = serializeIntentDefinition(spl, 1, 1, [SAMPLE_PROPOSER], [SAMPLE_APPROVER]);
    const b = serializeIntentDefinition(spl, 1, 1, [SAMPLE_PROPOSER], [SAMPLE_APPROVER]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe('serializeIntentDefinition — input validation', () => {
  const sol = PRESET_INTENTS[0]!;

  it('rejects 31-byte proposer', () => {
    expect(() =>
      serializeIntentDefinition(sol, 1, 1, [new Uint8Array(31)], [SAMPLE_APPROVER]),
    ).toThrow(/32 bytes/);
  });

  it('rejects 33-byte approver', () => {
    expect(() =>
      serializeIntentDefinition(sol, 1, 1, [SAMPLE_PROPOSER], [new Uint8Array(33)]),
    ).toThrow(/32 bytes/);
  });

  it('rejects malformed programId', () => {
    const bad = { ...sol, programId: 'not-a-base58-pubkey' };
    expect(() =>
      serializeIntentDefinition(bad, 1, 1, [SAMPLE_PROPOSER], [SAMPLE_APPROVER]),
    ).toThrow();
  });
});

describe('PRESET_INTENTS catalog', () => {
  it('contains SOL Transfer and SPL Token Transfer', () => {
    expect(PRESET_INTENTS).toHaveLength(2);
    expect(PRESET_INTENTS[0]!.programId).toBe('11111111111111111111111111111111');
    expect(PRESET_INTENTS[1]!.programId).toBe(
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    );
  });

  it('every preset has display metadata', () => {
    for (const p of PRESET_INTENTS) {
      expect(p.displayName.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.template.length).toBeGreaterThan(0);
    }
  });

  it('preset template hashes are stable and distinct', () => {
    const h0 = Buffer.from(computeTemplateHash(PRESET_INTENTS[0]!)).toString('hex');
    const h1 = Buffer.from(computeTemplateHash(PRESET_INTENTS[1]!)).toString('hex');
    expect(h0).not.toBe(h1);
    expect(h0).toHaveLength(64);
  });
});
