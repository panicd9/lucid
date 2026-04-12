import { createHash } from 'node:crypto';
import type { AnchorIdl } from '../types.js';

function anchorDisc(name: string): number[] {
  const hash = createHash('sha256').update(`global:${name}`).digest();
  return Array.from(hash.subarray(0, 8));
}

export const SAMPLE_IDL: AnchorIdl = {
  address: 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH',
  metadata: { name: 'sample_protocol', version: '0.1.0', spec: '0.1.0' },
  instructions: [
    {
      name: 'update_admin',
      discriminator: anchorDisc('update_admin'),
      accounts: [
        { name: 'admin', signer: true },
        { name: 'state', writable: true },
      ],
      args: [{ name: 'new_admin', type: 'pubkey' }],
    },
    {
      name: 'withdraw',
      discriminator: anchorDisc('withdraw'),
      accounts: [
        { name: 'authority', signer: true },
        { name: 'vault', writable: true },
        { name: 'destination', writable: true },
      ],
      args: [
        { name: 'amount', type: 'u64' },
        { name: 'recipient', type: 'pubkey' },
      ],
    },
    {
      name: 'add_market',
      discriminator: anchorDisc('add_market'),
      accounts: [
        { name: 'authority', signer: true },
        { name: 'market', writable: true },
      ],
      args: [
        { name: 'market_index', type: 'u16' },
        { name: 'oracle', type: 'pubkey' },
      ],
    },
    {
      name: 'initialize',
      discriminator: anchorDisc('initialize'),
      accounts: [
        { name: 'payer', writable: true, signer: true },
        { name: 'state', writable: true },
        { name: 'system_program', address: '11111111111111111111111111111111' },
      ],
      args: [],
    },
    {
      name: 'set_paused',
      discriminator: anchorDisc('set_paused'),
      accounts: [
        { name: 'admin', signer: true },
        { name: 'state', writable: true },
      ],
      args: [{ name: 'paused', type: 'bool' }],
    },
  ],
};
