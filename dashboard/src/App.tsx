import { useState, useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { SolanaProvider } from '@solana/react-hooks';
import { createClient, autoDiscover } from '@solana/client';
import { SelectedWalletAccountContextProvider } from '@solana/react';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Constitution from './pages/Constitution';
import Proposals from './pages/Proposals';
import { RPC_ENDPOINTS } from './lib/constants';

export const CHAIN_MAP: Record<string, `solana:${string}`> = {
  localhost: 'solana:localnet',
  devnet: 'solana:devnet',
  mainnet: 'solana:mainnet',
};

export default function App() {
  const [network, setNetwork] = useState('localhost');

  const client = useMemo(
    () =>
      createClient({
        endpoint: RPC_ENDPOINTS[network],
        walletConnectors: autoDiscover(),
      }),
    [network]
  );

  return (
    <SolanaProvider client={client}>
      <SelectedWalletAccountContextProvider
        filterWallets={(w) => w.accounts.length > 0}
        stateSync={{
          getSelectedWallet: () => localStorage.getItem('lucid-wallet'),
          storeSelectedWallet: (k) => localStorage.setItem('lucid-wallet', k),
          deleteSelectedWallet: () => localStorage.removeItem('lucid-wallet'),
        }}
      >
        <div className="min-h-screen bg-slate-950">
          <Navbar network={network} onNetworkChange={setNetwork} />
          <main className="max-w-5xl mx-auto px-4 py-8">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route
                path="/wallet/:address"
                element={<Constitution network={network} />}
              />
              <Route
                path="/wallet/:address/proposals"
                element={<Proposals network={network} />}
              />
            </Routes>
          </main>
        </div>
      </SelectedWalletAccountContextProvider>
    </SolanaProvider>
  );
}
