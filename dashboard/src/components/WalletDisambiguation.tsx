import { useNavigate } from 'react-router-dom';
import type { WalletCandidate } from '../hooks/useWallet';
import AddressDisplay from './AddressDisplay';

interface Props {
  name: string;
  candidates: WalletCandidate[];
  /** Path suffix appended after /wallet/:address, e.g. "/proposals" */
  pathSuffix?: string;
}

export default function WalletDisambiguation({ name, candidates, pathSuffix = '' }: Props) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center pt-16 pb-12">
      <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-100 mb-1">Multiple wallets named "{name}"</h2>
      <p className="text-sm text-slate-400 mb-8">Select which wallet you want to view</p>

      <div className="w-full max-w-lg space-y-2">
        {candidates.map((c) => {
          const addr = c.address.toBase58();
          return (
            <button
              key={addr}
              onClick={() => navigate(`/wallet/${addr}${pathSuffix}`)}
              className="w-full text-left px-4 py-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-slate-600 hover:bg-slate-800 transition-colors group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-slate-200 group-hover:text-amber-400 transition-colors">
                      {c.name}
                    </p>
                    {c.frozen && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Frozen
                      </span>
                    )}
                  </div>
                  <AddressDisplay address={addr} chars={8} />
                  <div className="flex gap-4 mt-1.5 text-xs text-slate-500">
                    <span>{c.intentCount} intent{c.intentCount !== 1 ? 's' : ''}</span>
                    <span>{c.proposalIndex.toString()} proposal{c.proposalIndex !== 1n ? 's' : ''}</span>
                  </div>
                </div>
                <svg
                  className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
