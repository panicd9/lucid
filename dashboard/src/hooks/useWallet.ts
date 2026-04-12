import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { RPC_ENDPOINTS } from '../lib/constants';
import { findWalletPDA, findVaultPDA, findIntentPDA } from '../lib/pda';
import {
  WalletAccount,
  IntentAccount,
  deserializeWallet,
  deserializeIntent,
} from '../lib/deserialize';

export interface WalletData {
  address: PublicKey;
  vaultAddress: PublicKey;
  wallet: WalletAccount;
  intents: IntentAccount[];
}

export function useWallet(addressOrName: string | undefined, network: string) {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!addressOrName) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const connection = new Connection(
          RPC_ENDPOINTS[network] || RPC_ENDPOINTS.devnet,
          'confirmed'
        );

        // Determine wallet address: if it looks like a base58 pubkey, use directly; else derive PDA from name
        let walletAddress: PublicKey;
        try {
          walletAddress = new PublicKey(addressOrName);
        } catch {
          // Treat as a wallet name
          const [pda] = findWalletPDA(addressOrName);
          walletAddress = pda;
        }

        // Fetch wallet account
        const walletAccountInfo = await connection.getAccountInfo(walletAddress);
        if (!walletAccountInfo) {
          throw new Error('Wallet account not found');
        }

        const wallet = deserializeWallet(
          Buffer.from(walletAccountInfo.data)
        );

        // Derive vault PDA
        const [vaultAddress] = findVaultPDA(walletAddress);

        // Fetch all intents
        const intents: IntentAccount[] = [];
        for (let i = 0; i < wallet.intentCount; i++) {
          const [intentPda] = findIntentPDA(walletAddress, i);
          const intentInfo = await connection.getAccountInfo(intentPda);
          if (intentInfo) {
            try {
              const intent = deserializeIntent(Buffer.from(intentInfo.data));
              intents.push(intent);
            } catch (e) {
              console.warn(`Failed to deserialize intent ${i}:`, e);
            }
          }
        }

        if (!cancelled) {
          setData({
            address: walletAddress,
            vaultAddress,
            wallet,
            intents,
          });
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Failed to fetch wallet');
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addressOrName, network]);

  return { data, loading, error };
}
