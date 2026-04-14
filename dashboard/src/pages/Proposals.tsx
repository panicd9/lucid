import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLucidWallet } from '../hooks/useWallet';
import { useProposals } from '../hooks/useProposals';
import ProposalCard from '../components/ProposalCard';
import { STATUS_ACTIVE, STATUS_APPROVED } from '../lib/constants';

interface Props {
  network: string;
}

export default function Proposals({ network }: Props) {
  const { address } = useParams<{ address: string }>();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: walletData, loading: walletLoading, error: walletError } = useLucidWallet(address, network, refreshKey);

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
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400">Loading proposals...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-sm text-red-400 mb-1">Failed to load proposals</p>
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              to={`/wallet/${address}`}
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-slate-100">
              Proposals
            </h1>
          </div>
          {walletData && (
            <p className="text-sm text-slate-400 ml-7">
              {walletData.wallet.name} &mdash; {proposals.length} proposal{proposals.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Active */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
          Active &amp; Pending ({activeProposals.length})
        </h2>
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
          <div className="border border-slate-700/50 border-dashed rounded-lg p-6 text-center">
            <p className="text-sm text-slate-500">No active proposals</p>
          </div>
        )}
      </section>

      {/* Past */}
      <section>
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
          Past ({pastProposals.length})
        </h2>
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
          <div className="border border-slate-700/50 border-dashed rounded-lg p-6 text-center">
            <p className="text-sm text-slate-500">No past proposals</p>
          </div>
        )}
      </section>
    </div>
  );
}
