import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  findWalletPDA,
  findVaultPDA,
  findIntentPDA,
  findProposalPDA,
} from '../pda';

// Dummy create keys for tests
const CREATE_KEY_A = new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin');
const CREATE_KEY_B = new PublicKey('4fYNw3dojWmQ4dXtSGE9epjRGy9pFSx62YypT7avPYvA');

describe('findWalletPDA', () => {
  it('is deterministic: same create_key produces same PDA and bump', () => {
    const [pda1, bump1] = findWalletPDA(CREATE_KEY_A);
    const [pda2, bump2] = findWalletPDA(CREATE_KEY_A);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it('different create_keys produce different PDAs', () => {
    const [pdaA] = findWalletPDA(CREATE_KEY_A);
    const [pdaB] = findWalletPDA(CREATE_KEY_B);
    expect(pdaA.equals(pdaB)).toBe(false);
  });
});

describe('findVaultPDA', () => {
  it('chains from wallet PDA', () => {
    const [walletPda] = findWalletPDA(CREATE_KEY_A);
    const [vaultPda, vaultBump] = findVaultPDA(walletPda);
    expect(vaultPda).toBeInstanceOf(PublicKey);
    expect(typeof vaultBump).toBe('number');
    expect(vaultPda.equals(walletPda)).toBe(false);
  });
});

describe('findIntentPDA', () => {
  it('indices 0, 1, 2 produce three different PDAs', () => {
    const [walletPda] = findWalletPDA(CREATE_KEY_A);
    const [pda0] = findIntentPDA(walletPda, 0);
    const [pda1] = findIntentPDA(walletPda, 1);
    const [pda2] = findIntentPDA(walletPda, 2);

    expect(pda0.equals(pda1)).toBe(false);
    expect(pda1.equals(pda2)).toBe(false);
    expect(pda0.equals(pda2)).toBe(false);
  });
});

describe('findProposalPDA', () => {
  it('indices 0n and 1n produce two different PDAs', () => {
    const [walletPda] = findWalletPDA(CREATE_KEY_A);
    const [intentPda] = findIntentPDA(walletPda, 0);
    const [pda0] = findProposalPDA(intentPda, 0n);
    const [pda1] = findProposalPDA(intentPda, 1n);

    expect(pda0.equals(pda1)).toBe(false);
  });
});
