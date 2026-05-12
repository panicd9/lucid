import { describe, expect, it } from 'vitest';
import { Buffer } from 'buffer';
import { PublicKey } from '@solana/web3.js';
import splTransfer from '../../templates/spl-transfer.json';

/**
 * Proves the SPL Transfer preset's seed[1] is the 32-byte SPL Token Program
 * ID (not just byte 0), so the source PDA the dashboard's execute path
 * derives matches the canonical Associated Token Account.
 *
 * Canonical ATA derivation (per @solana/spl-token):
 *     getAssociatedTokenAddressSync(mint, owner) =
 *       findProgramAddressSync([owner, SPL_TOKEN_PROGRAM_ID, mint], ATA_PROGRAM_ID)
 *
 * This test would have failed against the original `value: [6]` seed —
 * locked here to prevent regression.
 */
const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

function getLiteralSeed(): number[] {
  const lit = splTransfer.seeds.find((s) => s.seedType === 'literal');
  if (!lit || !Array.isArray(lit.value)) throw new Error('no literal seed');
  return lit.value as number[];
}

describe('SPL Transfer preset — ATA correctness', () => {
  it('seed[1] equals 32-byte SPL Token Program ID', () => {
    const seedBytes = Buffer.from(getLiteralSeed());
    expect(seedBytes.length).toBe(32);
    expect(seedBytes.equals(SPL_TOKEN_PROGRAM_ID.toBuffer())).toBe(true);
  });

  it('Lucid-derived source PDA matches getAssociatedTokenAddressSync output', () => {
    // Arbitrary representative inputs:
    //   owner = a Lucid vault PDA (any valid pubkey works for derivation)
    //   mint  = USDC mainnet mint
    const owner = new PublicKey('Drft9876vauLT5tmAyJ5d8FE4HZkhdBxkP9PDArP1aaa');
    const mint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

    // Build seeds the same way resolveAccounts.ts does at execute time:
    //   seeds[0] = account[3] (vault/authority)  → owner.toBuffer()
    //   seeds[1] = literal value (must be 32-byte SPL Token Program ID)
    //   seeds[2] = account[1] (mint)             → mint.toBuffer()
    const lucidSeeds = [
      owner.toBuffer(),
      Buffer.from(getLiteralSeed()),
      mint.toBuffer(),
    ];
    const lucidPda = PublicKey.findProgramAddressSync(lucidSeeds, ATA_PROGRAM_ID)[0];

    // Canonical ATA derivation (mirrors getAssociatedTokenAddressSync exactly):
    const canonicalSeeds = [
      owner.toBuffer(),
      SPL_TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ];
    const canonicalAta = PublicKey.findProgramAddressSync(canonicalSeeds, ATA_PROGRAM_ID)[0];

    expect(lucidPda.toBase58()).toBe(canonicalAta.toBase58());
  });

  it('derivation is consistent across different owner+mint pairs', () => {
    // Two more pairs to rule out a coincidental match
    for (const [ownerB58, mintB58] of [
      ['11111111111111111111111111111112', 'So11111111111111111111111111111111111111112'],
      ['Drft9876vauLT5tmAyJ5d8FE4HZkhdBxkP9PDArP1aaa', 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So'],
    ] as const) {
      const owner = new PublicKey(ownerB58);
      const mint = new PublicKey(mintB58);

      const lucid = PublicKey.findProgramAddressSync(
        [owner.toBuffer(), Buffer.from(getLiteralSeed()), mint.toBuffer()],
        ATA_PROGRAM_ID,
      )[0];
      const canonical = PublicKey.findProgramAddressSync(
        [owner.toBuffer(), SPL_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        ATA_PROGRAM_ID,
      )[0];
      expect(lucid.toBase58()).toBe(canonical.toBase58());
    }
  });
});
