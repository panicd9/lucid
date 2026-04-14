import { useState } from 'react';
import { useSelectedWalletAccount } from '@solana/react';
import { ProposalWithMeta } from '../hooks/useProposals';
import { countBits } from '../lib/deserialize';
import { STATUS_ACTIVE, STATUS_APPROVED } from '../lib/constants';
import { ProposalStatusBadge } from './StatusBadge';
import AddressDisplay from './AddressDisplay';
import { formatTimelock } from './TimelockDisplay';
import { decodeParamsData, renderTemplate } from '../lib/params';
import SigningModal from './SigningModal';
import ExecuteModal from './ExecuteModal';

interface Props {
  proposal: ProposalWithMeta;
  walletName: string;
  walletAddress: string;
  network: string;
  onRefresh: () => void;
}

export default function ProposalCard({ proposal, walletName, walletAddress, network, onRefresh }: Props) {
  const [account] = useSelectedWalletAccount();
  const [signingAction, setSigningAction] = useState<'approve' | 'cancel' | null>(null);
  const [showExecute, setShowExecute] = useState(false);

  const approvalCount = countBits(proposal.approvalBitmap);
  const cancellationCount = countBits(proposal.cancellationBitmap);
  const threshold = proposal.intentData?.approvalThreshold ?? 0;
  const cancelThreshold = proposal.intentData?.cancellationThreshold ?? 0;
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
  let canExecute = false;
  if (proposal.status === STATUS_APPROVED && proposal.approvedAt !== BigInt(0) && timelockSeconds > 0) {
    const unlockTime = Number(proposal.approvedAt) + timelockSeconds;
    const now = Math.floor(Date.now() / 1000);
    const remaining = unlockTime - now;
    if (remaining > 0) {
      timelockRemaining = formatTimelock(remaining) + ' remaining';
    } else {
      timelockRemaining = 'Ready to execute';
      canExecute = true;
    }
  } else if (proposal.status === STATUS_APPROVED && timelockSeconds === 0) {
    canExecute = true;
  }

  // Decoded params and rendered template
  let renderedTemplate = '';
  if (proposal.intentData) {
    try {
      const decoded = decodeParamsData(proposal.paramsData, proposal.intentData.params, proposal.intentData.intentType);
      renderedTemplate = renderTemplate(proposal.intentData.template, decoded, proposal.intentData.params);
    } catch {
      renderedTemplate = proposal.intentData.template || `Intent #${proposal.intentData.intentIndex}`;
    }
  }

  // Check if connected wallet can act
  const connectedAddress = account?.address;
  let approverIndex = -1;
  let canApprove = false;
  let canCancel = false;

  if (connectedAddress && proposal.intentData) {
    const approvers = proposal.intentData.approvers;
    approverIndex = approvers.findIndex(
      (a) => a.toBase58() === connectedAddress
    );

    if (approverIndex >= 0) {
      const bit = 1 << approverIndex;
      const alreadyApproved = (proposal.approvalBitmap & bit) !== 0;
      const alreadyCancelled = (proposal.cancellationBitmap & bit) !== 0;

      canApprove = proposal.status === STATUS_ACTIVE && !alreadyApproved;
      canCancel =
        (proposal.status === STATUS_ACTIVE || proposal.status === STATUS_APPROVED) &&
        !alreadyCancelled;
    }
  }

  return (
    <>
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

        {/* Rendered template */}
        {renderedTemplate && (
          <p className="text-sm text-slate-200 mb-3 font-mono bg-slate-900/50 rounded px-2 py-1.5">
            {renderedTemplate}
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
                {cancellationCount}/{cancelThreshold} cancellation{cancellationCount !== 1 ? 's' : ''}
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
          <div className="flex items-center gap-1">
            <span>Proposer:</span>
            <AddressDisplay address={proposal.proposer.toBase58()} chars={4} />
          </div>
          {proposedDate && <span>Proposed: {proposedDate}</span>}
          {approvedDate && <span>Approved: {approvedDate}</span>}
        </div>

        {/* Action buttons */}
        {(canApprove || canCancel || canExecute) && (
          <div className="flex gap-2 pt-2 border-t border-slate-700/50">
            {canApprove && (
              <button
                onClick={() => setSigningAction('approve')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
              >
                Approve
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setSigningAction('cancel')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Cancel
              </button>
            )}
            {canExecute && (
              <button
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                onClick={() => setShowExecute(true)}
              >
                Execute
              </button>
            )}
          </div>
        )}
      </div>

      {/* Signing modal */}
      {signingAction && proposal.intentData && (
        <SigningModal
          action={signingAction}
          proposal={proposal as ProposalWithMeta & { intentData: NonNullable<ProposalWithMeta['intentData']> }}
          walletName={walletName}
          walletAddress={walletAddress}
          network={network}
          onClose={() => setSigningAction(null)}
          onSuccess={() => {
            setSigningAction(null);
            onRefresh();
          }}
        />
      )}

      {/* Execute modal */}
      {showExecute && proposal.intentData && (
        <ExecuteModal
          proposal={proposal as ProposalWithMeta & { intentData: NonNullable<ProposalWithMeta['intentData']> }}
          walletAddress={walletAddress}
          network={network}
          onClose={() => setShowExecute(false)}
          onSuccess={() => {
            setShowExecute(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
