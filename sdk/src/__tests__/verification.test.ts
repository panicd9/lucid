import { describe, it, expect } from 'vitest';
import { VerificationEngine } from '../verification/index.js';
import { IntentGenerator } from '../generator/index.js';
import { SAMPLE_IDL } from '../__fixtures__/sample-idl.js';
import type { IntentDefinition } from '../types.js';

const engine = new VerificationEngine();

describe('Tier 1 - Known Programs', () => {
  it('System Transfer intent -> verified, tier known_program, confidence 1.0', () => {
    const intent: IntentDefinition = {
      version: 1,
      programId: '11111111111111111111111111111111',
      instructionName: 'Transfer',
      discriminator: [2, 0, 0, 0],
      accounts: [
        {
          index: 0,
          name: 'from',
          source: 'vault',
          writable: true,
          signer: true,
        },
        {
          index: 1,
          name: 'to',
          source: 'param',
          writable: true,
          signer: false,
        },
      ],
      dataSegments: [
        { type: 'literal', value: [2, 0, 0, 0] },
        { type: 'param', paramIndex: 0, encoding: 'u64' },
      ],
      params: [
        {
          name: 'lamports',
          type: 'u64',
          label: 'lamports',
          constraintType: 'none',
          constraintValue: 0,
        },
      ],
      seeds: [],
      template: 'transfer {lamports}',
      riskLevel: 'high',
      timelockSeconds: 3600,
      verification: { status: 'unverified', tier: 'unverified', confidence: 0 },
    };

    const result = engine.verify(intent);
    expect(result.status).toBe('verified');
    expect(result.tier).toBe('known_program');
    expect(result.confidence).toBe(1.0);
  });

  it('SPL TransferChecked -> verified', () => {
    const intent: IntentDefinition = {
      version: 1,
      programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      instructionName: 'TransferChecked',
      discriminator: [12],
      accounts: [
        {
          index: 0,
          name: 'source',
          source: 'param',
          writable: true,
          signer: false,
        },
        {
          index: 1,
          name: 'mint',
          source: 'param',
          writable: false,
          signer: false,
        },
        {
          index: 2,
          name: 'destination',
          source: 'param',
          writable: true,
          signer: false,
        },
        {
          index: 3,
          name: 'authority',
          source: 'vault',
          writable: false,
          signer: true,
        },
      ],
      dataSegments: [
        { type: 'literal', value: [12] },
        { type: 'param', paramIndex: 0, encoding: 'u64' },
        { type: 'param', paramIndex: 1, encoding: 'u8' },
      ],
      params: [
        {
          name: 'amount',
          type: 'u64',
          label: 'amount',
          constraintType: 'none',
          constraintValue: 0,
        },
        {
          name: 'decimals',
          type: 'u8',
          label: 'decimals',
          constraintType: 'none',
          constraintValue: 0,
        },
      ],
      seeds: [],
      template: 'transfer checked {amount}',
      riskLevel: 'high',
      timelockSeconds: 3600,
      verification: { status: 'unverified', tier: 'unverified', confidence: 0 },
    };

    const result = engine.verify(intent);
    expect(result.status).toBe('verified');
    expect(result.tier).toBe('known_program');
  });

  it('Known program + wrong discriminator -> mismatch', () => {
    const intent: IntentDefinition = {
      version: 1,
      programId: '11111111111111111111111111111111',
      instructionName: 'Transfer',
      discriminator: [99, 99, 99, 99], // wrong
      accounts: [
        {
          index: 0,
          name: 'from',
          source: 'vault',
          writable: true,
          signer: true,
        },
        {
          index: 1,
          name: 'to',
          source: 'param',
          writable: true,
          signer: false,
        },
      ],
      dataSegments: [
        { type: 'literal', value: [99, 99, 99, 99] },
        { type: 'param', paramIndex: 0, encoding: 'u64' },
      ],
      params: [
        {
          name: 'lamports',
          type: 'u64',
          label: 'lamports',
          constraintType: 'none',
          constraintValue: 0,
        },
      ],
      seeds: [],
      template: 'transfer {lamports}',
      riskLevel: 'high',
      timelockSeconds: 3600,
      verification: { status: 'unverified', tier: 'unverified', confidence: 0 },
    };

    const result = engine.verify(intent);
    expect(result.status).toBe('mismatch');
  });

  it('Known program + tampered writable flag -> mismatch', () => {
    const intent: IntentDefinition = {
      version: 1,
      programId: '11111111111111111111111111111111',
      instructionName: 'Transfer',
      discriminator: [2, 0, 0, 0],
      accounts: [
        {
          index: 0,
          name: 'from',
          source: 'vault',
          writable: false, // tampered: should be true
          signer: true,
        },
        {
          index: 1,
          name: 'to',
          source: 'param',
          writable: true,
          signer: false,
        },
      ],
      dataSegments: [
        { type: 'literal', value: [2, 0, 0, 0] },
        { type: 'param', paramIndex: 0, encoding: 'u64' },
      ],
      params: [
        {
          name: 'lamports',
          type: 'u64',
          label: 'lamports',
          constraintType: 'none',
          constraintValue: 0,
        },
      ],
      seeds: [],
      template: 'transfer {lamports}',
      riskLevel: 'high',
      timelockSeconds: 3600,
      verification: { status: 'unverified', tier: 'unverified', confidence: 0 },
    };

    const result = engine.verify(intent);
    expect(result.status).toBe('mismatch');
    expect(result.tier).toBe('known_program');
    expect(result.details).toContain('writable mismatch');
  });

  it('Known program + tampered signer flag -> mismatch', () => {
    const intent: IntentDefinition = {
      version: 1,
      programId: '11111111111111111111111111111111',
      instructionName: 'Transfer',
      discriminator: [2, 0, 0, 0],
      accounts: [
        {
          index: 0,
          name: 'from',
          source: 'vault',
          writable: true,
          signer: false, // tampered: should be true
        },
        {
          index: 1,
          name: 'to',
          source: 'param',
          writable: true,
          signer: false,
        },
      ],
      dataSegments: [
        { type: 'literal', value: [2, 0, 0, 0] },
        { type: 'param', paramIndex: 0, encoding: 'u64' },
      ],
      params: [
        {
          name: 'lamports',
          type: 'u64',
          label: 'lamports',
          constraintType: 'none',
          constraintValue: 0,
        },
      ],
      seeds: [],
      template: 'transfer {lamports}',
      riskLevel: 'high',
      timelockSeconds: 3600,
      verification: { status: 'unverified', tier: 'unverified', confidence: 0 },
    };

    const result = engine.verify(intent);
    expect(result.status).toBe('mismatch');
    expect(result.tier).toBe('known_program');
    expect(result.details).toContain('signer mismatch');
  });

  it('Known program + wrong account count -> mismatch', () => {
    const intent: IntentDefinition = {
      version: 1,
      programId: '11111111111111111111111111111111',
      instructionName: 'Transfer',
      discriminator: [2, 0, 0, 0],
      accounts: [
        {
          index: 0,
          name: 'from',
          source: 'vault',
          writable: true,
          signer: true,
        },
        // missing second account
      ],
      dataSegments: [
        { type: 'literal', value: [2, 0, 0, 0] },
        { type: 'param', paramIndex: 0, encoding: 'u64' },
      ],
      params: [
        {
          name: 'lamports',
          type: 'u64',
          label: 'lamports',
          constraintType: 'none',
          constraintValue: 0,
        },
      ],
      seeds: [],
      template: 'transfer {lamports}',
      riskLevel: 'high',
      timelockSeconds: 3600,
      verification: { status: 'unverified', tier: 'unverified', confidence: 0 },
    };

    const result = engine.verify(intent);
    expect(result.status).toBe('mismatch');
    expect(result.details).toContain('Account count');
  });

  it('Unknown programId -> unverified (no IDL provided)', () => {
    const intent: IntentDefinition = {
      version: 1,
      programId: 'UnknownProgram111111111111111111111111111111',
      instructionName: 'doStuff',
      discriminator: [1, 2, 3, 4],
      accounts: [],
      dataSegments: [{ type: 'literal', value: [1, 2, 3, 4] }],
      params: [],
      seeds: [],
      template: 'do stuff',
      riskLevel: 'low',
      timelockSeconds: 0,
      verification: { status: 'unverified', tier: 'unverified', confidence: 0 },
    };

    const result = engine.verify(intent);
    expect(result.status).toBe('unverified');
  });
});

describe('Tier 2 - IDL Structural', () => {
  const generator = new IntentGenerator();

  it('round-trip: generate from SAMPLE_IDL, verify each against same IDL -> all verified, confidence 1.0', () => {
    const intents = generator.fromIdl(SAMPLE_IDL);
    for (const intent of intents) {
      const result = engine.verify(intent, SAMPLE_IDL);
      expect(result.status).toBe('verified');
      expect(result.tier).toBe('idl_structural');
      expect(result.confidence).toBe(1.0);
    }
  });

  it('tampered discriminator -> mismatch', () => {
    const intents = generator.fromIdl(SAMPLE_IDL);
    const tampered = {
      ...intents[0],
      discriminator: [0, 0, 0, 0, 0, 0, 0, 0],
      dataSegments: [
        { type: 'literal' as const, value: [0, 0, 0, 0, 0, 0, 0, 0] },
        ...intents[0].dataSegments.slice(1),
      ],
    };
    const result = engine.verify(tampered, SAMPLE_IDL);
    expect(result.status).toBe('mismatch');
  });

  it('tampered instructionName -> mismatch detail contains Name mismatch', () => {
    const intents = generator.fromIdl(SAMPLE_IDL);
    const tampered = {
      ...intents[0],
      instructionName: 'fake_instruction',
    };
    const result = engine.verify(tampered, SAMPLE_IDL);
    expect(result.status).toBe('mismatch');
    expect(result.details).toContain('Name mismatch');
  });

  it('extra account added -> mismatch detail contains Account count', () => {
    const intents = generator.fromIdl(SAMPLE_IDL);
    const tampered = {
      ...intents[0],
      accounts: [
        ...intents[0].accounts,
        {
          index: intents[0].accounts.length,
          name: 'extra',
          source: 'param' as const,
          writable: false,
          signer: false,
        },
      ],
    };
    const result = engine.verify(tampered, SAMPLE_IDL);
    expect(result.status).toBe('mismatch');
    expect(result.details).toContain('Account count');
  });

  it('tampered writable flag -> mismatch detail contains writable mismatch', () => {
    const intents = generator.fromIdl(SAMPLE_IDL);
    // update_admin: accounts[1] = state (writable: true in IDL)
    const tampered = {
      ...intents[0],
      accounts: intents[0].accounts.map((a, i) =>
        i === 1 ? { ...a, writable: !a.writable } : a
      ),
    };
    const result = engine.verify(tampered, SAMPLE_IDL);
    expect(result.status).toBe('mismatch');
    expect(result.details).toContain('writable mismatch');
  });

  it('tampered signer flag -> mismatch detail contains signer mismatch', () => {
    const intents = generator.fromIdl(SAMPLE_IDL);
    // update_admin: accounts[0] = admin (signer: true in IDL)
    const tampered = {
      ...intents[0],
      accounts: intents[0].accounts.map((a, i) =>
        i === 0 ? { ...a, signer: !a.signer } : a
      ),
    };
    const result = engine.verify(tampered, SAMPLE_IDL);
    expect(result.status).toBe('mismatch');
    expect(result.details).toContain('signer mismatch');
  });

  it('template referencing unknown param -> unverified (non-critical) with detail', () => {
    const intents = generator.fromIdl(SAMPLE_IDL);
    const tampered = {
      ...intents[0],
      template: 'do something with {nonexistent_param}',
    };
    const result = engine.verify(tampered, SAMPLE_IDL);
    // Template reference errors are non-critical — status is 'unverified' not 'mismatch'
    expect(result.status).toBe('unverified');
    expect(result.details).toContain('unknown param');
  });
});

describe('Orchestration', () => {
  const generator = new IntentGenerator();

  it('verify() prefers Tier 1 for System Transfer even if IDL provided', () => {
    const systemTransferIntent: IntentDefinition = {
      version: 1,
      programId: '11111111111111111111111111111111',
      instructionName: 'Transfer',
      discriminator: [2, 0, 0, 0],
      accounts: [
        {
          index: 0,
          name: 'from',
          source: 'vault',
          writable: true,
          signer: true,
        },
        {
          index: 1,
          name: 'to',
          source: 'param',
          writable: true,
          signer: false,
        },
      ],
      dataSegments: [
        { type: 'literal', value: [2, 0, 0, 0] },
        { type: 'param', paramIndex: 0, encoding: 'u64' },
      ],
      params: [
        {
          name: 'lamports',
          type: 'u64',
          label: 'lamports',
          constraintType: 'none',
          constraintValue: 0,
        },
      ],
      seeds: [],
      template: 'transfer {lamports}',
      riskLevel: 'high',
      timelockSeconds: 3600,
      verification: { status: 'unverified', tier: 'unverified', confidence: 0 },
    };

    // Pass an IDL too, but Tier 1 should win
    const result = engine.verify(systemTransferIntent, SAMPLE_IDL);
    expect(result.tier).toBe('known_program');
    expect(result.status).toBe('verified');
  });

  it('verifyAll() returns array with verification attached to each intent', () => {
    const intents = generator.fromIdl(SAMPLE_IDL);
    const results = engine.verifyAll(intents, SAMPLE_IDL);
    expect(results).toHaveLength(intents.length);
    for (const r of results) {
      expect(r.verification).toBeDefined();
      expect(r.verification.status).toBe('verified');
      expect(r.verification.tier).toBe('idl_structural');
    }
  });

  it('verifyAll() with mixed results: valid + tampered intents', () => {
    const intents = generator.fromIdl(SAMPLE_IDL);
    // Tamper the second intent's discriminator
    const mixed = intents.map((intent, i) =>
      i === 1
        ? {
            ...intent,
            discriminator: [0, 0, 0, 0, 0, 0, 0, 0],
            dataSegments: [
              { type: 'literal' as const, value: [0, 0, 0, 0, 0, 0, 0, 0] },
              ...intent.dataSegments.slice(1),
            ],
          }
        : intent
    );

    const results = engine.verifyAll(mixed, SAMPLE_IDL);
    expect(results).toHaveLength(intents.length);

    // First intent should still verify
    expect(results[0].verification.status).toBe('verified');
    // Second intent (tampered) should mismatch
    expect(results[1].verification.status).toBe('mismatch');
    // Remaining intents should still verify (batch didn't short-circuit)
    for (let i = 2; i < results.length; i++) {
      expect(results[i].verification.status).toBe('verified');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Tier 2 — PDA seed validation (account_field walk plans)
// ─────────────────────────────────────────────────────────────────────────

const SEED_IDL: any = {
  address: 'SeedTestProg11111111111111111111111111111111',
  metadata: { name: 'seed_test', version: '0.0.0', spec: '0.1.0' },
  instructions: [
    {
      name: 'create_pool',
      // sha256("global:create_pool")[0..8]
      discriminator: Array.from(
        require('node:crypto').createHash('sha256').update('global:create_pool').digest().subarray(0, 8)
      ),
      accounts: [
        {
          name: 'global_config',
          writable: false,
          pda: { seeds: [{ kind: 'const', value: [99, 102, 103] }] }, // "cfg"
        },
        {
          name: 'pool',
          writable: true,
          pda: {
            seeds: [
              { kind: 'const', value: [112, 111, 111, 108] }, // "pool"
              { kind: 'account', path: 'global_config.next_pool_id', account: 'GlobalConfig' },
            ],
          },
        },
      ],
      args: [],
    },
  ],
  types: [
    {
      name: 'GlobalConfig',
      type: {
        kind: 'struct',
        fields: [
          { name: 'admin', type: 'pubkey' },
          { name: 'pending_admin', type: { option: 'pubkey' } },
          { name: 'next_pool_id', type: 'u64' },
        ],
      },
    },
  ],
};

function makeSeedIntent(overrides: { poolSeeds?: SeedDefinition[] } = {}): IntentDefinition {
  return {
    version: 1,
    programId: SEED_IDL.address,
    instructionName: 'create_pool',
    discriminator: SEED_IDL.instructions[0].discriminator,
    params: [],
    accounts: [
      {
        index: 0,
        name: 'global_config',
        source: 'pda',
        writable: false,
        signer: false,
        seeds: [{ type: 'literal', value: [99, 102, 103] }],
      },
      {
        index: 1,
        name: 'pool',
        source: 'pda',
        writable: true,
        signer: false,
        seeds: overrides.poolSeeds ?? [
          { type: 'literal', value: [112, 111, 111, 108] },
          {
            type: 'account_field',
            accountIndex: 0,
            fieldPath: [
              { op: 'skip_fixed', size: 32 },
              { op: 'skip_option', size: 32 },
            ],
            fieldLen: 8,
          },
        ],
      },
    ],
    dataSegments: [{ type: 'literal', value: SEED_IDL.instructions[0].discriminator }],
    seeds: [],
    template: 'create pool',
    riskLevel: 'low',
    timelockSeconds: 0,
    verification: { status: 'unverified', tier: 'unverified', confidence: 0 },
  };
}

import type { SeedDefinition } from '../types.js';

describe('Tier 2 - Seed validation (account_field walk plans)', () => {
  it('verified intent with correct walk plan passes', () => {
    const result = engine.verify(makeSeedIntent(), SEED_IDL);
    expect(result.status).toBe('verified');
    expect(result.tier).toBe('idl_structural');
  });

  it('tampered fieldLen → mismatch', () => {
    const intent = makeSeedIntent({
      poolSeeds: [
        { type: 'literal', value: [112, 111, 111, 108] },
        {
          type: 'account_field',
          accountIndex: 0,
          fieldPath: [
            { op: 'skip_fixed', size: 32 },
            { op: 'skip_option', size: 32 },
          ],
          fieldLen: 32, // wrong: should be 8 (u64)
        },
      ],
    });
    const result = engine.verify(intent, SEED_IDL);
    expect(result.status).toBe('mismatch');
    expect(result.details).toMatch(/fieldLen mismatch/);
  });

  it('tampered fieldPath (missing SKIP_OPTION) → mismatch', () => {
    const intent = makeSeedIntent({
      poolSeeds: [
        { type: 'literal', value: [112, 111, 111, 108] },
        {
          type: 'account_field',
          accountIndex: 0,
          fieldPath: [
            { op: 'skip_fixed', size: 32 }, // missing skip_option
          ],
          fieldLen: 8,
        },
      ],
    });
    const result = engine.verify(intent, SEED_IDL);
    expect(result.status).toBe('mismatch');
    expect(result.details).toMatch(/fieldPath/);
  });

  it('downgraded account_field → account → mismatch', () => {
    const intent = makeSeedIntent({
      poolSeeds: [
        { type: 'literal', value: [112, 111, 111, 108] },
        // Attacker swaps the walk-plan seed for a plain account-address seed.
        { type: 'account', accountIndex: 0 },
      ],
    });
    const result = engine.verify(intent, SEED_IDL);
    expect(result.status).toBe('mismatch');
  });

  it('tampered literal seed bytes → mismatch', () => {
    const intent = makeSeedIntent({
      poolSeeds: [
        { type: 'literal', value: [88, 88, 88, 88] }, // not "pool"
        {
          type: 'account_field',
          accountIndex: 0,
          fieldPath: [
            { op: 'skip_fixed', size: 32 },
            { op: 'skip_option', size: 32 },
          ],
          fieldLen: 8,
        },
      ],
    });
    const result = engine.verify(intent, SEED_IDL);
    expect(result.status).toBe('mismatch');
    expect(result.details).toMatch(/literal bytes mismatch/);
  });
});
