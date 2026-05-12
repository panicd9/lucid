import { useState, useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { SolanaProvider } from '@solana/react-hooks';
import { createClient, autoDiscover, backpack, phantom, solflare } from '@solana/client';
import { SelectedWalletAccountContextProvider } from '@solana/react';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Ruleset from './pages/Ruleset';
import Proposals from './pages/Proposals';
import History from './pages/History';
import Demo from './pages/Demo';
import CreateWallet from './pages/CreateWallet';
import { RPC_ENDPOINTS } from './lib/constants';

export const CHAIN_MAP: Record<string, `solana:${string}`> = {
  // Wallet connects on devnet chain (for account discovery), but we send
  // transactions to localhost RPC ourselves to avoid blockhash mismatch.
  localhost: 'solana:devnet',
  devnet: 'solana:devnet',
  mainnet: 'solana:mainnet',
};

export default function App() {
  const [network, setNetwork] = useState('localhost');

  const cluster = network === 'mainnet' ? 'mainnet' : 'devnet';

  const client = useMemo(
    () =>
      createClient({
        cluster,
        endpoint: RPC_ENDPOINTS[network],
        walletConnectors: [...autoDiscover(), ...backpack(), ...phantom(), ...solflare()],
      }),
    [network, cluster]
  );

  return (
    <SolanaProvider client={client}>
      <SelectedWalletAccountContextProvider
        filterWallets={() => true}
        stateSync={{
          getSelectedWallet: () => localStorage.getItem('lucid-wallet'),
          storeSelectedWallet: (k: string) => localStorage.setItem('lucid-wallet', k),
          deleteSelectedWallet: () => localStorage.removeItem('lucid-wallet'),
        }}
      >
        <div className="min-h-screen bg-neutral-950 flex flex-col">
          <Navbar network={network} onNetworkChange={setNetwork} />
          <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route
                path="/wallet/:address"
                element={<Ruleset network={network} />}
              />
              <Route
                path="/wallet/:address/proposals"
                element={<Proposals network={network} />}
              />
              <Route
                path="/wallet/:address/history"
                element={<History network={network} />}
              />
              <Route path="/demo" element={<Demo />} />
              <Route
                path="/create"
                element={<CreateWallet network={network} />}
              />
            </Routes>
          </main>
          <footer className="border-t border-neutral-800/50">
            <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-semibold text-neutral-300 font-heading uppercase tracking-[0.15em]">
                  Lucid
                </span>
                <span className="text-neutral-700">·</span>
                <span className="text-neutral-500">uselucid.xyz</span>
              </div>
              <a
                href="https://x.com/LucidSign"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow Lucid on X"
                className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-emerald-300 transition-colors duration-200"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @LucidSign
              </a>
            </div>
          </footer>
        </div>
      </SelectedWalletAccountContextProvider>
    </SolanaProvider>
  );
}
