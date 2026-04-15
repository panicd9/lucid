import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLucidWallet } from '../hooks/useWallet';
import { useProposals } from '../hooks/useProposals';
import ProposalCard from '../components/ProposalCard';
import { STATUS_ACTIVE, STATUS_APPROVED } from '../lib/constants';
import WalletDisambiguation from '../components/WalletDisambiguation';

interface Props {
  network: string;
}

export default function Proposals({ network }: Props) {
  const { address } = useParams<{ address: string }>();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: walletData, candidates, loading: walletLoading, error: walletError } = useLucidWallet(address, network, refreshKey);

  if (candidates && candidates.length > 1) {
    return <WalletDisambiguation name={address ?? ''} candidates={candidates} pathSuffix="/proposals" />;
  }

  const {
    proposals,
    loading: proposalsLoading,
    error: proposalsError,
  } = useProposals(
    walletData?.address.toBase58(),
    walletData?.wallet.proposalIndex,
    walletData?.intents,
    network
  );

  const loading = walletLoading || proposalsLoading;
  const error = walletError || proposalsError;

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="relative w-12 h-12 mb-5">
          <div className="absolute inset-0 rounded-full border-2 border-amber-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-500 animate-spin" />
        </div>
        <p className="text-sm text-slate-400">Loading proposals...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/15 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-red-400 mb-1">Failed to load proposals</p>
        <p className="text-xs text-slate-500">{error}</p>
      </div>
    );
  }

  const walletName = walletData?.wallet.name ?? '';
  const walletAddr = walletData?.address.toBase58() ?? '';

  const activeProposals = proposals.filter(
    (p) => p.status === STATUS_ACTIVE || p.status === STATUS_APPROVED
  );
  const pastProposals = proposals.filter(
    (p) => p.status !== STATUS_ACTIVE && p.status !== STATUS_APPROVED
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link
              to={`/wallet/${address}`}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1 -ml-1 rounded-lg hover:bg-slate-800/50"
              aria-label="Back to constitution"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-slate-50 font-heading tracking-wide">
              Proposals
            </h1>
            {proposals.length > 0 && (
              <span className="text-xs font-mono text-slate-500 bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-700/40">
                {proposals.length}
              </span>
            )}
          </div>
          {walletData && (
            <p className="text-sm text-slate-500 ml-9">
              {walletData.wallet.name}
            </p>
          )}
        </div>
      </div>

      {/* Active */}
      <section className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-5 rounded-full bg-gradient-to-b from-amber-500 to-amber-500/30" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Active &amp; Pending
          </h2>
          <span className="text-xs font-mono text-amber-400/70">{activeProposals.length}</span>
        </div>
        {activeProposals.length > 0 ? (
          <div className="space-y-3">
            {activeProposals.map((p) => (
              <ProposalCard
                key={p.address.toBase58()}
                proposal={p}
                walletName={walletName}
                walletAddress={walletAddr}
                network={network}
                onRefresh={handleRefresh}
              />
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-slate-800 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-500">No active proposals</p>
          </div>
        )}
      </section>

      {/* Past */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-5 rounded-full bg-gradient-to-b from-slate-600 to-slate-600/30" />
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Past
          </h2>
          <span className="text-xs font-mono text-slate-500">{pastProposals.length}</span>
        </div>
        {pastProposals.length > 0 ? (
          <div className="space-y-3">
            {pastProposals.map((p) => (
              <ProposalCard
                key={p.address.toBase58()}
                proposal={p}
                walletName={walletName}
                walletAddress={walletAddr}
                network={network}
                onRefresh={handleRefresh}
              />
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-slate-800 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-500">No past proposals</p>
          </div>
        )}
      </section>
    </div>
  );
}
