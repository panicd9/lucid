import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import WalletButton from './WalletButton';

interface Props {
  network: string;
  onNetworkChange: (network: string) => void;
}

export default function Navbar({ network, onNetworkChange }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const value = searchInput.trim();
    if (value) {
      navigate(`/wallet/${value}`);
    }
  };

  return (
    <nav className="sticky top-0 z-50">
      {/* Gradient line accent at top */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
      <div className="bg-slate-900/70 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-5">
          {/* Logo */}
          <Link to="/" className="shrink-0 relative" style={{ fontFamily: "'Orbitron', monospace", fontSize: '17px', fontWeight: 600, letterSpacing: '6px', background: 'linear-gradient(90deg, #e2e8f0, #f8fafc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textTransform: 'uppercase' as const }}>
            LUCID
            <span className="absolute bottom-[-4px] left-0 right-0 h-[1.5px] rounded-full" style={{ background: 'linear-gradient(90deg, #F59E0B, #8B5CF6)' }} />
          </Link>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search wallet address or name..."
                aria-label="Search by wallet address or name"
                className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 focus:bg-slate-800/80 transition-all"
              />
            </div>
          </form>

          {/* Network selector */}
          <div className="ml-auto flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${
              network === 'mainnet' ? 'bg-emerald-400' : network === 'devnet' ? 'bg-amber-400' : 'bg-slate-400'
            }`} />
            <select
              value={network}
              onChange={(e) => onNetworkChange(e.target.value)}
              aria-label="Select network"
              className="bg-transparent border-none text-sm text-slate-400 focus:outline-none cursor-pointer pr-6 appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0 center' }}
            >
              <option value="localhost">Localhost</option>
              <option value="devnet">Devnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </div>

          {/* Wallet */}
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
