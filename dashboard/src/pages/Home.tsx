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
    <div className="flex flex-col items-center pt-20 pb-16">
      {/* Hero — T2 Logo */}
      <div className="relative mb-6">
        <div className="absolute inset-0 -m-8 bg-gradient-radial from-amber-500/10 via-violet-500/5 to-transparent rounded-full blur-2xl" />
        <div className="relative inline-block" style={{ fontFamily: "'Orbitron', monospace", fontSize: '48px', fontWeight: 600, letterSpacing: '12px', background: 'linear-gradient(90deg, #e2e8f0, #f8fafc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textTransform: 'uppercase' as const }}>
          LUCID
          <span className="absolute bottom-[-6px] left-0 right-0 h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, #F59E0B, #8B5CF6)' }} />
        </div>
      </div>
      <p className="text-lg text-slate-400 mb-4">Intent-Based Multisig Protocol</p>

      {/* Feature pills */}
      <div className="flex items-center gap-3 mb-12">
        <span className="px-3 py-1 text-xs font-medium text-amber-400/80 bg-amber-500/10 border border-amber-500/15 rounded-full">
          Tamperproof Signing
        </span>
        <span className="px-3 py-1 text-xs font-medium text-violet-400/80 bg-violet-500/10 border border-violet-500/15 rounded-full">
          On-Chain Constitution
        </span>
        <span className="px-3 py-1 text-xs font-medium text-slate-400/80 bg-slate-500/10 border border-slate-500/15 rounded-full">
          Pinocchio Runtime
        </span>
      </div>

      {/* Search */}
      <form onSubmit={handleSubmit} className="w-full max-w-lg mb-16">
        <div className="relative group">
          {/* Gradient border glow on focus */}
          <div className="absolute -inset-[1px] rounded-xl bg-gradient-to-r from-amber-500/20 via-violet-500/20 to-amber-500/20 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
          <div className="relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-amber-400/70 transition-colors"
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
              className="w-full pl-12 pr-24 py-3.5 bg-slate-900/80 border border-slate-700/50 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/30 transition-all text-base"
              autoFocus
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2 bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-sm font-semibold rounded-lg transition-all cursor-pointer shadow-glow-purple hover:shadow-glow-purple-lg"
            >
              View
            </button>
          </div>
        </div>
      </form>

      {/* Demo wallets */}
      {DEMO_WALLETS.length > 0 && (
        <div className="w-full max-w-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-slate-800" />
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Demo Wallets
            </h3>
            <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-slate-800" />
          </div>
          <div className="space-y-2">
            {DEMO_WALLETS.map((w) => (
              <button
                key={w.name}
                onClick={() => navigate(`/wallet/${w.name}`)}
                className="w-full text-left px-5 py-4 bg-slate-900/50 border border-slate-800/80 rounded-xl hover:border-slate-700/80 hover:bg-slate-800/50 transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                      {w.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{w.description}</p>
                  </div>
                  <svg
                    className="w-4 h-4 text-slate-700 group-hover:text-amber-400/50 group-hover:translate-x-0.5 transition-all"
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
      )}

      {/* Footer note */}
      <p className="text-xs text-slate-600 mt-20">
        Read-only explorer &mdash; connect wallet to propose and sign on-chain
      </p>
    </div>
  );
}
