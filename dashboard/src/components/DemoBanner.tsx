import { Link } from 'react-router-dom';

export default function DemoBanner() {
  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-amber-500/25 bg-gradient-to-r from-amber-500/[0.08] via-amber-500/[0.04] to-transparent px-4 py-3 sm:px-5 sm:py-3.5"
    >
      <div className="flex items-start gap-3 sm:items-center">
        <div className="shrink-0 mt-0.5 sm:mt-0 w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
          <svg
            className="w-3.5 h-3.5 text-amber-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm text-amber-100/90 leading-relaxed">
            <span className="font-semibold text-amber-200">Demo wallet</span>
            <span className="text-amber-100/60"> &middot; </span>
            <span className="text-amber-100/80">
              Read-only preview of a Lucid wallet. Actions are disabled.
            </span>
          </p>
        </div>

        <Link
          to="/create"
          className="hidden sm:inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-200 hover:bg-amber-500/15 hover:border-amber-500/35 hover:text-amber-100 transition-all"
        >
          Create your own
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
