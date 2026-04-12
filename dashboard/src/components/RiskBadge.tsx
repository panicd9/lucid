import type { RiskLevel } from '../lib/constants';

const styles: Record<RiskLevel, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const icons: Record<RiskLevel, string> = {
  critical: '\u{1F534}',
  high: '\u{1F7E0}',
  medium: '\u{1F7E1}',
  low: '\u{1F7E2}',
};

interface Props {
  level: RiskLevel;
  className?: string;
}

export default function RiskBadge({ level, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded border ${styles[level]} ${className}`}
    >
      <span>{icons[level]}</span>
      {level.toUpperCase()}
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
