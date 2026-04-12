import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  findWalletPDA,
  findVaultPDA,
  findIntentPDA,
  findProposalPDA,
} from '../pda';

describe('findWalletPDA', () => {
  it('is deterministic: same name produces same PDA and bump', () => {
    const [pda1, bump1] = findWalletPDA('treasury');
    const [pda2, bump2] = findWalletPDA('treasury');
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it('different names produce different PDAs', () => {
    const [pdaA] = findWalletPDA('alpha');
    const [pdaB] = findWalletPDA('bravo');
    expect(pdaA.equals(pdaB)).toBe(false);
  });
});

describe('findVaultPDA', () => {
  it('chains from wallet PDA', () => {
    const [walletPda] = findWalletPDA('treasury');
    const [vaultPda, vaultBump] = findVaultPDA(walletPda);
    expect(vaultPda).toBeInstanceOf(PublicKey);
    expect(typeof vaultBump).toBe('number');
    // Vault PDA should differ from wallet PDA
    expect(vaultPda.equals(walletPda)).toBe(false);
  });
});

describe('findIntentPDA', () => {
  it('indices 0, 1, 2 produce three different PDAs', () => {
    const [walletPda] = findWalletPDA('treasury');
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
    const [walletPda] = findWalletPDA('treasury');
    const [intentPda] = findIntentPDA(walletPda, 0);
    const [pda0] = findProposalPDA(intentPda, 0n);
    const [pda1] = findProposalPDA(intentPda, 1n);

    expect(pda0.equals(pda1)).toBe(false);
  });
});
