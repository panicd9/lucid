import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { templateHashHex, type CanonicalIntent } from '../templateHash';

const FIXTURE_PATH = resolve(__dirname, '../../../../demo/intents/spl_transfer.json');

// The same hex is asserted in cli/tests/template_hash_tests.rs and
// sdk/src/__tests__/template-hash.test.ts. All three must move together.
const EXPECTED_HEX = '0938fc9922852e0319ea4179290dfeeb476b51fb290516a4a8167a18d16fe53e';

describe('dashboard templateHash', () => {
  it('matches the locked cross-implementation hex', () => {
    const intent = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as CanonicalIntent;
    expect(templateHashHex(intent)).toBe(EXPECTED_HEX);
  });
});
