import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEMO_WALLETS } from '../lib/constants';

export default function Home() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = search.trim();
    if (value) {
      navigate(`/wallet/${value}`);
    }
  };

  return (
    <div className="flex flex-col items-center pt-16 pb-12">
      {/* Hero */}
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-6">
        <svg className="w-9 h-9 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      </div>
      <h1 className="text-4xl font-bold text-slate-100 mb-2 font-heading tracking-wider">Lucid</h1>
      <p className="text-lg text-slate-400 mb-10">Intent-Based Multisig Protocol</p>

      {/* Search */}
      <form onSubmit={handleSubmit} className="w-full max-w-lg mb-16">
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Enter wallet address or name..."
            aria-label="Search by wallet address or name"
            className="w-full pl-12 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all text-base"
            autoFocus
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            View
          </button>
        </div>
      </form>

      {/* Demo wallets */}
      <div className="w-full max-w-lg">
        <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
          Demo Wallets
        </h3>
        <div className="space-y-2">
          {DEMO_WALLETS.map((w) => (
            <button
              key={w.name}
              onClick={() => navigate(`/wallet/${w.name}`)}
              className="w-full text-left px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-slate-600 hover:bg-slate-800 transition-colors group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200 group-hover:text-emerald-400 transition-colors">
                    {w.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{w.description}</p>
                </div>
                <svg
                  className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-slate-600 mt-16">
        Read-only dashboard &mdash; connect to devnet or mainnet to view on-chain constitutions
      </p>
    </div>
  );
}
