import { useState, useRef, useEffect } from 'react';
import { useSelectedWalletAccount } from '@solana/react';
import { useConnect } from '@wallet-standard/react';
import type { UiWallet, UiWalletAccount } from '@wallet-standard/ui';

function ConnectWalletRow({ wallet, onSelect }: { wallet: UiWallet; onSelect: (account: UiWalletAccount) => void }) {
  const [isConnecting, connect] = useConnect(wallet);

  return (
    <button
      disabled={isConnecting}
      onClick={async () => {
        const accounts = await connect();
        if (accounts.length > 0) {
          onSelect(accounts[0]);
        }
      }}
      className="w-full px-4 py-3 text-left hover:bg-neutral-700/30 transition-colors flex items-center gap-3 cursor-pointer disabled:opacity-50"
    >
      {wallet.icon ? (
        <img
          src={wallet.icon}
          alt={wallet.name}
          className="w-6 h-6 rounded-lg"
        />
      ) : (
        <div className="w-6 h-6 rounded-lg bg-neutral-700/50 flex items-center justify-center">
          <span className="text-xs text-neutral-400">{wallet.name[0]}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-neutral-200 font-medium">
          {isConnecting ? `Connecting to ${wallet.name}...` : wallet.name}
        </p>
      </div>
    </button>
  );
}

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
          className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3.5 py-2 text-sm text-emerald-200 hover:bg-emerald-500/15 hover:border-emerald-500/30 transition-all cursor-pointer"
          aria-label="Wallet menu"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(5,150,105,0.5)]" />
          <span className="font-mono text-xs">{short}</span>
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-52 bg-neutral-800/95 backdrop-blur-xl border border-neutral-700/50 rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-700/50">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Connected</p>
              <p className="text-xs text-neutral-300 truncate font-mono">{addr}</p>
            </div>
            <button
              onClick={() => {
                setAccount(undefined);
                setOpen(false);
              }}
              className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  // Deduplicate wallets by name (Backpack registers multiple times)
  const seen = new Set<string>();
  const uniqueWallets = wallets.filter((w) => {
    if (seen.has(w.name)) return false;
    seen.add(w.name);
    return true;
  });

  // Split into wallets with pre-authorized accounts vs those needing connect
  const withAccounts = wallets.flatMap((w) =>
    w.accounts.map((a) => ({ wallet: w, account: a }))
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-sm font-semibold rounded-lg px-4 py-2 transition-all cursor-pointer shadow-glow-green hover:shadow-glow-green-lg"
      >
        Connect
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-neutral-800/95 backdrop-blur-xl border border-neutral-700/50 rounded-xl shadow-2xl z-50 overflow-hidden">
          {uniqueWallets.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <div className="w-10 h-10 rounded-xl bg-neutral-700/30 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
                </svg>
              </div>
              <p className="text-sm text-neutral-400">No wallets detected</p>
              <p className="text-xs text-neutral-500 mt-1">
                Install Phantom, Solflare, or Backpack
              </p>
            </div>
          ) : (
            <div className="py-1">
              <div className="px-4 py-2">
                <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Select Wallet</p>
              </div>
              {/* Show pre-authorized accounts first */}
              {withAccounts.map(({ wallet, account: acc }) => (
                <button
                  key={`${wallet.name}-${acc.address}`}
                  onClick={() => {
                    setAccount(acc);
                    setOpen(false);
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-neutral-700/30 transition-colors flex items-center gap-3 cursor-pointer"
                >
                  {wallet.icon ? (
                    <img src={wallet.icon} alt={wallet.name} className="w-6 h-6 rounded-lg" />
                  ) : (
                    <div className="w-6 h-6 rounded-lg bg-neutral-700/50 flex items-center justify-center">
                      <span className="text-xs text-neutral-400">{wallet.name[0]}</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-neutral-200 font-medium">{wallet.name}</p>
                    <p className="text-xs text-neutral-500 font-mono truncate">
                      {acc.address.slice(0, 8)}...{acc.address.slice(-4)}
                    </p>
                  </div>
                </button>
              ))}
              {/* Show wallets that need connecting */}
              {uniqueWallets
                .filter((w) => w.accounts.length === 0)
                .map((wallet) => (
                  <ConnectWalletRow
                    key={wallet.name}
                    wallet={wallet}
                    onSelect={(acc) => {
                      setAccount(acc);
                      setOpen(false);
                    }}
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
