import { ProposalWithMeta } from '../hooks/useProposals';
import { countBits } from '../lib/deserialize';
import { STATUS_APPROVED } from '../lib/constants';
import { ProposalStatusBadge } from './StatusBadge';
import AddressDisplay from './AddressDisplay';
import { formatTimelock } from './TimelockDisplay';

interface Props {
  proposal: ProposalWithMeta;
}

export default function ProposalCard({ proposal }: Props) {
  const approvalCount = countBits(proposal.approvalBitmap);
  const cancellationCount = countBits(proposal.cancellationBitmap);
  const threshold = proposal.intentData?.approvalThreshold ?? 0;
  const totalApprovers = proposal.intentData?.approverCount ?? 0;
  const approvalPct = totalApprovers > 0 ? (approvalCount / totalApprovers) * 100 : 0;

  const proposedDate = proposal.proposedAt !== BigInt(0)
    ? new Date(Number(proposal.proposedAt) * 1000).toLocaleString()
    : null;
  const approvedDate = proposal.approvedAt !== BigInt(0)
    ? new Date(Number(proposal.approvedAt) * 1000).toLocaleString()
    : null;

  // Timelock countdown for approved proposals
  const timelockSeconds = proposal.intentData?.timelockSeconds ?? 0;
  let timelockRemaining = '';
  if (proposal.status === STATUS_APPROVED && proposal.approvedAt !== BigInt(0) && timelockSeconds > 0) {
    const unlockTime = Number(proposal.approvedAt) + timelockSeconds;
    const now = Math.floor(Date.now() / 1000);
    const remaining = unlockTime - now;
    if (remaining > 0) {
      timelockRemaining = formatTimelock(remaining) + ' remaining';
    } else {
      timelockRemaining = 'Ready to execute';
    }
  }

  return (
    <div className="border border-slate-700 bg-slate-800/50 rounded-lg p-4 hover:border-slate-600 transition-colors">
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-slate-400">
            #{proposal.proposalIndex.toString()}
          </span>
          <ProposalStatusBadge status={proposal.status} />
        </div>
        {timelockRemaining && (
          <span className="text-xs text-amber-400 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {timelockRemaining}
          </span>
        )}
      </div>

      {/* Intent template */}
      {proposal.intentData && (
        <p className="text-sm text-slate-200 mb-3">
          {proposal.intentData.template || `Intent #${proposal.intentData.intentIndex}`}
        </p>
      )}

      {/* Approval progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-400">
            Approvals: {approvalCount}/{threshold}
            {totalApprovers > 0 && (
              <span className="text-slate-500"> ({totalApprovers} total)</span>
            )}
          </span>
          {cancellationCount > 0 && (
            <span className="text-red-400">
              {cancellationCount} cancellation{cancellationCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${Math.min(approvalPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Details row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <span>Proposer:</span>
          <AddressDisplay address={proposal.proposer.toBase58()} chars={4} />
        </div>
        {proposedDate && <span>Proposed: {proposedDate}</span>}
        {approvedDate && <span>Approved: {approvedDate}</span>}
      </div>
    </div>
  );
}
