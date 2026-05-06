import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="flex flex-col items-center pt-20 pb-16">
      {/* Hero — Logo */}
      <div className="relative mb-6 flex items-center gap-5">
        <div className="absolute inset-0 -m-8 bg-gradient-radial from-emerald-500/10 via-emerald-800/5 to-transparent rounded-full blur-2xl" />
        <img src="/logo.png" alt="" className="relative h-16 w-auto" />
        <div className="relative" style={{ fontSize: '48px', fontWeight: 600, letterSpacing: '12px', background: 'linear-gradient(90deg, #e2e8f0, #f8fafc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textTransform: 'uppercase' as const }}>
          LUCID
          <span className="absolute bottom-[-6px] left-0 right-0 h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, #059669, #10B981)' }} />
        </div>
      </div>
      <p className="text-lg text-neutral-200 mb-2 font-medium">See what you sign. On your Ledger.</p>
      <p className="text-sm text-neutral-500 max-w-md text-center mb-6">
        The multisig where hardware wallets display human-readable actions
        instead of hex. Auto-generated rulesets verified against program.
      </p>

      {/* CTAs */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/demo"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white transition-all cursor-pointer shadow-glow-green"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Try the Demo
        </Link>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Available after public launch"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-neutral-800/40 border border-neutral-700/30 text-neutral-500 cursor-not-allowed"
        >
          Create Wallet
          <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider px-1.5 py-0.5 bg-neutral-700/40 rounded font-heading">
            Soon
          </span>
        </button>
      </div>

      {/* Feature pills */}
      <div className="flex items-center gap-3 mb-12">
        <span className="px-3 py-1 text-xs font-medium text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/15 rounded-full">
          Human-Readable Signing
        </span>
        <span className="px-3 py-1 text-xs font-medium text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/15 rounded-full">
          On-Chain Governance Ruleset
        </span>
        <span className="px-3 py-1 text-xs font-medium text-neutral-400/80 bg-neutral-500/10 border border-neutral-500/15 rounded-full">
          Built on Solana
        </span>
      </div>


      {/* How It Works */}
      <div className="w-full max-w-6xl mt-24">
        <h2 className="text-2xl font-heading text-neutral-100 text-center mb-3">
          HOW IT WORKS
        </h2>
        <p className="text-sm text-neutral-500 text-center mb-14 max-w-lg mx-auto">
          Three steps from program source code to tamperproof governance.
        </p>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Step 1 */}
          <div className="bg-neutral-800/50 border border-neutral-700/40 rounded-xl p-6 relative">
            <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-xs font-bold flex items-center justify-center font-heading">
              1
            </div>
            <svg className="w-8 h-8 text-emerald-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <h3 className="text-base font-semibold text-neutral-100 mb-2">Define Permitted Actions</h3>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Auto-generate governance intents from your program's IDL. Every admin action
              gets a human-readable template, verified against the source.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-neutral-800/50 border border-neutral-700/40 rounded-xl p-6 relative">
            <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-xs font-bold flex items-center justify-center font-heading">
              2
            </div>
            <svg className="w-8 h-8 text-emerald-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h3 className="text-base font-semibold text-neutral-100 mb-2">Sign What You Read</h3>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Signers approve via <code className="text-emerald-400/80 text-xs">signMessage</code> on their Ledger.
              The hardware wallet displays the action in plain English — not hex.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-neutral-800/50 border border-neutral-700/40 rounded-xl p-6 relative">
            <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-xs font-bold flex items-center justify-center font-heading">
              3
            </div>
            <svg className="w-8 h-8 text-emerald-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3 className="text-base font-semibold text-neutral-100 mb-2">Verify & Execute On-Chain</h3>
            <p className="text-sm text-neutral-400 leading-relaxed">
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
            <div className="bg-neutral-900/80 p-5 font-mono text-xs leading-relaxed break-all">
              <p className="text-red-400 mb-1">⚠ Blind signing ahead</p>
              <p className="text-neutral-600">Unrecognized format</p>
              <p className="text-neutral-600 mt-3">Message Hash</p>
              <p className="text-red-400/70">a3f9d8c7b6a5e4d3c2b1a0f9e8d7c6b5a4938271605f4e3d2c1b0a9f8e7d60c2d</p>
              <p className="text-neutral-600 mt-2">Fee payer</p>
              <p className="text-red-400/70">7Hk2mPqRsTuVwXyZ3aBcDeFgHjKnNpQrStUvWxYz9bXr</p>
              <p className="text-neutral-700 mt-3 text-[10px]">Accept risk and sign?</p>
            </div>
          </div>

          {/* After */}
          <div className="rounded-xl overflow-hidden border border-emerald-500/15">
            <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                What Lucid signers read
              </p>
            </div>
            <div className="bg-neutral-900/80 p-5 font-mono text-xs leading-relaxed break-all">
              <p className="text-emerald-300/80">
                approve <span className="text-emerald-400">add market 5 with oracle 9abcD3F2vN5pQ8rR4mT9wF2jB6cL3nE1xY5dG7sH4def</span> |
              </p>
              <p className="text-neutral-500 mt-2">
                wallet: <span className="text-neutral-400">drift-governance</span> <span className="text-neutral-400">(5jHkM2pQrStUvWxYz3aBcDeFgHiJk8pQrSt7vWx2uV2y)</span>;
              </p>
              <p className="text-neutral-500">
                proposal: <span className="text-neutral-400">#42</span>;
              </p>
              <p className="text-neutral-500">
                expires: <span className="text-neutral-400">10 Apr 2026 12:00:00 UTC</span>;
              </p>
              <p className="text-emerald-400/80 mt-2 text-[10px] flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Approve on trusted device
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
