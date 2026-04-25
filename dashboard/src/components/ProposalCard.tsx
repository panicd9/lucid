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
      timelockRemaining = 'Locked — ' + formatTimelock(remaining) + ' until executable';
    } else {
      timelockRemaining = 'Timelock cleared';
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

  const isActive = proposal.status === STATUS_ACTIVE || proposal.status === STATUS_APPROVED;

  return (
    <>
      <div className={`rounded-xl transition-all ${
        isActive
          ? 'bg-neutral-900/50 border-gradient hover:shadow-glow-green'
          : 'bg-neutral-900/30 border border-neutral-800/50 hover:border-neutral-700/50'
      }`}>
        <div className="p-5">
          {/* Top row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono text-neutral-500 font-heading">
                #{proposal.proposalIndex.toString()}
              </span>
              <ProposalStatusBadge status={proposal.status} />
            </div>
            {timelockRemaining && (
              <span className={`text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-full ${
                canExecute
                  ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/15'
                  : 'text-amber-400 bg-amber-500/10 border border-amber-500/15'
              }`}>
                {canExecute ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                {timelockRemaining}
              </span>
            )}
          </div>

          {/* Rendered template */}
          {renderedTemplate && (
            <div className="mb-4 bg-neutral-800/30 border border-neutral-800/50 rounded-lg px-3 py-2.5">
              <p className="text-sm text-neutral-200 font-mono break-all">{renderedTemplate}</p>
            </div>
          )}

          {/* Approval progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-neutral-400">
                Approvals: <span className="text-emerald-300 font-semibold">{approvalCount}</span>/{threshold}
                {totalApprovers > 0 && (
                  <span className="text-neutral-600 ml-1">({totalApprovers} total)</span>
                )}
              </span>
              {cancellationCount > 0 && (
                <span className="text-red-400/80">
                  {cancellationCount}/{cancelThreshold} cancel
                </span>
              )}
            </div>
            <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all bg-gradient-to-r from-emerald-500 to-emerald-400"
                style={{ width: `${Math.min(approvalPct, 100)}%` }}
              />
            </div>
          </div>

          {/* Details row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
            <div className="flex items-center gap-1.5">
              <svg className="w-3 h-3 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <AddressDisplay address={proposal.proposer.toBase58()} chars={4} />
            </div>
            {proposedDate && <span>{proposedDate}</span>}
            {approvedDate && <span className="text-emerald-500/50">Approved {approvedDate}</span>}
          </div>
        </div>

        {/* Action buttons */}
        {(canApprove || canCancel || canExecute) && (
          <div className="flex gap-2 px-5 py-3 border-t border-neutral-800/40">
            {canApprove && (
              <button
                onClick={() => setSigningAction('approve')}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all cursor-pointer"
              >
                Approve
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setSigningAction('cancel')}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-500/15 text-red-300 border border-red-500/20 hover:bg-red-500/25 transition-all cursor-pointer"
              >
                Cancel
              </button>
            )}
            {canExecute && (
              <button
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400 transition-all cursor-pointer shadow-glow-green"
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
            // Secondary refetch to catch on-chain state propagation
            setTimeout(onRefresh, 3000);
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
            setTimeout(onRefresh, 3000);
          }}
        />
      )}
    </>
  );
}
