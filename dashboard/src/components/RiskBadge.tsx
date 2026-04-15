import type { RiskLevel } from '../lib/constants';

const styles: Record<RiskLevel, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/15',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/15',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/15',
  low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',
};

const dotStyles: Record<RiskLevel, string> = {
  critical: 'bg-red-400',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-emerald-400',
};

interface Props {
  level: RiskLevel;
  className?: string;
}

export default function RiskBadge({ level, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold rounded-full border uppercase tracking-wider ${styles[level]} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[level]}`} aria-hidden="true" />
      {level}
    </span>
  );
}

/** Determine risk level from intent index and type */
export function inferRiskLevel(intentIndex: number, intentType: number): RiskLevel {
  // Meta-intents (0-2) are critical (they modify the constitution itself)
  if (intentIndex <= 2) return 'critical';
  // Custom intents could be anything
  if (intentType === 3) return 'high';
  // Default to medium
  return 'medium';
}
