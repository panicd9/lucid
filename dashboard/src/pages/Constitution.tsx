import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLucidWallet } from '../hooks/useWallet';
import { FrozenStatusBadge } from '../components/StatusBadge';
import AddressDisplay from '../components/AddressDisplay';
import IntentCard from '../components/IntentCard';
import WalletDisambiguation from '../components/WalletDisambiguation';

interface Props {
  network: string;
}

export default function Constitution({ network }: Props) {
  const { address } = useParams<{ address: string }>();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, candidates, loading, error } = useLucidWallet(address, network, refreshKey);

  if (candidates && candidates.length > 1) {
    return <WalletDisambiguation name={address ?? ''} candidates={candidates} />;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400">Loading wallet...</p>
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
        <p className="text-sm text-red-400 mb-1">Failed to load wallet</p>
        <p className="text-xs text-slate-500">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <p className="text-sm text-slate-500">No wallet data</p>
      </div>
    );
  }

  const { wallet, intents } = data;
  const walletAddr = data.address.toBase58();
  const handleRefresh = () => setRefreshKey((k) => k + 1);
  const metaIntents = intents.filter((i) => i.intentIndex <= 2);
  const protocolIntents = intents.filter((i) => i.intentIndex > 2);

  return (
    <div>
      {/* Header */}
      <div className="border border-slate-700/50 bg-slate-800/40 backdrop-blur-sm rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-slate-100 font-heading tracking-wide">{wallet.name}</h1>
              <FrozenStatusBadge frozen={wallet.frozen} />
            </div>
            <AddressDisplay address={data.address.toBase58()} chars={8} />
          </div>
          <Link
            to={`/wallet/${address}/proposals`}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer shadow-glow-purple"
          >
            View Proposals
          </Link>
        </div>

        {/* Stats — only wallet-level data, not aggregated from intents */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-700/50">
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Total Intents</p>
            <p className="text-lg font-semibold text-slate-200">{wallet.intentCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Proposals</p>
            <p className="text-lg font-semibold text-slate-200">{wallet.proposalIndex.toString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Vault</p>
            <AddressDisplay address={data.vaultAddress.toBase58()} chars={6} />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Create Key</p>
            <AddressDisplay address={wallet.createKey.toBase58()} chars={6} />
          </div>
        </div>
      </div>

      {/* Meta-Intents */}
      {metaIntents.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold text-slate-200">Meta-Intents</h2>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
              Governance rules
            </span>
          </div>
          <div className="space-y-2">
            {metaIntents.map((intent) => (
              <IntentCard
                key={intent.intentIndex}
                intent={intent}
                walletAddress={walletAddr}
                walletName={wallet.name}
                network={network}
                onRefresh={handleRefresh}
              />
            ))}
          </div>
        </section>
      )}

      {/* Protocol Intents */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold text-slate-200">Protocol Intents</h2>
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
            {protocolIntents.length} intent{protocolIntents.length !== 1 ? 's' : ''}
          </span>
        </div>
        {protocolIntents.length > 0 ? (
          <div className="space-y-2">
            {protocolIntents.map((intent) => (
              <IntentCard
                key={intent.intentIndex}
                intent={intent}
                walletAddress={walletAddr}
                walletName={wallet.name}
                network={network}
                onRefresh={handleRefresh}
              />
            ))}
          </div>
        ) : (
          <div className="border border-slate-700/50 border-dashed rounded-lg p-8 text-center">
            <p className="text-sm text-slate-500">No protocol intents defined yet</p>
          </div>
        )}
      </section>
    </div>
  );
}
