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
        <div className="min-h-screen bg-slate-950">
          <Navbar network={network} onNetworkChange={setNetwork} />
          <main className="max-w-6xl mx-auto px-6 py-8">
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
        </div>
      </SelectedWalletAccountContextProvider>
    </SolanaProvider>
  );
}
