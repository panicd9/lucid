import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { RPC_ENDPOINTS } from '../lib/constants';
import { findIntentPDA, findProposalPDA } from '../lib/pda';
import {
  ProposalAccount,
  IntentAccount,
  deserializeProposal,
} from '../lib/deserialize';

export interface ProposalWithMeta extends ProposalAccount {
  address: PublicKey;
  intentData?: IntentAccount;
}

export function useProposals(
  walletAddress: string | undefined,
  proposalCount: bigint | undefined,
  intents: IntentAccount[] | undefined,
  network: string
) {
  const [proposals, setProposals] = useState<ProposalWithMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress || proposalCount === undefined) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const connection = new Connection(
          RPC_ENDPOINTS[network] || RPC_ENDPOINTS.devnet,
          'confirmed'
        );

        const wallet = new PublicKey(walletAddress);
        const total = Number(proposalCount);
        const results: ProposalWithMeta[] = [];

        // Fetch last 20 proposals (or all if fewer)
        const startIdx = Math.max(0, total - 20);

        // For each intent, try to find proposals
        // Proposals are derived from intent address + proposal_index
        // We iterate global proposal indices and try each intent
        if (intents && intents.length > 0) {
          for (const intent of intents) {
            const [intentPda] = findIntentPDA(wallet, intent.intentIndex);

            // Try recent proposal indices
            for (let pi = startIdx; pi < total; pi++) {
              try {
                const [proposalPda] = findProposalPDA(intentPda, pi);
                const info = await connection.getAccountInfo(proposalPda);
                if (info) {
                  const proposal = deserializeProposal(Buffer.from(info.data));
                  results.push({
                    ...proposal,
                    address: proposalPda,
                    intentData: intent,
                  });
                }
              } catch {
                // Proposal doesn't exist for this intent+index combo
              }
            }
          }
        }

        // Sort by proposal index descending
        results.sort((a, b) => {
          if (a.proposalIndex > b.proposalIndex) return -1;
          if (a.proposalIndex < b.proposalIndex) return 1;
          return 0;
        });

        if (!cancelled) {
          setProposals(results);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Failed to fetch proposals');
          setProposals([]);
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
  }, [walletAddress, proposalCount, intents, network]);

  return { proposals, loading, error };
}
