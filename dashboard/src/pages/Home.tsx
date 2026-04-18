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
      {/* Hero — Logo */}
      <div className="relative mb-6">
        <div className="absolute inset-0 -m-8 bg-gradient-radial from-amber-500/10 via-violet-500/5 to-transparent rounded-full blur-2xl" />
        <div className="relative inline-block" style={{ fontFamily: "'Orbitron', monospace", fontSize: '48px', fontWeight: 600, letterSpacing: '12px', background: 'linear-gradient(90deg, #e2e8f0, #f8fafc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textTransform: 'uppercase' as const }}>
          LUCID
          <span className="absolute bottom-[-6px] left-0 right-0 h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, #F59E0B, #8B5CF6)' }} />
        </div>
      </div>
      <p className="text-lg text-slate-200 mb-2 font-medium">See what you sign. On your Ledger.</p>
      <p className="text-sm text-slate-500 max-w-md text-center mb-4">
        The multisig where hardware wallets display human-readable actions
        instead of hex. Auto-generated rulesets verified against program source.
      </p>

      {/* Feature pills */}
      <div className="flex items-center gap-3 mb-12">
        <span className="px-3 py-1 text-xs font-medium text-amber-400/80 bg-amber-500/10 border border-amber-500/15 rounded-full">
          Human-Readable Signing
        </span>
        <span className="px-3 py-1 text-xs font-medium text-violet-400/80 bg-violet-500/10 border border-violet-500/15 rounded-full">
          On-Chain Governance Ruleset
        </span>
        <span className="px-3 py-1 text-xs font-medium text-slate-400/80 bg-slate-500/10 border border-slate-500/15 rounded-full">
          Built on Solana
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

      {/* How It Works */}
      <div className="w-full max-w-6xl mt-24">
        <h2 className="text-2xl font-heading text-slate-100 text-center tracking-[4px] mb-3">
          HOW IT WORKS
        </h2>
        <p className="text-sm text-slate-500 text-center mb-14 max-w-lg mx-auto">
          Three steps from program source code to tamperproof governance.
        </p>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Step 1 */}
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-6 relative">
            <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-slate-900 text-xs font-bold flex items-center justify-center font-heading">
              1
            </div>
            <svg className="w-8 h-8 text-violet-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <h3 className="text-base font-semibold text-slate-100 mb-2">Define Permitted Actions</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Auto-generate governance intents from your program's IDL. Every admin action
              gets a human-readable template, verified against the source.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-6 relative">
            <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-slate-900 text-xs font-bold flex items-center justify-center font-heading">
              2
            </div>
            <svg className="w-8 h-8 text-violet-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h3 className="text-base font-semibold text-slate-100 mb-2">Sign What You Read</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Signers approve via <code className="text-amber-400/80 text-xs">signMessage</code> on their Ledger.
              The hardware wallet displays the action in plain English — not hex.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-6 relative">
            <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-slate-900 text-xs font-bold flex items-center justify-center font-heading">
              3
            </div>
            <svg className="w-8 h-8 text-violet-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3 className="text-base font-semibold text-slate-100 mb-2">Verify & Execute On-Chain</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              The program reconstructs the message from on-chain state, verifies
              ed25519 signatures, and executes the CPI — trustlessly.
            </p>
          </div>
        </div>

        {/* Before / After */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Before */}
          <div className="rounded-xl overflow-hidden border border-red-500/15">
            <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                What signers see today
              </p>
            </div>
            <div className="bg-slate-900/80 p-5 font-mono text-xs leading-relaxed">
              <p className="text-slate-600 mb-1">Program: dRif...3xQp</p>
              <p className="text-red-400/60">01 00 00 03 9a 2f b7 c4 e8 1d</p>
              <p className="text-red-400/60">a3 f0 42 8b 5c f6 dd 91 7e 2b</p>
              <p className="text-red-400/60">c0 14 88 3a 9f 62 d4 5e 71 b8</p>
              <p className="text-slate-600 mt-1">Data: 0x8f3a9b2c4d5e6f...</p>
              <p className="text-slate-700 mt-2 text-[10px]">Sign transaction?</p>
            </div>
          </div>

          {/* After */}
          <div className="rounded-xl overflow-hidden border border-emerald-500/15">
            <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                What Lucid signers read
              </p>
            </div>
            <div className="bg-slate-900/80 p-5 font-mono text-xs leading-relaxed">
              <p className="text-emerald-300/80">
                approve <span className="text-amber-400">add market 5</span>
              </p>
              <p className="text-emerald-300/80">
                with oracle <span className="text-amber-400">9abc...def</span>
              </p>
              <p className="text-emerald-300/80 mt-2 text-slate-500">
                | wallet: <span className="text-slate-400">drift-governance</span>
              </p>
              <p className="text-emerald-300/80 text-slate-500">
                | proposal: <span className="text-slate-400">42</span>
              </p>
              <p className="text-emerald-400/80 mt-2 text-[10px] flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Approve on trusted device
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-slate-600 mt-20">
        Connect wallet to propose, approve, and execute on-chain
      </p>
    </div>
  );
}
