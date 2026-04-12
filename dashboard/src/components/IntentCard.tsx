import { useState } from 'react';
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

interface Props {
  intent: IntentAccount;
}

export default function IntentCard({ intent }: Props) {
  const [expanded, setExpanded] = useState(false);
  const riskLevel = inferRiskLevel(intent.intentIndex, intent.intentType);
  const isMeta = intent.intentIndex <= 2;

  return (
    <div
      className={`border rounded-lg transition-colors ${
        expanded
          ? 'border-slate-600 bg-slate-800/80'
          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
      }`}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        {/* Index badge */}
        <span className="shrink-0 w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center text-sm font-mono text-slate-400">
          {intent.intentIndex}
        </span>

        {/* Template & type */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 truncate">
            {intent.template || `Intent #${intent.intentIndex}`}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-500">
              {INTENT_TYPE_LABELS[intent.intentType] || 'Unknown'}
            </span>
            {isMeta && (
              <span className="text-xs text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">
                Meta
              </span>
            )}
          </div>
        </div>

        {/* Risk + Timelock */}
        <div className="flex items-center gap-2 shrink-0">
          <RiskBadge level={riskLevel} />
          <TimelockDisplay seconds={intent.timelockSeconds} />
        </div>

        {/* Verification status */}
        <span className="shrink-0 text-sm">
          {intent.approved ? (
            <span className="text-emerald-400" title="Verified">
              &#x2713; Verified
            </span>
          ) : (
            <span className="text-amber-400" title="Unverified">
              &#x26A0; Unverified
            </span>
          )}
        </span>

        {/* Expand arrow */}
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform shrink-0 ${
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
        <div className="px-4 pb-4 border-t border-slate-700/50 pt-3 space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-slate-500 text-xs">Threshold</span>
              <p className="text-slate-200">{intent.approvalThreshold}-of-{intent.approverCount}</p>
            </div>
            <div>
              <span className="text-slate-500 text-xs">Cancel Threshold</span>
              <p className="text-slate-200">{intent.cancellationThreshold}-of-{intent.approverCount}</p>
            </div>
            <div>
              <span className="text-slate-500 text-xs">Proposers</span>
              <p className="text-slate-200">{intent.proposerCount}</p>
            </div>
            <div>
              <span className="text-slate-500 text-xs">Active Proposals</span>
              <p className="text-slate-200">{intent.activeProposalCount}</p>
            </div>
          </div>

          {/* Proposers */}
          {intent.proposers.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Proposers
              </h4>
              <div className="space-y-1">
                {intent.proposers.map((p, i) => (
                  <AddressDisplay key={i} address={p.toBase58()} chars={8} />
                ))}
              </div>
            </div>
          )}

          {/* Approvers */}
          {intent.approvers.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Approvers
              </h4>
              <div className="space-y-1">
                {intent.approvers.map((a, i) => (
                  <div key={i}>
                    <AddressDisplay address={a.toBase58()} chars={8} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parameters */}
          {intent.params.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Parameters
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-700/50">
                      <th className="pb-1.5 pr-4">Name</th>
                      <th className="pb-1.5 pr-4">Type</th>
                      <th className="pb-1.5 pr-4">Constraint</th>
                      <th className="pb-1.5">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intent.params.map((p, i) => (
                      <tr key={i} className="border-b border-slate-700/30">
                        <td className="py-1.5 pr-4 text-slate-300 font-mono text-xs">
                          {p.name || `param_${i}`}
                        </td>
                        <td className="py-1.5 pr-4 text-slate-400">
                          {PARAM_TYPE_LABELS[p.paramType] || `type(${p.paramType})`}
                        </td>
                        <td className="py-1.5 pr-4 text-slate-400">
                          {CONSTRAINT_LABELS[p.constraintType] || 'None'}
                        </td>
                        <td className="py-1.5 text-slate-400 font-mono text-xs">
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
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Accounts
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-700/50">
                      <th className="pb-1.5 pr-4">#</th>
                      <th className="pb-1.5 pr-4">Source</th>
                      <th className="pb-1.5 pr-4">Writable</th>
                      <th className="pb-1.5">Signer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intent.accounts.map((a, i) => (
                      <tr key={i} className="border-b border-slate-700/30">
                        <td className="py-1.5 pr-4 text-slate-400 font-mono text-xs">{i}</td>
                        <td className="py-1.5 pr-4 text-slate-300">
                          {SOURCE_LABELS[a.source] || `source(${a.source})`}
                        </td>
                        <td className="py-1.5 pr-4">
                          {a.writable ? (
                            <span className="text-amber-400 text-xs">Yes</span>
                          ) : (
                            <span className="text-slate-500 text-xs">No</span>
                          )}
                        </td>
                        <td className="py-1.5">
                          {a.isSigner ? (
                            <span className="text-amber-400 text-xs">Yes</span>
                          ) : (
                            <span className="text-slate-500 text-xs">No</span>
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
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Data Segments ({intent.dataSegments.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {intent.dataSegments.map((ds, i) => (
                  <span
                    key={i}
                    className="text-xs font-mono bg-slate-700/50 px-2 py-1 rounded text-slate-400"
                  >
                    {ds.segmentType === 0 ? 'Literal' : 'Param'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
