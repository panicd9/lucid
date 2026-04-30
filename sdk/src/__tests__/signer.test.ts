import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IntentSigner } from '../signer.js';

/**
 * Canonical message format — single source of truth is tests/vectors/message_format.json.
 *
 * If the format changes, update the golden file and all three producers:
 *   1. programs/lucid/src/state/message.rs  (on-chain build_message)
 *   2. tests/rust/src/helpers/ed25519.rs     (test helper build_offchain_message)
 *   3. sdk/src/signer.ts                     (SDK IntentSigner.buildMessage)
 */

interface MessageVector {
  description: string;
  action: string;
  rendered_template: string;
  wallet_name: string;
  wallet_pda_b58: string;
  proposal_index: number;
  expiry: string;
  expected_body: string;
}

function loadVectors(): MessageVector[] {
  // Walk up from sdk/src/__tests__/ to project root, then into tests/vectors/
  const vectorPath = resolve(__dirname, '../../../tests/vectors/message_format.json');
  const content = readFileSync(vectorPath, 'utf-8');
  return JSON.parse(content);
}

describe('IntentSigner.buildMessage', () => {
  const signer = new IntentSigner(null, 'TestWallet1111111111111111111111111111111');

  describe('golden vectors (shared with on-chain program)', () => {
    const vectors = loadVectors();

    for (const v of vectors) {
      it(`${v.description}`, () => {
        const msg = signer.buildMessage(
          v.rendered_template,
          {}, // params already rendered in the vector
          v.wallet_name,
          v.wallet_pda_b58,
          BigInt(v.proposal_index),
          v.action,
          v.expiry
        );
        expect(msg).toBe(v.expected_body);
      });
    }
  });

  // Stand-in PDA for non-vector test cases — content is not asserted, only
  // that the new-signature buildMessage accepts it without throwing.
  const PDA = 'PdaTesT11111111111111111111111111111111111';

  describe('template param substitution', () => {
    it('fills template params before producing message', () => {
      const msg = signer.buildMessage(
        'transfer {amount} to {recipient}',
        { amount: '1000', recipient: 'Bob' },
        'treasury',
        PDA,
        42n,
        'propose',
        '01 Jan 2026 00:00:00'
      );
      expect(msg).toBe(
        `propose transfer 1000 to Bob | wallet: treasury (${PDA}); proposal: #42; expires: 01 Jan 2026 00:00:00`
      );
    });

    it('preserves unfilled placeholders when param is missing', () => {
      const msg = signer.buildMessage(
        'transfer {amount} to {recipient}',
        { amount: '500' },
        'vault',
        PDA,
        1n,
        'propose',
        '01 Jan 2026 00:00:00'
      );
      expect(msg).toContain('transfer 500 to {recipient}');
    });

    it('replaces all occurrences of the same param', () => {
      const msg = signer.buildMessage(
        '{amount} tokens ({amount} lamports)',
        { amount: '999' },
        'w',
        PDA,
        1n,
        'propose',
        'exp'
      );
      expect(msg).toContain('999 tokens (999 lamports)');
    });
  });

  describe('regex injection (security-critical)', () => {
    it('handles param name with regex metacharacters: dot', () => {
      const msg = signer.buildMessage(
        'set {fee.rate} bps',
        { 'fee.rate': '50' },
        'w', PDA, 1n, 'propose', 'exp'
      );
      expect(msg).toContain('set 50 bps');
    });

    it('handles param name with regex metacharacters: braces and parens', () => {
      const msg = signer.buildMessage(
        'call {fn(x)} now',
        { 'fn(x)': 'doThing' },
        'w', PDA, 1n, 'propose', 'exp'
      );
      expect(msg).toContain('call doThing now');
    });

    it('handles param name with regex metacharacters: brackets and pipe', () => {
      const msg = signer.buildMessage(
        'set {a|b} value',
        { 'a|b': '42' },
        'w', PDA, 1n, 'propose', 'exp'
      );
      expect(msg).toContain('set 42 value');
    });

    it('handles param name with dollar sign and caret', () => {
      const msg = signer.buildMessage(
        'pay {$amount}',
        { '$amount': '100' },
        'w', PDA, 1n, 'propose', 'exp'
      );
      expect(msg).toContain('pay 100');
    });

    it('handles param name with asterisk and plus', () => {
      const msg = signer.buildMessage(
        'set {rate*100+1}',
        { 'rate*100+1': '5000' },
        'w', PDA, 1n, 'propose', 'exp'
      );
      expect(msg).toContain('set 5000');
    });

    it('handles param name with backslash', () => {
      const msg = signer.buildMessage(
        'set {path\\to}',
        { 'path\\to': '/foo' },
        'w', PDA, 1n, 'propose', 'exp'
      );
      expect(msg).toContain('set /foo');
    });

    it('does not perform regex replacement when param name is a regex pattern', () => {
      const msg = signer.buildMessage(
        'transfer {amount} to {dest}',
        { '.*': 'INJECTED' },
        'w', PDA, 1n, 'propose', 'exp'
      );
      expect(msg).toContain('{amount}');
      expect(msg).toContain('{dest}');
      expect(msg).not.toContain('INJECTED');
    });
  });
});
