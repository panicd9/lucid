import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Constitution from './pages/Constitution';
import Proposals from './pages/Proposals';

export default function App() {
  const [network, setNetwork] = useState('localhost');

  return (
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
  );
}
