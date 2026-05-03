import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { templateHashHex, type CanonicalIntent } from '../templateHash';

const FIXTURE_PATH = resolve(__dirname, '../../../../demo/intents/spl_transfer.json');

// The same hex is asserted in cli/tests/template_hash_tests.rs and
// sdk/src/__tests__/template-hash.test.ts. All three must move together.
const EXPECTED_HEX = 'f3efda21305372c6ce2348fab91ba7ecbdbd155c7beea67ec8fcca321f523e32';

describe('dashboard templateHash', () => {
  it('matches the locked cross-implementation hex', () => {
    const intent = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as CanonicalIntent;
    expect(templateHashHex(intent)).toBe(EXPECTED_HEX);
  });
});
