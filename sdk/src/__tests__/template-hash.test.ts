import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeTemplateHash, templateHashHex, type CanonicalIntent } from '../templateHash.js';

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../demo/intents/spl_transfer.json',
);

// The Rust side asserts the same hex against the same fixture file in
// cli/tests/template_hash_tests.rs.
const EXPECTED_SPL_TRANSFER_HEX =
  '0938fc9922852e0319ea4179290dfeeb476b51fb290516a4a8167a18d16fe53e';

function loadFixture(): CanonicalIntent {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as CanonicalIntent;
}

describe('computeTemplateHash', () => {
  it('produces a 32-byte digest', () => {
    expect(computeTemplateHash(loadFixture()).length).toBe(32);
  });

  it('is deterministic across calls', () => {
    expect(templateHashHex(loadFixture())).toBe(templateHashHex(loadFixture()));
  });

  it('changes when the template string changes', () => {
    const before = templateHashHex(loadFixture());
    const after = templateHashHex({ ...loadFixture(), template: 'send {amount} {mint} to {destination}' });
    expect(after).not.toBe(before);
  });

  it('changes when the discriminator changes', () => {
    const before = templateHashHex(loadFixture());
    const after = templateHashHex({ ...loadFixture(), discriminator: [3] });
    expect(after).not.toBe(before);
  });

  it('matches the locked cross-language hex', () => {
    expect(templateHashHex(loadFixture())).toBe(EXPECTED_SPL_TRANSFER_HEX);
  });

  it('is independent of object key order in inputs', () => {
    const orig = loadFixture();
    const reordered: CanonicalIntent = {
      template: orig.template,
      seeds: orig.seeds,
      dataSegments: orig.dataSegments,
      accounts: orig.accounts,
      params: orig.params,
      discriminator: orig.discriminator,
      programId: orig.programId,
      version: orig.version,
    };
    expect(templateHashHex(reordered)).toBe(templateHashHex(orig));
  });

  it('changes when the template contains non-ASCII characters', () => {
    // Non-ASCII path catches encoding-mismatch bugs between Rust serde_json
    // and the TS canonicalStringify.
    const before = templateHashHex(loadFixture());
    const after = templateHashHex({ ...loadFixture(), template: 'transfer {amount} → {destination} 🚀' });
    expect(after).not.toBe(before);
  });
});
