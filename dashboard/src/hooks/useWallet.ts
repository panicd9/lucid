import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { PROGRAM_ID, RPC_ENDPOINTS, DISC_WALLET, PREFIX_LEN } from '../lib/constants';
import { findVaultPDA, findIntentPDA } from '../lib/pda';
import {
  WalletAccount,
  IntentAccount,
  deserializeWallet,
  deserializeIntent,
} from '../lib/deserialize';
import { getDemoWalletData, isDemoWalletId } from '../lib/demoWalletData';

export interface WalletData {
  address: PublicKey;
  vaultAddress: PublicKey;
  wallet: WalletAccount;
  intents: IntentAccount[];
  isDemo?: boolean;
}

export interface WalletCandidate {
  address: PublicKey;
  name: string;
  intentCount: number;
  frozen: boolean;
  proposalIndex: bigint;
}

// Wallet name starts at offset 50: PREFIX_LEN(2) + proposal_index(8) + intent_count(1) + frozen(1) + bump(1) + name_len(1) + reserved(4) + create_key(32)
const WALLET_NAME_OFFSET = PREFIX_LEN + 8 + 1 + 1 + 1 + 1 + 4 + 32;
const WALLET_NAME_LEN_OFFSET = PREFIX_LEN + 8 + 1 + 1 + 1; // offset 13

async function resolveWalletsByName(connection: Connection, name: string): Promise<WalletCandidate[]> {
  const nameBytes = Buffer.from(name, 'utf-8');
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(Buffer.from([DISC_WALLET])) } },
      { memcmp: { offset: WALLET_NAME_OFFSET, bytes: bs58.encode(nameBytes) } },
    ],
  });
  // Filter to exact name_len matches (memcmp is prefix-based)
  const candidates: WalletCandidate[] = [];
  for (const { pubkey, account } of accounts) {
    const nameLen = account.data[WALLET_NAME_LEN_OFFSET];
    if (nameLen === nameBytes.length) {
      const wallet = deserializeWallet(Buffer.from(account.data));
      candidates.push({
        address: pubkey,
        name: wallet.name,
        intentCount: wallet.intentCount,
        frozen: wallet.frozen,
        proposalIndex: wallet.proposalIndex,
      });
    }
  }
  return candidates;
}

function isValidPubkey(s: string): boolean {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

export function useLucidWallet(addressOrName: string | undefined, network: string, refreshKey = 0) {
  const [data, setData] = useState<WalletData | null>(null);
  const [candidates, setCandidates] = useState<WalletCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!addressOrName) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setCandidates(null);

    // Demo wallet: serve from bundled fixture, never hit RPC.
    if (isDemoWalletId(addressOrName)) {
      const demo = getDemoWalletData();
      setData({
        address: demo.address,
        vaultAddress: demo.vaultAddress,
        wallet: demo.wallet,
        intents: demo.intents,
        isDemo: true,
      });
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const connection = new Connection(
          RPC_ENDPOINTS[network] || RPC_ENDPOINTS.devnet,
          'confirmed'
        );

        let walletAddress: PublicKey;

        if (isValidPubkey(addressOrName)) {
          walletAddress = new PublicKey(addressOrName);
        } else {
          // Name-based lookup
          const matches = await resolveWalletsByName(connection, addressOrName);
          if (matches.length === 0) {
            throw new Error(`No wallet found with name "${addressOrName}"`);
          }
          if (matches.length > 1) {
            if (!cancelled) {
              setCandidates(matches);
              setLoading(false);
            }
            return;
          }
          walletAddress = matches[0].address;
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
  }, [addressOrName, network, refreshKey]);

  return { data, candidates, loading, error };
}
