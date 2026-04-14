import { PublicKey } from '@solana/web3.js';
import {
  PROGRAM_ID,
  WALLET_SEED,
  VAULT_SEED,
  INTENT_SEED,
  PROPOSAL_SEED,
  EVENT_AUTHORITY_SEED,
} from './constants';

export function findWalletPDA(createKey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [WALLET_SEED, createKey.toBuffer()],
    PROGRAM_ID
  );
}

export function findVaultPDA(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, wallet.toBuffer()],
    PROGRAM_ID
  );
}

export function findIntentPDA(
  wallet: PublicKey,
  index: number
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [INTENT_SEED, wallet.toBuffer(), Buffer.from([index])],
    PROGRAM_ID
  );
}

export function findProposalPDA(
  intent: PublicKey,
  proposalIndex: bigint | number
): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(proposalIndex));
  return PublicKey.findProgramAddressSync(
    [PROPOSAL_SEED, intent.toBuffer(), buf],
    PROGRAM_ID
  );
}

export function findEventAuthorityPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EVENT_AUTHORITY_SEED],
    PROGRAM_ID
  );
}
