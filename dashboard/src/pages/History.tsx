import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Connection, PublicKey } from '@solana/web3.js';
import { useLucidWallet } from '../hooks/useWallet';
import { RPC_ENDPOINTS, PROGRAM_ID } from '../lib/constants';
import { getExplorerTxUrl } from '../lib/explorer';
import { findVaultPDA } from '../lib/pda';
import WalletDisambiguation from '../components/WalletDisambiguation';

interface TxEntry {
  signature: string;
  action: string;
  proposalIndex: string;
  timestamp: number;
  status: 'confirmed' | 'failed';
}

const ACTION_BADGE: Record<string, string> = {
  propose: 'text-emerald-300 bg-emerald-500/10',
  approve: 'text-emerald-300 bg-emerald-500/10',
  cancel: 'text-red-300 bg-red-500/10',
  execute: 'text-emerald-300 bg-emerald-500/10',
  create: 'text-neutral-300 bg-neutral-500/10',
  'add intent': 'text-emerald-300 bg-emerald-500/10',
  'batch add': 'text-emerald-300 bg-emerald-500/10',
  deactivate: 'text-red-300 bg-red-500/10',
  freeze: 'text-neutral-300 bg-neutral-500/10',
  cleanup: 'text-neutral-300 bg-neutral-500/10',
  event: 'text-neutral-400 bg-neutral-500/10',
  unknown: 'text-neutral-400 bg-neutral-500/10',
};

const DISC_MAP: Record<number, string> = {
  0: 'create',
  1: 'add intent',
  2: 'batch add',
  3: 'deactivate',
  4: 'freeze',
  10: 'propose',
  11: 'approve',
  12: 'cancel',
  20: 'execute',
  30: 'cleanup',
  228: 'event',
};

interface Props {
  network: string;
}

export default function History({ network }: Props) {
  const { address } = useParams<{ address: string }>();
  const { data: walletData, candidates, loading: walletLoading, error: walletError } = useLucidWallet(address, network);
  const [transactions, setTransactions] = useState<TxEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedSig, setCopiedSig] = useState<string | null>(null);

  const walletAddr = walletData?.address.toBase58();

  useEffect(() => {
    if (!walletAddr) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const connection = new Connection(
          RPC_ENDPOINTS[network] || RPC_ENDPOINTS.devnet,
          'confirmed'
        );

        const walletPk = new PublicKey(walletAddr);
        const [vaultPk] = findVaultPDA(walletPk);

        // Query both wallet and vault PDAs, then deduplicate
        const [walletSigs, vaultSigs] = await Promise.all([
          connection.getSignaturesForAddress(walletPk, { limit: 50 }),
          connection.getSignaturesForAddress(vaultPk, { limit: 50 }),
        ]);
        const seen = new Set<string>();
        const sigs = [...walletSigs, ...vaultSigs].filter((s) => {
          if (seen.has(s.signature)) return false;
          seen.add(s.signature);
          return true;
        }).sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0)).slice(0, 50);

        const entries: TxEntry[] = [];

        for (const sig of sigs) {
          let action = 'unknown';
          let proposalIndex = '-';

          // Try to parse the transaction to get the action type
          try {
            const tx = await connection.getTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0,
            });
            if (tx?.transaction.message) {
              const msg = tx.transaction.message;
              // Find our program's instruction
              const compiledIxs = 'compiledInstructions' in msg
                ? (msg as any).compiledInstructions
                : null;
              const staticKeys = 'staticAccountKeys' in msg
                ? (msg as any).staticAccountKeys
                : null;

              if (compiledIxs && staticKeys) {
                for (const ix of compiledIxs) {
                  const programKey = staticKeys[ix.programIdIndex];
                  if (programKey && programKey.toBase58() === PROGRAM_ID.toBase58()) {
                    const disc = ix.data[0];
                    action = DISC_MAP[disc] ?? 'unknown';
                    // Extract proposal index for propose instructions
                    if (disc === 10 && ix.data.length >= 9) {
                      const view = new DataView(new Uint8Array(ix.data).buffer);
                      proposalIndex = view.getBigUint64(1, true).toString();
                    }
                    break;
                  }
                }
              }
            }
          } catch {
            // If parsing fails, we still show the entry with 'unknown' action
          }

          entries.push({
            signature: sig.signature,
            action,
            proposalIndex,
            timestamp: sig.blockTime ?? 0,
            status: sig.err ? 'failed' : 'confirmed',
          });
        }

        if (!cancelled) {
          setTransactions(entries);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Failed to fetch transaction history');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [walletAddr, network]);

  const handleCopy = async (sig: string) => {
    await navigator.clipboard.writeText(sig);
    setCopiedSig(sig);
    setTimeout(() => setCopiedSig(null), 1500);
  };

  const pageLoading = walletLoading || loading;
  const pageError = walletError || error;

  if (candidates && candidates.length > 1) {
    return <WalletDisambiguation name={address ?? ''} candidates={candidates} pathSuffix="/history" />;
  }

  if (pageLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="relative w-12 h-12 mb-5">
          <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-500 animate-spin" />
        </div>
        <p className="text-sm text-neutral-400">Loading audit log...</p>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/15 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-red-400 mb-1">Failed to load audit log</p>
        <p className="text-xs text-neutral-500">{pageError}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm mb-6" aria-label="Breadcrumb">
        <Link to="/" className="text-neutral-500 hover:text-emerald-400 transition-colors cursor-pointer flex items-center">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
        </Link>
        <svg className="w-3.5 h-3.5 text-neutral-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <Link to={`/wallet/${address}`} className="text-neutral-400 hover:text-emerald-400 transition-colors cursor-pointer truncate max-w-[160px]">
          {walletData?.wallet.name || address}
        </Link>
        <svg className="w-3.5 h-3.5 text-neutral-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <span className="text-neutral-200 font-medium">Audit Log</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-50 font-heading mb-1">
            Audit Log
          </h1>
          <p className="text-sm text-neutral-500">Transaction history for {walletData?.wallet.name}</p>
        </div>
      </div>

      {/* Table */}
      {transactions.length > 0 ? (
        <div className="bg-neutral-900/50 border border-neutral-800/60 rounded-xl overflow-hidden">
          {/* Table header — desktop */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 bg-neutral-800/30 border-b border-neutral-800/50">
            <span className="col-span-3 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Signature</span>
            <span className="col-span-2 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Action</span>
            <span className="col-span-2 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Proposal</span>
            <span className="col-span-3 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Timestamp</span>
            <span className="col-span-2 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider text-right">Status</span>
          </div>

          {/* Desktop rows */}
          <div className="hidden md:block">
            {transactions.map((tx) => (
              <div
                key={tx.signature}
                className="grid grid-cols-12 gap-4 px-5 py-3.5 border-b border-neutral-800/30 last:border-b-0 hover:bg-neutral-800/20 transition-colors"
              >
                <div className="col-span-3 flex items-center gap-2 min-w-0">
                  <a
                    href={getExplorerTxUrl(tx.signature, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-neutral-400 hover:text-emerald-300 truncate transition-colors"
                  >
                    {tx.signature.slice(0, 8)}...{tx.signature.slice(-6)}
                  </a>
                  <button
                    onClick={() => handleCopy(tx.signature)}
                    className="shrink-0 text-neutral-600 hover:text-neutral-400 transition-colors cursor-pointer"
                    aria-label="Copy signature"
                  >
                    {copiedSig === tx.signature ? (
                      <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="col-span-2 flex items-center">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${ACTION_BADGE[tx.action] || ACTION_BADGE.unknown}`}>
                    {tx.action}
                  </span>
                </div>
                <div className="col-span-2 flex items-center">
                  <span className="text-xs font-mono text-neutral-400">
                    {tx.proposalIndex !== '-' ? `#${tx.proposalIndex}` : '-'}
                  </span>
                </div>
                <div className="col-span-3 flex items-center">
                  <span className="text-xs text-neutral-500">
                    {tx.timestamp > 0 ? new Date(tx.timestamp * 1000).toLocaleString() : '-'}
                  </span>
                </div>
                <div className="col-span-2 flex items-center justify-end">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    tx.status === 'confirmed'
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-red-400 bg-red-500/10'
                  }`}>
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3 p-4">
            {transactions.map((tx) => (
              <div key={tx.signature} className="bg-neutral-800/30 border border-neutral-800/50 rounded-lg p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${ACTION_BADGE[tx.action] || ACTION_BADGE.unknown}`}>
                    {tx.action}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    tx.status === 'confirmed' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                  }`}>
                    {tx.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <a
                    href={getExplorerTxUrl(tx.signature, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-neutral-400 hover:text-emerald-300 transition-colors"
                  >
                    {tx.signature.slice(0, 8)}...{tx.signature.slice(-6)}
                  </a>
                  <span className="text-xs font-mono text-neutral-500">
                    {tx.proposalIndex !== '-' ? `#${tx.proposalIndex}` : ''}
                  </span>
                </div>
                <span className="text-[11px] text-neutral-600">
                  {tx.timestamp > 0 ? new Date(tx.timestamp * 1000).toLocaleString() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-neutral-900/50 border border-neutral-800/60 rounded-xl px-6 py-16 flex flex-col items-center justify-center text-center">
          <svg className="w-12 h-12 text-neutral-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-neutral-400 font-medium mb-1">No transactions yet</p>
          <p className="text-xs text-neutral-600">Transactions will appear here once proposals are created or executed.</p>
        </div>
      )}
    </div>
  );
}
