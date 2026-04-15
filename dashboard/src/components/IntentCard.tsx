import { useState } from 'react';
import { useSelectedWalletAccount } from '@solana/react';
import { IntentAccount } from '../lib/deserialize';
import {
  INTENT_TYPE_LABELS,
  PARAM_TYPE_LABELS,
  CONSTRAINT_LABELS,
  SOURCE_LABELS,
} from '../lib/constants';
import RiskBadge, { inferRiskLevel } from './RiskBadge';
import TimelockDisplay from './TimelockDisplay';
import AddressDisplay from './AddressDisplay';
import ProposeModal from './ProposeModal';

interface Props {
  intent: IntentAccount;
  walletAddress: string;
  walletName: string;
  network: string;
  onRefresh: () => void;
}

export default function IntentCard({ intent, walletAddress, walletName, network, onRefresh }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [account] = useSelectedWalletAccount();
  const riskLevel = inferRiskLevel(intent.intentIndex, intent.intentType);
  const isMeta = intent.intentIndex <= 2;

  return (
    <div
      className={`rounded-xl transition-all ${
        expanded
          ? 'bg-slate-900/60 border-gradient shadow-glow-gold'
          : 'bg-slate-900/30 border border-slate-800/60 hover:border-slate-700/60 hover:bg-slate-900/50'
      }`}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 cursor-pointer"
        aria-expanded={expanded}
        aria-label={`${intent.template || `Intent #${intent.intentIndex}`} — ${expanded ? 'collapse' : 'expand'} details`}
      >
        {/* Index badge */}
        <span className="shrink-0 w-9 h-9 rounded-lg bg-slate-800/60 border border-slate-700/30 flex items-center justify-center text-sm font-mono text-slate-400 font-heading">
          {intent.intentIndex}
        </span>

        {/* Template & type */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">
            {intent.template || `Intent #${intent.intentIndex}`}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">
              {INTENT_TYPE_LABELS[intent.intentType] || 'Unknown'}
            </span>
            {isMeta && (
              <span className="text-[10px] text-amber-400/70 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">
                Meta
              </span>
            )}
          </div>
        </div>

        {/* Risk + Timelock */}
        <div className="flex items-center gap-3 shrink-0">
          <RiskBadge level={riskLevel} />
          <TimelockDisplay seconds={intent.timelockSeconds} />
        </div>

        {/* Verification status */}
        <span className="shrink-0 text-xs inline-flex items-center gap-1.5">
          {intent.approved ? (
            <span className="text-emerald-400 inline-flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">Verified</span>
            </span>
          ) : (
            <span className="text-amber-400 inline-flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="hidden sm:inline">Unverified</span>
            </span>
          )}
        </span>

        {/* Expand arrow */}
        <svg
          className={`w-4 h-4 text-slate-600 transition-transform shrink-0 ${
            expanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 pt-1 space-y-5">
          {/* Divider */}
          <div className="h-[1px] bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />

          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Threshold', value: `${intent.approvalThreshold}-of-${intent.approverCount}` },
              { label: 'Cancel Threshold', value: `${intent.cancellationThreshold}-of-${intent.approverCount}` },
              { label: 'Proposers', value: String(intent.proposerCount) },
              { label: 'Active Proposals', value: String(intent.activeProposalCount) },
            ].map((stat) => (
              <div key={stat.label} className="bg-slate-800/30 rounded-lg px-3 py-2.5 border border-slate-800/50">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{stat.label}</p>
                <p className="text-sm font-semibold text-slate-200">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Proposers */}
          {intent.proposers.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Proposers
              </h4>
              <div className="flex flex-wrap gap-2">
                {intent.proposers.map((p, i) => (
                  <div key={i} className="bg-slate-800/30 rounded-lg px-2.5 py-1.5 border border-slate-800/50">
                    <AddressDisplay address={p.toBase58()} chars={6} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approvers */}
          {intent.approvers.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Approvers
              </h4>
              <div className="flex flex-wrap gap-2">
                {intent.approvers.map((a, i) => (
                  <div key={i} className="bg-slate-800/30 rounded-lg px-2.5 py-1.5 border border-slate-800/50">
                    <AddressDisplay address={a.toBase58()} chars={6} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parameters */}
          {intent.params.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Parameters
              </h4>
              <div className="overflow-x-auto rounded-lg border border-slate-800/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] text-slate-500 uppercase tracking-wider bg-slate-800/30">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Constraint</th>
                      <th className="px-3 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intent.params.map((p, i) => (
                      <tr key={i} className="border-t border-slate-800/40">
                        <td className="px-3 py-2 text-slate-300 font-mono text-xs">
                          {p.name || `param_${i}`}
                        </td>
                        <td className="px-3 py-2 text-slate-400 text-xs">
                          {PARAM_TYPE_LABELS[p.paramType] || `type(${p.paramType})`}
                        </td>
                        <td className="px-3 py-2 text-slate-400 text-xs">
                          {CONSTRAINT_LABELS[p.constraintType] || 'None'}
                        </td>
                        <td className="px-3 py-2 text-slate-400 font-mono text-xs">
                          {p.constraintType !== 0 ? p.constraintValue.toString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Accounts */}
          {intent.accounts.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Accounts
              </h4>
              <div className="overflow-x-auto rounded-lg border border-slate-800/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] text-slate-500 uppercase tracking-wider bg-slate-800/30">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Writable</th>
                      <th className="px-3 py-2">Signer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intent.accounts.map((a, i) => (
                      <tr key={i} className="border-t border-slate-800/40">
                        <td className="px-3 py-2 text-slate-400 font-mono text-xs">{i}</td>
                        <td className="px-3 py-2 text-slate-300 text-xs">
                          {SOURCE_LABELS[a.source] || `source(${a.source})`}
                        </td>
                        <td className="px-3 py-2">
                          {a.writable ? (
                            <span className="text-amber-400 text-xs">Yes</span>
                          ) : (
                            <span className="text-slate-600 text-xs">No</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {a.isSigner ? (
                            <span className="text-amber-400 text-xs">Yes</span>
                          ) : (
                            <span className="text-slate-600 text-xs">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Data segments */}
          {intent.dataSegments.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Data Segments ({intent.dataSegments.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {intent.dataSegments.map((ds, i) => (
                  <span
                    key={i}
                    className="text-xs font-mono bg-slate-800/30 px-2.5 py-1.5 rounded-lg text-slate-400 border border-slate-800/50"
                  >
                    {ds.segmentType === 0 ? 'Literal' : 'Param'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* New Proposal button — visible when connected wallet is a proposer */}
          {account && intent.proposers.some((p) => p.toBase58() === account.address) && (
            <div className="pt-3">
              <div className="h-[1px] bg-gradient-to-r from-transparent via-slate-700/50 to-transparent mb-4" />
              <button
                onClick={() => setShowProposeModal(true)}
                className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white transition-all cursor-pointer shadow-glow-purple hover:shadow-glow-purple-lg"
              >
                New Proposal
              </button>
            </div>
          )}
        </div>
      )}

      {/* Propose modal */}
      {showProposeModal && (
        <ProposeModal
          intent={intent}
          walletAddress={walletAddress}
          walletName={walletName}
          network={network}
          onClose={() => setShowProposeModal(false)}
          onSuccess={() => {
            setShowProposeModal(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
