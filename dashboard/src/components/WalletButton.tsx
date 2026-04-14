import { useState, useRef, useEffect } from 'react';
import { useSelectedWalletAccount } from '@solana/react';

export default function WalletButton() {
  const [account, setAccount, wallets] = useSelectedWalletAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (account) {
    const addr = account.address;
    const short = `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/30 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="font-mono">{short}</span>
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-700">
              <p className="text-xs text-slate-400 truncate font-mono">{addr}</p>
            </div>
            <button
              onClick={() => {
                setAccount(undefined);
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700/50 transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  const allAccounts = wallets.flatMap((w) =>
    w.accounts.map((a) => ({ wallet: w, account: a }))
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg px-3 py-1.5 transition-colors"
      >
        Connect Wallet
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {allAccounts.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm text-slate-400">No wallets detected</p>
              <p className="text-xs text-slate-500 mt-1">
                Install Phantom, Solflare, or another Solana wallet
              </p>
            </div>
          ) : (
            allAccounts.map(({ wallet, account: acc }) => (
              <button
                key={`${wallet.name}-${acc.address}`}
                onClick={() => {
                  setAccount(acc);
                  setOpen(false);
                }}
                className="w-full px-3 py-2.5 text-left hover:bg-slate-700/50 transition-colors flex items-center gap-3 border-b border-slate-700/50 last:border-0"
              >
                {wallet.icon && (
                  <img
                    src={wallet.icon}
                    alt={wallet.name}
                    className="w-5 h-5 rounded"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200">{wallet.name}</p>
                  <p className="text-xs text-slate-500 font-mono truncate">
                    {acc.address.slice(0, 8)}...{acc.address.slice(-4)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
