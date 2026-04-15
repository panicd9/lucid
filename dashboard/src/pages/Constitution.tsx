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
        <div className="relative w-12 h-12 mb-5">
          <div className="absolute inset-0 rounded-full border-2 border-amber-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-500 animate-spin" />
        </div>
        <p className="text-sm text-slate-400">Loading wallet...</p>
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
        <p className="text-sm font-medium text-red-400 mb-1">Failed to load wallet</p>
        <p className="text-xs text-slate-500 max-w-sm text-center">{error}</p>
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
      {/* Header card */}
      <div className="relative rounded-2xl overflow-hidden mb-8">
        {/* Gradient border */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/20 via-transparent to-violet-500/20 p-[1px]">
          <div className="w-full h-full rounded-2xl bg-slate-900/90" />
        </div>

        <div className="relative p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-slate-50 font-heading tracking-wide">
                  {wallet.name}
                </h1>
                <FrozenStatusBadge frozen={wallet.frozen} />
              </div>
              <AddressDisplay address={walletAddr} chars={8} />
            </div>
            <Link
              to={`/wallet/${address}/proposals`}
              className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-sm font-semibold rounded-lg transition-all cursor-pointer shadow-glow-purple hover:shadow-glow-purple-lg"
            >
              View Proposals
            </Link>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-800/40 rounded-xl px-4 py-3 border border-slate-700/30">
              <div className="flex items-center gap-2 mb-1.5">
                <svg className="w-3.5 h-3.5 text-amber-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Intents</p>
              </div>
              <p className="text-xl font-bold text-slate-100 font-heading">{wallet.intentCount}</p>
            </div>
            <div className="bg-slate-800/40 rounded-xl px-4 py-3 border border-slate-700/30">
              <div className="flex items-center gap-2 mb-1.5">
                <svg className="w-3.5 h-3.5 text-violet-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Proposals</p>
              </div>
              <p className="text-xl font-bold text-slate-100 font-heading">{wallet.proposalIndex.toString()}</p>
            </div>
            <div className="bg-slate-800/40 rounded-xl px-4 py-3 border border-slate-700/30">
              <div className="flex items-center gap-2 mb-1.5">
                <svg className="w-3.5 h-3.5 text-emerald-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Vault</p>
              </div>
              <AddressDisplay address={data.vaultAddress.toBase58()} chars={6} />
            </div>
            <div className="bg-slate-800/40 rounded-xl px-4 py-3 border border-slate-700/30">
              <div className="flex items-center gap-2 mb-1.5">
                <svg className="w-3.5 h-3.5 text-slate-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Create Key</p>
              </div>
              <AddressDisplay address={wallet.createKey.toBase58()} chars={6} />
            </div>
          </div>
        </div>
      </div>

      {/* Meta-Intents */}
      {metaIntents.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-5 rounded-full bg-gradient-to-b from-amber-500 to-amber-500/30" />
            <h2 className="text-base font-semibold text-slate-200 font-heading tracking-wide">Meta-Intents</h2>
            <span className="text-[10px] text-slate-500 bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-700/40 uppercase tracking-wider">
              Governance
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
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-5 rounded-full bg-gradient-to-b from-violet-500 to-violet-500/30" />
          <h2 className="text-base font-semibold text-slate-200 font-heading tracking-wide">Protocol Intents</h2>
          <span className="text-[10px] text-slate-500 bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-700/40 uppercase tracking-wider">
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
          <div className="border border-dashed border-slate-800 rounded-xl p-10 text-center">
            <svg className="w-8 h-8 text-slate-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <p className="text-sm text-slate-500">No protocol intents defined yet</p>
          </div>
        )}
      </section>
    </div>
  );
}
