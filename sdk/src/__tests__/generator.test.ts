import { describe, it, expect } from 'vitest';
import { IntentGenerator } from '../generator/index.js';
import { SAMPLE_IDL } from '../__fixtures__/sample-idl.js';
import type { AnchorIdl } from '../types.js';

describe('IntentGenerator', () => {
  const generator = new IntentGenerator();

  describe('fromIdl basic output', () => {
    it('produces one IntentDefinition per instruction (5 for SAMPLE_IDL)', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      expect(intents).toHaveLength(5);
    });

    it('each intent has correct instructionName matching IDL', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      const names = intents.map((i) => i.instructionName);
      expect(names).toEqual([
        'update_admin',
        'withdraw',
        'add_market',
        'initialize',
        'set_paused',
      ]);
    });
  });

  describe('argument type mapping', () => {
    it('maps u64 arg to param type u64', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      const withdraw = intents.find((i) => i.instructionName === 'withdraw')!;
      const amountParam = withdraw.params.find((p) => p.name === 'amount');
      expect(amountParam).toBeDefined();
      expect(amountParam!.type).toBe('u64');
    });

    it('maps pubkey arg to param type address', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      const withdraw = intents.find((i) => i.instructionName === 'withdraw')!;
      const recipientParam = withdraw.params.find((p) => p.name === 'recipient');
      expect(recipientParam).toBeDefined();
      expect(recipientParam!.type).toBe('address');
    });

    it('maps u16 arg to param type u16', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      const addMarket = intents.find((i) => i.instructionName === 'add_market')!;
      const marketIndex = addMarket.params.find((p) => p.name === 'market_index');
      expect(marketIndex).toBeDefined();
      expect(marketIndex!.type).toBe('u16');
    });

    it('maps bool arg to param type bool', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      const setPaused = intents.find((i) => i.instructionName === 'set_paused')!;
      const pausedParam = setPaused.params.find((p) => p.name === 'paused');
      expect(pausedParam).toBeDefined();
      expect(pausedParam!.type).toBe('bool');
    });

    it('skips unsupported complex types', () => {
      const complexIdl: AnchorIdl = {
        address: 'TestAddress1111111111111111111111111111111',
        metadata: { name: 'test', version: '0.1.0', spec: '0.1.0' },
        instructions: [
          {
            name: 'complex_ix',
            discriminator: [1, 2, 3, 4, 5, 6, 7, 8],
            accounts: [{ name: 'payer', signer: true, writable: true }],
            args: [{ name: 'data', type: { defined: { name: 'Foo' } } }],
          },
        ],
      };
      const intents = generator.fromIdl(complexIdl);
      expect(intents[0].params).toHaveLength(0);
    });
  });

  describe('discriminator handling', () => {
    it('preserves discriminator verbatim from IDL', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      for (let i = 0; i < SAMPLE_IDL.instructions.length; i++) {
        expect(intents[i].discriminator).toEqual(
          SAMPLE_IDL.instructions[i].discriminator
        );
      }
    });
  });

  describe('data segments', () => {
    it('first segment is literal discriminator', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      for (const intent of intents) {
        expect(intent.dataSegments[0].type).toBe('literal');
        expect(intent.dataSegments[0].value).toEqual(intent.discriminator);
      }
    });

    it('subsequent segments are param-indexed', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      const withdraw = intents.find((i) => i.instructionName === 'withdraw')!;
      // withdraw has 2 args: amount (u64) and recipient (pubkey/address)
      expect(withdraw.dataSegments).toHaveLength(3); // disc + 2 params
      expect(withdraw.dataSegments[1].type).toBe('param');
      expect(withdraw.dataSegments[1].paramIndex).toBe(0);
      expect(withdraw.dataSegments[2].type).toBe('param');
      expect(withdraw.dataSegments[2].paramIndex).toBe(1);
    });
  });

  describe('account source inference', () => {
    it('account with address field gets source static', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      const init = intents.find((i) => i.instructionName === 'initialize')!;
      const systemProg = init.accounts.find(
        (a) => a.name === 'system_program'
      )!;
      expect(systemProg.source).toBe('static');
      expect(systemProg.staticAddress).toBe(
        '11111111111111111111111111111111'
      );
    });

    it('signer named authority gets source vault', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      const withdraw = intents.find((i) => i.instructionName === 'withdraw')!;
      const authority = withdraw.accounts.find(
        (a) => a.name === 'authority'
      )!;
      expect(authority.source).toBe('vault');
    });

    it('signer named admin gets source vault', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      const updateAdmin = intents.find(
        (i) => i.instructionName === 'update_admin'
      )!;
      const admin = updateAdmin.accounts.find((a) => a.name === 'admin')!;
      expect(admin.source).toBe('vault');
    });

    it('non-signer writable account gets source param (default)', () => {
      const intents = generator.fromIdl(SAMPLE_IDL);
      const withdraw = intents.find((i) => i.instructionName === 'withdraw')!;
      const destination = withdraw.accounts.find(
        (a) => a.name === 'destination'
      )!;
      expect(destination.source).toBe('param');
    });
  });

  describe('error handling', () => {
    it('throws on missing discriminator (empty array)', () => {
      const badIdl: AnchorIdl = {
        address: 'TestAddress1111111111111111111111111111111',
        metadata: { name: 'test', version: '0.1.0', spec: '0.1.0' },
        instructions: [
          {
            name: 'bad_ix',
            discriminator: [],
            accounts: [],
            args: [],
          },
        ],
      };
      expect(() => generator.fromIdl(badIdl)).toThrow('discriminator');
    });

    it('throws on bad seed reference (non-existent arg)', () => {
      const pdaIdl: AnchorIdl = {
        address: 'TestAddress1111111111111111111111111111111',
        metadata: { name: 'test', version: '0.1.0', spec: '0.1.0' },
        instructions: [
          {
            name: 'pda_ix',
            discriminator: [1, 2, 3, 4, 5, 6, 7, 8],
            accounts: [
              { name: 'payer', signer: true, writable: true },
              {
                name: 'derived',
                writable: true,
                pda: {
                  seeds: [{ kind: 'arg', path: 'nonexistent_arg' }],
                },
              },
            ],
            args: [{ name: 'real_arg', type: 'u64' }],
          },
        ],
      };
      expect(() => generator.fromIdl(pdaIdl)).toThrow('non-existent arg');
    });

    it('throws on IDL with empty address', () => {
      const emptyAddrIdl: AnchorIdl = {
        address: '',
        metadata: { name: 'test', version: '0.1.0', spec: '0.1.0' },
        instructions: [],
      };
      expect(() => generator.fromIdl(emptyAddrIdl)).toThrow('address');
    });
  });
});
