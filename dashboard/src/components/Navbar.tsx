import { Link } from 'react-router-dom';
import WalletButton from './WalletButton';

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50">
      {/* Gradient line accent at top */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
      <div className="bg-neutral-900/70 backdrop-blur-xl border-b border-neutral-800/50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-5">
          {/* Logo */}
          <Link to="/" className="shrink-0 flex items-center gap-3" aria-label="Lucid home">
            <img src="/logo.png" alt="Lucid" className="h-7 w-auto" />
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-semibold text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/15 rounded-full uppercase tracking-[0.15em] font-heading">
              Coming Soon
            </span>
          </Link>

          {/* Wallet (right) */}
          <div className="ml-auto">
            <WalletButton />
          </div>
        </div>
      </div>
    </nav>
  );
}
