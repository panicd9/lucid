import { describe, it, expect } from 'vitest';
import {
  getDemoWalletData,
  isDemoWalletId,
  DEMO_WALLET_NAME,
  DEMO_WALLET_ADDRESS,
} from '../demoWalletData';
import { findIntentPDA } from '../pda';

describe('demo wallet fixture', () => {
  it('decodes wallet, intents and proposals from the bundled snapshot', () => {
    const demo = getDemoWalletData();
    expect(demo.address.toBase58()).toBe(DEMO_WALLET_ADDRESS);
    // Localnet treasury had 11 intents (meta + protocol) and 1 proposal.
    expect(demo.intents.length).toBe(11);
    expect(demo.proposals.length).toBe(1);
  });

  it('overrides the on-chain wallet name with the public demo slug', () => {
    const { wallet } = getDemoWalletData();
    expect(wallet.name).toBe(DEMO_WALLET_NAME);
  });

  it("matches each proposal's intent field to an intent PDA in the snapshot", () => {
    const demo = getDemoWalletData();
    for (const { data } of demo.proposals) {
      const matched = demo.intents.some((intent) => {
        const [pda] = findIntentPDA(demo.address, intent.intentIndex);
        return pda.equals(data.intent);
      });
      expect(matched).toBe(true);
    }
  });

  it('isDemoWalletId accepts both the name and the address', () => {
    expect(isDemoWalletId(DEMO_WALLET_NAME)).toBe(true);
    expect(isDemoWalletId(DEMO_WALLET_ADDRESS)).toBe(true);
    expect(isDemoWalletId('treasury')).toBe(false);
    expect(isDemoWalletId(undefined)).toBe(false);
  });
});
