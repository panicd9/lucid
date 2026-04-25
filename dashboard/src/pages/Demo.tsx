import { useState } from 'react';
import { Link } from 'react-router-dom';

interface Step {
  title: string;
  description: string;
  visual: React.ReactNode;
}

const steps: Step[] = [
  {
    title: 'A DAO creates a governance proposal',
    description: 'The council proposes adding a new market to their protocol. The intent is defined with human-readable parameters and stored on-chain.',
    visual: (
      <div className="w-full space-y-3">
        <div className="bg-neutral-900/60 rounded-lg px-4 py-3 border border-neutral-700/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-heading text-emerald-400 tracking-wide">Drift Governance</span>
          </div>
          <p className="text-sm text-neutral-300 font-mono">add market 5 with oracle 9abc...def</p>
        </div>
        <div className="flex items-center gap-2 px-4">
          <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-xs text-neutral-500">Legitimate proposal created by DAO council</span>
        </div>
      </div>
    ),
  },
  {
    title: 'An attacker tampers with the transaction',
    description: 'A compromised frontend or malicious dApp modifies the CPI data before signers see it. The legitimate action is replaced with a vault drain.',
    visual: (
      <div className="w-full space-y-3">
        <div className="bg-red-500/5 rounded-lg px-4 py-3 border border-red-500/15">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse-glow" />
            <span className="text-xs font-heading text-red-300 tracking-wide">Tampered Transaction</span>
          </div>
          <p className="text-sm text-neutral-500 font-mono line-through">add market 5 with oracle 9abc...def</p>
          <p className="text-sm text-red-300 font-mono mt-1">drain vault to attacker wallet 7xyz...abc</p>
        </div>
        <div className="flex items-center gap-2 px-4">
          <div className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
            <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
            </svg>
          </div>
          <span className="text-xs text-neutral-500">Attacker modifies CPI data before signers see it</span>
        </div>
      </div>
    ),
  },
  {
    title: 'Standard multisig: signers see hex',
    description: 'With a traditional multisig, the Ledger shows raw transaction bytes. Signers have no way to verify what they are approving — they sign blindly.',
    visual: (
      <div className="w-full space-y-3">
        <div className="bg-neutral-800/60 rounded-lg px-4 py-3 border border-neutral-700/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Ledger Display</span>
          </div>
          <div className="font-mono text-xs text-neutral-500 leading-relaxed break-all">
            <p>0x7b2274797065223a227472</p>
            <p>616e73616374696f6e222c</p>
            <p>22646174613a2230786632</p>
            <p className="text-neutral-600">...</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4">
          <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <span className="text-[10px] text-amber-400 font-bold">?</span>
          </div>
          <span className="text-xs text-neutral-500">Signer has no way to verify what they are approving</span>
        </div>
      </div>
    ),
  },
  {
    title: 'With Lucid: human-readable on Ledger',
    description: 'Lucid uses signMessage instead of signTransaction. The Ledger displays the action in plain text. Signers read exactly what they approve.',
    visual: (
      <div className="w-full space-y-3">
        <div className="bg-neutral-900/80 rounded-lg px-4 py-3 border-gradient">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold text-emerald-400/70 uppercase tracking-wider">Ledger Display</span>
          </div>
          <div className="font-mono text-sm text-emerald-300/90 leading-relaxed">
            <p>expires 2026-04-10 12:00:00:</p>
            <p>approve add market 5 with oracle 9abc...def</p>
            <p className="text-neutral-500">| wallet: drift-governance proposal: 42</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4">
          <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <span className="text-xs text-neutral-500">Signer reads exactly what they approve — in plain text</span>
        </div>
      </div>
    ),
  },
  {
    title: 'On-chain verification rejects tampered transactions',
    description: 'The program reconstructs the message from on-chain state and verifies the ed25519 signature. If the transaction was tampered with, the signature won\'t match — the CPI is rejected.',
    visual: (
      <div className="w-full space-y-3">
        <div className="flex gap-3">
          <div className="flex-1 bg-red-500/5 rounded-lg px-4 py-3 border border-red-500/15">
            <p className="text-[10px] font-semibold text-red-400/70 uppercase tracking-wider mb-1.5">Tampered</p>
            <p className="text-xs font-mono text-red-300/70">drain vault to 7xyz...abc</p>
            <div className="mt-2 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-[10px] text-red-400 font-semibold uppercase">Rejected</span>
            </div>
          </div>
          <div className="flex-1 bg-emerald-500/5 rounded-lg px-4 py-3 border border-emerald-500/15">
            <p className="text-[10px] font-semibold text-emerald-400/70 uppercase tracking-wider mb-1.5">Original</p>
            <p className="text-xs font-mono text-emerald-300/70">add market 5 with oracle 9abc...def</p>
            <div className="mt-2 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[10px] text-emerald-400 font-semibold uppercase">Verified</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4">
          <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="text-xs text-neutral-500">Ed25519 signature verified on-chain — the program reconstructs the message from state</span>
        </div>
      </div>
    ),
  },
];

export default function Demo() {
  const [currentStep, setCurrentStep] = useState(0);

  return (
    <div className="flex flex-col items-center pt-12 pb-16">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-2xl sm:text-3xl font-heading font-bold text-neutral-100 tracking-wide mb-3">
          See Lucid in Action
        </h1>
        <p className="text-sm text-neutral-500 max-w-md mx-auto">
          Walk through how Lucid prevents blind signing attacks on Solana governance.
        </p>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentStep(i)}
            aria-label={`Go to step ${i + 1}`}
            className={`transition-all cursor-pointer rounded-full ${
              i === currentStep
                ? 'w-8 h-2 bg-emerald-400'
                : i < currentStep
                  ? 'w-2 h-2 bg-emerald-400/40'
                  : 'w-2 h-2 bg-neutral-700'
            }`}
          />
        ))}
      </div>

      {/* Step card */}
      <div className="w-full max-w-3xl">
        <div className="bg-neutral-900/60 border border-neutral-800/60 rounded-2xl overflow-hidden shadow-2xl">
          {/* Accent line */}
          <div className="h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

          {/* Step number + title */}
          <div className="px-5 sm:px-8 pt-8 pb-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="shrink-0 w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-sm font-heading font-bold text-emerald-400">
                {currentStep + 1}
              </span>
              <h2 className="text-lg font-heading font-semibold text-neutral-100 tracking-wide">
                {steps[currentStep].title}
              </h2>
            </div>
            <p className="text-sm text-neutral-400 leading-relaxed pl-11">
              {steps[currentStep].description}
            </p>
          </div>

          {/* Visual mockup */}
          <div key={currentStep} className="mx-5 sm:mx-8 mb-8 bg-neutral-800/30 border border-neutral-800/50 rounded-xl p-6 min-h-[180px] flex items-center justify-center animate-step-in">
            {steps[currentStep].visual}
          </div>

          {/* Navigation footer */}
          <div className="flex items-center justify-between px-5 sm:px-8 py-5 border-t border-neutral-800/50">
            <Link
              to="/"
              className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors cursor-pointer"
            >
              Skip demo
            </Link>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
                className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer rounded-lg hover:bg-neutral-800/50"
              >
                Back
              </button>
              {currentStep < steps.length - 1 ? (
                <button
                  onClick={() => setCurrentStep(currentStep + 1)}
                  className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white transition-all cursor-pointer shadow-glow-green"
                >
                  Next
                </button>
              ) : (
                <Link
                  to="/"
                  className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white transition-all cursor-pointer shadow-glow-green"
                >
                  Get Started
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
