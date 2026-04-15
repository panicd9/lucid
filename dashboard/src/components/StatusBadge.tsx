import {
  STATUS_ACTIVE,
  STATUS_APPROVED,
  STATUS_EXECUTED,
  STATUS_CANCELLED,
  STATUS_LABELS,
} from '../lib/constants';

const proposalStyles: Record<number, string> = {
  [STATUS_ACTIVE]: 'bg-blue-500/10 text-blue-400 border-blue-500/15',
  [STATUS_APPROVED]: 'bg-amber-500/10 text-amber-400 border-amber-500/15',
  [STATUS_EXECUTED]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',
  [STATUS_CANCELLED]: 'bg-red-500/10 text-red-400 border-red-500/15',
};

const dotStyles: Record<number, string> = {
  [STATUS_ACTIVE]: 'bg-blue-400',
  [STATUS_APPROVED]: 'bg-amber-400',
  [STATUS_EXECUTED]: 'bg-emerald-400',
  [STATUS_CANCELLED]: 'bg-red-400',
};

interface ProposalStatusProps {
  status: number;
  className?: string;
}

export function ProposalStatusBadge({ status, className = '' }: ProposalStatusProps) {
  const style = proposalStyles[status] || proposalStyles[STATUS_ACTIVE];
  const dot = dotStyles[status] || dotStyles[STATUS_ACTIVE];
  const label = STATUS_LABELS[status] || 'Unknown';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold rounded-full border uppercase tracking-wider ${style} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

interface FrozenStatusProps {
  frozen: boolean;
  className?: string;
}

export function FrozenStatusBadge({ frozen, className = '' }: FrozenStatusProps) {
  const style = frozen
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15'
    : 'bg-amber-500/10 text-amber-400 border-amber-500/15';
  const dot = frozen ? 'bg-emerald-400' : 'bg-amber-400';
  const label = frozen ? 'Frozen' : 'Open';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold rounded-full border uppercase tracking-wider ${style} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
