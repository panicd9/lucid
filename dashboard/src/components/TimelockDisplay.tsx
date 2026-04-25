interface Props {
  seconds: number;
  className?: string;
}

export function formatTimelock(seconds: number): string {
  if (seconds === 0) return 'None';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    return m === 1 ? '1 minute' : `${m} minutes`;
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return h === 1 ? '1 hour' : `${h} hours`;
  }
  const d = Math.floor(seconds / 86400);
  return d === 1 ? '1 day' : `${d} days`;
}

export default function TimelockDisplay({ seconds, className = '' }: Props) {
  const formatted = formatTimelock(seconds);
  const isNone = seconds === 0;

  return (
    <span
      className={`inline-flex items-center gap-1 text-sm ${
        isNone ? 'text-neutral-500' : 'text-neutral-300'
      } ${className}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      {formatted}
    </span>
  );
}
