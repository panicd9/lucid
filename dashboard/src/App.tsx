import { useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { SolanaProvider } from '@solana/react-hooks';
import { createClient, autoDiscover, backpack, phantom, solflare } from '@solana/client';
import { SelectedWalletAccountContextProvider } from '@solana/react';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Demo from './pages/Demo';
import { RPC_ENDPOINTS } from './lib/constants';

export const CHAIN_MAP: Record<string, `solana:${string}`> = {
  localhost: 'solana:devnet',
  devnet: 'solana:devnet',
  mainnet: 'solana:mainnet',
};

export default function App() {
  const client = useMemo(
    () =>
      createClient({
        cluster: 'mainnet',
        endpoint: RPC_ENDPOINTS.mainnet,
        walletConnectors: [...autoDiscover(), ...backpack(), ...phantom(), ...solflare()],
      }),
    []
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
          <Navbar />
          <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/demo" element={<Demo />} />
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
                href="https://x.com/LucidMultisig"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow Lucid on X"
                className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-emerald-300 transition-colors duration-200"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @LucidMultisig
              </a>
            </div>
          </footer>
        </div>
      </SelectedWalletAccountContextProvider>
    </SolanaProvider>
  );
}
