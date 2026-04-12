import type { KnownProgram } from '../types.js';

/**
 * Hardcoded known program definitions for Tier 1 verification.
 * These are well-known Solana programs whose instruction layouts are stable.
 */

const SYSTEM_PROGRAM: KnownProgram = {
  name: 'System Program',
  address: '11111111111111111111111111111111',
  instructions: [
    {
      name: 'Transfer',
      discriminator: [2, 0, 0, 0], // u32 LE instruction index 2
      accounts: [
        { name: 'from', writable: true, signer: true },
        { name: 'to', writable: true, signer: false },
      ],
      args: [{ name: 'lamports', type: 'u64' }],
    },
  ],
};

const SPL_TOKEN: KnownProgram = {
  name: 'SPL Token',
  address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  instructions: [
    {
      name: 'Transfer',
      discriminator: [3],
      accounts: [
        { name: 'source', writable: true, signer: false },
        { name: 'destination', writable: true, signer: false },
        { name: 'authority', writable: false, signer: true },
      ],
      args: [{ name: 'amount', type: 'u64' }],
    },
    {
      name: 'TransferChecked',
      discriminator: [12],
      accounts: [
        { name: 'source', writable: true, signer: false },
        { name: 'mint', writable: false, signer: false },
        { name: 'destination', writable: true, signer: false },
        { name: 'authority', writable: false, signer: true },
      ],
      args: [
        { name: 'amount', type: 'u64' },
        { name: 'decimals', type: 'u8' },
      ],
    },
    {
      name: 'SetAuthority',
      discriminator: [6],
      accounts: [
        { name: 'account', writable: true, signer: false },
        { name: 'currentAuthority', writable: false, signer: true },
      ],
      args: [
        { name: 'authorityType', type: 'u8' },
        { name: 'newAuthority', type: 'address' },
      ],
    },
  ],
};

const BPF_UPGRADEABLE_LOADER: KnownProgram = {
  name: 'BPF Upgradeable Loader',
  address: 'BPFLoaderUpgradeab1e11111111111111111111111',
  instructions: [
    {
      name: 'Upgrade',
      discriminator: [3, 0, 0, 0],
      accounts: [
        { name: 'programdata', writable: true, signer: false },
        { name: 'program', writable: true, signer: false },
        { name: 'buffer', writable: true, signer: false },
        { name: 'spill', writable: true, signer: false },
        { name: 'rent', writable: false, signer: false },
        { name: 'clock', writable: false, signer: false },
        { name: 'authority', writable: false, signer: true },
      ],
      args: [],
    },
    {
      name: 'SetAuthority',
      discriminator: [4, 0, 0, 0],
      accounts: [
        { name: 'account', writable: true, signer: false },
        { name: 'currentAuthority', writable: false, signer: true },
        { name: 'newAuthority', writable: false, signer: false },
      ],
      args: [],
    },
    {
      name: 'Close',
      discriminator: [5, 0, 0, 0],
      accounts: [
        { name: 'close', writable: true, signer: false },
        { name: 'recipient', writable: true, signer: false },
        { name: 'authority', writable: false, signer: true },
      ],
      args: [],
    },
  ],
};

/** Map of program address -> KnownProgram */
export const KNOWN_PROGRAMS: Map<string, KnownProgram> = new Map([
  [SYSTEM_PROGRAM.address, SYSTEM_PROGRAM],
  [SPL_TOKEN.address, SPL_TOKEN],
  [BPF_UPGRADEABLE_LOADER.address, BPF_UPGRADEABLE_LOADER],
]);
