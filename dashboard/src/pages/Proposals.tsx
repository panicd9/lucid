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
          <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-500 animate-spin" />
        </div>
        <p className="text-sm text-neutral-400">Loading proposals...</p>
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
        <p className="text-xs text-neutral-500">{error}</p>
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
        <span className="text-neutral-200 font-medium">Proposals</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-neutral-50 font-heading">
              Proposals
            </h1>
            {proposals.length > 0 && (
              <span className="text-xs font-mono text-neutral-500 bg-neutral-800/60 px-2.5 py-1 rounded-full border border-neutral-700/40">
                {proposals.length}
              </span>
            )}
          </div>
          {walletData && (
            <p className="text-sm text-neutral-500">
              {walletData.wallet.name}
            </p>
          )}
        </div>
        <Link
          to={`/wallet/${address}`}
          className="inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-semibold rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/15 hover:border-emerald-500/30 transition-all cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">New Proposal</span>
        </Link>
      </div>

      {/* Active */}
      <section className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-5 rounded-full bg-gradient-to-b from-emerald-500 to-emerald-500/30" />
          <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
            Active &amp; Pending
          </h2>
          <span className="text-xs font-mono text-emerald-400/70">{activeProposals.length}</span>
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
          <div className="border border-dashed border-neutral-800 rounded-xl p-8 text-center">
            <p className="text-sm text-neutral-500">No active proposals</p>
          </div>
        )}
      </section>

      {/* Past */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-5 rounded-full bg-gradient-to-b from-neutral-600 to-neutral-600/30" />
          <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
            Past
          </h2>
          <span className="text-xs font-mono text-neutral-500">{pastProposals.length}</span>
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
          <div className="border border-dashed border-neutral-800 rounded-xl p-8 text-center">
            <p className="text-sm text-neutral-500">No past proposals</p>
          </div>
        )}
      </section>
    </div>
  );
}
