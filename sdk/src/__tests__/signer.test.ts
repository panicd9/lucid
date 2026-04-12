import { describe, it, expect } from 'vitest';
import { IntentSigner } from '../signer.js';

describe('IntentSigner.buildMessage', () => {
  const signer = new IntentSigner(null, 'TestWallet1111111111111111111111111111111');

  it('fills simple template params correctly', () => {
    const msg = signer.buildMessage(
      'transfer {amount} to {recipient}',
      { amount: '1000', recipient: 'Bob' },
      'treasury',
      42n,
      'propose',
      '2026-01-01T00:00:00Z'
    );
    expect(msg).toContain('transfer 1000 to Bob');
    expect(msg).toContain('lucid;wallet:treasury;');
    expect(msg).toContain('propose #42');
    expect(msg).toContain(';exp:2026-01-01T00:00:00Z');
  });

  it('handles empty template (approve/cancel actions)', () => {
    const msg = signer.buildMessage(
      '',
      {},
      'treasury',
      7n,
      'approve',
      '2026-06-01T00:00:00Z'
    );
    expect(msg).toBe(
      'lucid;wallet:treasury;approve #7;exp:2026-06-01T00:00:00Z'
    );
  });

  it('preserves unfilled placeholders when param is missing', () => {
    const msg = signer.buildMessage(
      'transfer {amount} to {recipient}',
      { amount: '500' },
      'vault',
      1n,
      'propose',
      '2026-01-01T00:00:00Z'
    );
    expect(msg).toContain('transfer 500 to {recipient}');
  });

  // --- Regex injection tests (security-critical) ---

  it('handles param name with regex metacharacters: dot', () => {
    const msg = signer.buildMessage(
      'set {fee.rate} bps',
      { 'fee.rate': '50' },
      'w',
      1n,
      'propose',
      'exp'
    );
    expect(msg).toContain('set 50 bps');
  });

  it('handles param name with regex metacharacters: braces and parens', () => {
    const msg = signer.buildMessage(
      'call {fn(x)} now',
      { 'fn(x)': 'doThing' },
      'w',
      1n,
      'propose',
      'exp'
    );
    expect(msg).toContain('call doThing now');
  });

  it('handles param name with regex metacharacters: brackets and pipe', () => {
    const msg = signer.buildMessage(
      'set {a|b} value',
      { 'a|b': '42' },
      'w',
      1n,
      'propose',
      'exp'
    );
    expect(msg).toContain('set 42 value');
  });

  it('handles param name with dollar sign and caret', () => {
    const msg = signer.buildMessage(
      'pay {$amount}',
      { '$amount': '100' },
      'w',
      1n,
      'propose',
      'exp'
    );
    expect(msg).toContain('pay 100');
  });

  it('handles param name with asterisk and plus', () => {
    const msg = signer.buildMessage(
      'set {rate*100+1}',
      { 'rate*100+1': '5000' },
      'w',
      1n,
      'propose',
      'exp'
    );
    expect(msg).toContain('set 5000');
  });

  it('handles param name with backslash', () => {
    const msg = signer.buildMessage(
      'set {path\\to}',
      { 'path\\to': '/foo' },
      'w',
      1n,
      'propose',
      'exp'
    );
    expect(msg).toContain('set /foo');
  });

  it('replaces all occurrences of the same param', () => {
    const msg = signer.buildMessage(
      '{amount} tokens ({amount} lamports)',
      { amount: '999' },
      'w',
      1n,
      'propose',
      'exp'
    );
    expect(msg).toContain('999 tokens (999 lamports)');
  });

  it('does not perform regex replacement when param name is a regex pattern', () => {
    // If escaping is missing, ".*" would match everything
    const msg = signer.buildMessage(
      'transfer {amount} to {dest}',
      { '.*': 'INJECTED' },
      'w',
      1n,
      'propose',
      'exp'
    );
    // {amount} and {dest} should remain unfilled — ".*" is not a valid param name match
    expect(msg).toContain('{amount}');
    expect(msg).toContain('{dest}');
    expect(msg).not.toContain('INJECTED');
  });
});
