import { describe, expect, it } from 'vitest';
import { Buffer } from 'buffer';
import { serializeIntentDefinition } from '../intentBytes';
import { PRESET_INTENTS } from '../../templates';

/**
 * Cross-language byte fixture for serializeIntentDefinition.
 *
 * The Rust side asserts the same hex against the same fixture inputs in
 * cli/tests/build_intent_bytes_tests.rs. If you change the on-chain intent
 * byte format, BOTH this test and the Rust one must be updated together —
 * silent drift here means dashboard and CLI write incompatible intents to
 * the same wallet.
 */

const PROPOSER = new Uint8Array(32).fill(0x11);
const APPROVER = new Uint8Array(32).fill(0x22);
const APPROVAL_THRESHOLD = 1;
const CANCELLATION_THRESHOLD = 1;

function serializeHex(idx: number): string {
  const bytes = serializeIntentDefinition(
    PRESET_INTENTS[idx]!,
    APPROVAL_THRESHOLD,
    CANCELLATION_THRESHOLD,
    [PROPOSER],
    [APPROVER],
  );
  return Buffer.from(bytes).toString('hex');
}

describe('serializeIntentDefinition — cross-language byte fixture', () => {
  it('SOL Transfer matches Rust build_intent_bytes hex', () => {
    const expected =
      '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004d00000003000101010102030102005d3d3d5133d9e58d6775e75f65c9d4e0e51e67f92d4bc37edd34974f3a108f84000000111111111111111111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222222222222222220000000000000000450006000100090000000000000000004b00020000000000020101000000000001010000010000000000000021000000020002000200000000004100040001000000000000001d007472616e73666572207b616d6f756e747d20534f4c20746f207b746f7d000000000000000000000000000000000000000000000000000000000000000002000000616d6f756e74746f';
    expect(serializeHex(0)).toBe(expected);
  });

  it('SPL Token Transfer matches Rust build_intent_bytes hex', () => {
    // CAVEAT: The current spl-transfer.json has a 1-byte literal seed `[6]`
    // for the SPL Token Program ID position in the ATA derivation. The bytes
    // are stable across CLI and dashboard, but a proposed transfer would
    // derive the wrong source ATA at execute time. Locking these bytes
    // catches drift; fixing the seed is a separate task.
    const expected =
      '000000000000000000000000000000000000000000000000000000000000000006ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9100e000000008c0000000300010101010405010303f3efda21305372c6ce2348fab91ba7ecbdbd155c7beea67ec8fcca321f523e320000001111111111111111111111111111111111111111111111111111111111111111222222222222222222222222222222222222222222222222222222222222222200000000000000006f000600010000020000000000000000750008000500000000000000000000007d00040000000000000000000000000081000b00000000000301000000034d00010000000200000001010000030000000200010000000000000000002d000000040004000300000000006d00010001000000000001000100000002000300000000006e000100020001000000000029007472616e73666572207b616d6f756e747d207b6d696e747d20746f207b64657374696e6174696f6e7d06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a98c97258f4e2489f1bb3d1029148e0d830b5a1399daff1084048e7bd8dbe9f8590c06616d6f756e74646563696d616c736d696e7464657374696e6174696f6e';
    expect(serializeHex(1)).toBe(expected);
  });
});
