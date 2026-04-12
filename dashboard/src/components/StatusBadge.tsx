import {
  STATUS_ACTIVE,
  STATUS_APPROVED,
  STATUS_EXECUTED,
  STATUS_CANCELLED,
  STATUS_LABELS,
} from '../lib/constants';

const proposalStyles: Record<number, string> = {
  [STATUS_ACTIVE]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  [STATUS_APPROVED]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  [STATUS_EXECUTED]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  [STATUS_CANCELLED]: 'bg-red-500/20 text-red-400 border-red-500/30',
};

interface ProposalStatusProps {
  status: number;
  className?: string;
}

export function ProposalStatusBadge({ status, className = '' }: ProposalStatusProps) {
  const style = proposalStyles[status] || proposalStyles[STATUS_ACTIVE];
  const label = STATUS_LABELS[status] || 'Unknown';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${style} ${className}`}
    >
      {label.toUpperCase()}
    </span>
  );
}

interface FrozenStatusProps {
  frozen: boolean;
  className?: string;
}

export function FrozenStatusBadge({ frozen, className = '' }: FrozenStatusProps) {
  const style = frozen
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  const label = frozen ? 'FROZEN' : 'OPEN';

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded border ${style} ${className}`}
    >
      {label}
    </span>
  );
}
