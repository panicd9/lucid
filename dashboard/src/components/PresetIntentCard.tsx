import { useCallback, useState } from 'react';
import { useSelectedWalletAccount, useWalletAccountTransactionSigner } from '@solana/react';
import { PublicKey } from '@solana/web3.js';
import {
  pipe,
  address,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  createSolanaRpc,
} from '@solana/kit';

import { buildAddIntentInstruction } from '../lib/instructions';
import { serializeIntentDefinition } from '../lib/intentBytes';
import { findIntentPDA } from '../lib/pda';
import { RPC_ENDPOINTS, type RiskLevel } from '../lib/constants';
import { CHAIN_MAP } from '../App';
import { parseTransactionError } from '../lib/errors';
import RiskBadge from './RiskBadge';
import type { PresetIntent } from '../templates';

type Status = 'idle' | 'sending' | 'success' | 'error';

interface Props {
  preset: PresetIntent;
  walletPda: PublicKey;
  nextIntentIndex: number;
  proposers: PublicKey[];
  approvers: PublicKey[];
  approvalThreshold: number;
  cancellationThreshold: number;
  network: string;
  isApprover: boolean;
  onSuccess: () => void;
}

export default function PresetIntentCard({
  preset,
  walletPda,
  nextIntentIndex,
  proposers,
  approvers,
  approvalThreshold,
  cancellationThreshold,
  network,
  isApprover,
  onSuccess,
}: Props) {
  const [account] = useSelectedWalletAccount();
  const chain = CHAIN_MAP[network] ?? 'solana:localnet';
  const signer = useWalletAccountTransactionSigner(account!, chain);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleAdd = useCallback(async () => {
    if (!account) return;
    setStatus('sending');
    setErrorMsg('');

    try {
      const proposerBytes = proposers.map((p) => p.toBytes());
      const approverBytes = approvers.map((a) => a.toBytes());

      const intentBytes = serializeIntentDefinition(
        preset,
        approvalThreshold,
        cancellationThreshold,
        proposerBytes,
        approverBytes,
      );

      const [intentPda] = findIntentPDA(walletPda, nextIntentIndex);
      const [addMetaPda] = findIntentPDA(walletPda, 0);

      const ix = buildAddIntentInstruction(
        address(walletPda.toBase58()),
        address(intentPda.toBase58()),
        address(account.address),
        address(addMetaPda.toBase58()),
        intentBytes,
      );

      const rpc = createSolanaRpc(RPC_ENDPOINTS[network]);
      const { value: blockhash } = await rpc.getLatestBlockhash().send();
      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        (m) => appendTransactionMessageInstruction(ix as never, m),
      );

      const signedTx = await signTransactionMessageWithSigners(message);
      const encodedTx = getBase64EncodedWireTransaction(signedTx);
      await rpc.sendTransaction(encodedTx, { encoding: 'base64' }).send();

      setStatus('success');
      setTimeout(onSuccess, 250);
    } catch (err) {
      const parsed = parseTransactionError(err);
      setErrorMsg(parsed.message);
      setStatus('error');
    }
  }, [
    account,
    preset,
    walletPda,
    nextIntentIndex,
    proposers,
    approvers,
    approvalThreshold,
    cancellationThreshold,
    network,
    signer,
    onSuccess,
  ]);

  const riskLevel = (preset.riskLevel?.toLowerCase?.() ?? 'medium') as RiskLevel;
  const disabled = !isApprover || !account || status === 'sending';

  return (
    <div
      className={`rounded-xl bg-neutral-900/20 border border-dashed border-neutral-700/40 hover:border-neutral-600/60 transition-all duration-200 ${
        status === 'success' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-live="polite"
    >
      <div className="px-5 py-4 flex items-center gap-4">
        {/* Plus icon */}
        <span className="shrink-0 w-9 h-9 rounded-lg bg-neutral-800/40 border border-dashed border-neutral-700/40 flex items-center justify-center">
          <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </span>

        {/* Template + name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-300 truncate">
            {preset.template}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-neutral-500">{preset.displayName}</span>
            <span className="text-[10px] text-neutral-500/80 bg-neutral-800/40 px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">
              Available
            </span>
          </div>
        </div>

        {/* Risk badge */}
        <div className="shrink-0">
          <RiskBadge level={riskLevel} />
        </div>

        {/* CTA */}
        <button
          onClick={handleAdd}
          disabled={disabled}
          aria-label={`Add ${preset.displayName} to wallet`}
          className={`shrink-0 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            disabled
              ? 'bg-neutral-800/40 text-neutral-600 border border-neutral-800/60 cursor-not-allowed'
              : 'bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-glow-green'
          }`}
        >
          {status === 'sending' ? (
            <span className="inline-flex items-center gap-1.5">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Adding…
            </span>
          ) : (
            'Add to Wallet'
          )}
        </button>
      </div>

      {!isApprover && account && (
        <p className="px-5 pb-3 text-[11px] text-neutral-500">
          Only wallet approvers can add intents.
        </p>
      )}
      {!account && (
        <p className="px-5 pb-3 text-[11px] text-neutral-500">
          Connect a wallet to add this intent.
        </p>
      )}
      {status === 'error' && (
        <p className="px-5 pb-3 text-[11px] text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}
