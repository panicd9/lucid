import { PublicKey } from '@solana/web3.js';
import {
  DEMO_WALLET_NAME,
  DEMO_WALLET_ADDRESS,
  DEMO_WALLET_SNAPSHOT,
} from '../fixtures/demoWallet';
import {
  deserializeWallet,
  deserializeIntent,
  deserializeProposal,
  WalletAccount,
  IntentAccount,
  ProposalAccount,
} from './deserialize';
import { findVaultPDA } from './pda';

export { DEMO_WALLET_NAME, DEMO_WALLET_ADDRESS };

export interface DemoWalletData {
  address: PublicKey;
  vaultAddress: PublicKey;
  wallet: WalletAccount;
  intents: IntentAccount[];
  proposals: Array<{ address: PublicKey; data: ProposalAccount }>;
}

let cached: DemoWalletData | null = null;

export function getDemoWalletData(): DemoWalletData {
  if (cached) return cached;

  const address = new PublicKey(DEMO_WALLET_ADDRESS);
  const [vaultAddress] = findVaultPDA(address);

  const wallet = deserializeWallet(Buffer.from(DEMO_WALLET_SNAPSHOT.wallet.data, 'base64'));
  // Override the on-chain name ("treasury") with the public demo name so the URL
  // and the page header agree.
  wallet.name = DEMO_WALLET_NAME;

  const intents = DEMO_WALLET_SNAPSHOT.intents.map((i) =>
    deserializeIntent(Buffer.from(i.data, 'base64')),
  );

  const proposals = DEMO_WALLET_SNAPSHOT.proposals.map((p) => ({
    address: new PublicKey(p.address),
    data: deserializeProposal(Buffer.from(p.data, 'base64')),
  }));

  cached = { address, vaultAddress, wallet, intents, proposals };
  return cached;
}

export function isDemoWalletId(addressOrName: string | undefined): boolean {
  if (!addressOrName) return false;
  return addressOrName === DEMO_WALLET_NAME || addressOrName === DEMO_WALLET_ADDRESS;
}
