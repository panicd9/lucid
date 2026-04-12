import { describe, it, expect } from 'vitest';
import { classifyRisk, defaultTimelock } from '../generator/risk.js';
import { generateTemplate } from '../generator/template.js';
import type { AnchorInstruction } from '../types.js';

/** Helper to create a minimal AnchorInstruction for testing */
function makeIx(
  overrides: Partial<AnchorInstruction> & { name: string }
): AnchorInstruction {
  return {
    discriminator: [0, 0, 0, 0, 0, 0, 0, 0],
    accounts: [],
    args: [],
    ...overrides,
  };
}

describe('classifyRisk', () => {
  it('update_admin -> critical', () => {
    const ix = makeIx({
      name: 'update_admin',
      accounts: [{ name: 'admin', signer: true }],
      args: [{ name: 'new_admin', type: 'pubkey' }],
    });
    expect(classifyRisk(ix)).toBe('critical');
  });

  it('withdraw -> high', () => {
    const ix = makeIx({
      name: 'withdraw',
      accounts: [
        { name: 'authority', signer: true },
        { name: 'vault', writable: true },
      ],
      args: [{ name: 'amount', type: 'u64' }],
    });
    expect(classifyRisk(ix)).toBe('high');
  });

  it('add_market -> medium', () => {
    const ix = makeIx({
      name: 'add_market',
      accounts: [{ name: 'authority', signer: true }],
      args: [
        { name: 'market_index', type: 'u16' },
        { name: 'oracle', type: 'pubkey' },
      ],
    });
    expect(classifyRisk(ix)).toBe('medium');
  });

  it('initialize -> low', () => {
    const ix = makeIx({
      name: 'initialize',
      accounts: [{ name: 'payer', signer: true, writable: true }],
      args: [],
    });
    expect(classifyRisk(ix)).toBe('low');
  });

  it('set_paused -> medium (starts with set)', () => {
    const ix = makeIx({
      name: 'set_paused',
      accounts: [{ name: 'admin', signer: true }],
      args: [{ name: 'paused', type: 'bool' }],
    });
    expect(classifyRisk(ix)).toBe('medium');
  });

  it('instruction with arg named new_authority -> critical regardless of name', () => {
    const ix = makeIx({
      name: 'do_something_benign',
      accounts: [{ name: 'signer', signer: true }],
      args: [{ name: 'new_authority', type: 'pubkey' }],
    });
    expect(classifyRisk(ix)).toBe('critical');
  });

  it('instruction with amount u64 arg + vault account -> high', () => {
    const ix = makeIx({
      name: 'process_payment',
      accounts: [
        { name: 'signer', signer: true },
        { name: 'vault', writable: true },
      ],
      args: [{ name: 'amount', type: 'u64' }],
    });
    expect(classifyRisk(ix)).toBe('high');
  });
});

describe('defaultTimelock', () => {
  it('critical -> 86400', () => {
    expect(defaultTimelock('critical')).toBe(86400);
  });

  it('high -> 3600', () => {
    expect(defaultTimelock('high')).toBe(3600);
  });

  it('medium -> 0', () => {
    expect(defaultTimelock('medium')).toBe(0);
  });

  it('low -> 0', () => {
    expect(defaultTimelock('low')).toBe(0);
  });
});

describe('generateTemplate', () => {
  it('update_admin with arg new_admin -> template contains {new_admin} and admin/authority', () => {
    const ix = makeIx({
      name: 'update_admin',
      accounts: [{ name: 'admin', signer: true }],
      args: [{ name: 'new_admin', type: 'pubkey' }],
    });
    const template = generateTemplate(ix);
    expect(template).toContain('{new_admin}');
    expect(template.toLowerCase()).toMatch(/admin|authority/);
  });

  it('withdraw with args amount, recipient -> template contains {amount} and {recipient}', () => {
    const ix = makeIx({
      name: 'withdraw',
      accounts: [
        { name: 'authority', signer: true },
        { name: 'vault', writable: true },
      ],
      args: [
        { name: 'amount', type: 'u64' },
        { name: 'recipient', type: 'pubkey' },
      ],
    });
    const template = generateTemplate(ix);
    expect(template).toContain('{amount}');
    expect(template).toContain('{recipient}');
  });

  it('set_paused with arg paused -> template contains {paused}', () => {
    const ix = makeIx({
      name: 'set_paused',
      accounts: [{ name: 'admin', signer: true }],
      args: [{ name: 'paused', type: 'bool' }],
    });
    const template = generateTemplate(ix);
    expect(template).toContain('{paused}');
  });

  it('initialize with no args -> template is just words (no curly braces)', () => {
    const ix = makeIx({
      name: 'initialize',
      accounts: [{ name: 'payer', signer: true, writable: true }],
      args: [],
    });
    const template = generateTemplate(ix);
    expect(template).not.toContain('{');
    expect(template).not.toContain('}');
    expect(template.length).toBeGreaterThan(0);
  });

  it('unknown instruction do_thing with args foo, bar -> fallback template', () => {
    const ix = makeIx({
      name: 'do_thing',
      accounts: [],
      args: [
        { name: 'foo', type: 'u64' },
        { name: 'bar', type: 'u64' },
      ],
    });
    const template = generateTemplate(ix);
    expect(template).toContain('{foo}');
    expect(template).toContain('{bar}');
    expect(template).toContain('do thing');
  });
});
