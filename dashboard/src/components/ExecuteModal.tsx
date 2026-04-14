import { useState } from 'react';
import { useSelectedWalletAccount, useWalletAccountTransactionSendingSigner } from '@solana/react';
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signAndSendTransactionMessageWithSigners,
  createSolanaRpc,
} from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildExecuteInstruction } from '../lib/instructions';
import { buildExecuteContext } from '../lib/resolveAccounts';
import { decodeParamsData, renderTemplate } from '../lib/params';
import { RPC_ENDPOINTS } from '../lib/constants';
import { CHAIN_MAP } from '../App';
import type { IntentAccount, ProposalAccount } from '../lib/deserialize';

type Status = 'idle' | 'resolving' | 'sending' | 'success' | 'error';

interface Props {
  proposal: ProposalAccount & { address: PublicKey; intentData: IntentAccount };
  walletAddress: string;
  network: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ExecuteModal({
  proposal,
  walletAddress,
  network,
  onClose,
  onSuccess,
}: Props) {
  const intentData = proposal.intentData;
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [txSig, setTxSig] = useState('');

  const [account] = useSelectedWalletAccount();
  const chain = CHAIN_MAP[network] ?? 'solana:localnet';
  const signer = useWalletAccountTransactionSendingSigner(account!, chain);

  // Decode and render template for display
  let rendered = '';
  try {
    const decoded = decodeParamsData(proposal.paramsData, intentData.params);
    rendered = renderTemplate(intentData.template, decoded, intentData.params);
  } catch {
    rendered = intentData.template || `Intent #${intentData.intentIndex}`;
  }

  const handleExecute = async () => {
    if (!account) return;

    try {
      setStatus('resolving');
      setErrorMsg('');

      const walletPubkey = new PublicKey(walletAddress);
      const ctx = await buildExecuteContext(
        walletPubkey,
        proposal,
        intentData,
        network,
        account.address
      );

      setStatus('sending');

      const executeIx = buildExecuteInstruction(
        ctx.walletAddress,
        ctx.vaultAddress,
        ctx.intentAddress,
        ctx.proposalAddress,
        ctx.eventAuthority,
        ctx.remainingAccounts
      );

      const rpc = createSolanaRpc(RPC_ENDPOINTS[network]);
      const { value: blockhash } = await rpc.getLatestBlockhash().send();

      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        (m) => appendTransactionMessageInstruction(executeIx as any, m),
      );

      const sig = await signAndSendTransactionMessageWithSigners(message);
      setTxSig(typeof sig === 'string' ? sig : bs58.encode(sig as any));
      setStatus('success');
      setTimeout(onSuccess, 2000);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.message ?? String(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-lg w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-slate-100">
            Execute Proposal #{proposal.proposalIndex.toString()}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Action summary */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Action
            </label>
            <p className="text-sm text-slate-200 font-mono bg-slate-900/50 rounded px-2 py-1.5">
              {rendered}
            </p>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <p className="text-sm text-blue-300">
              Execute is a permissionless crank — no offchain signature needed.
              Your wallet only signs the transaction fee.
            </p>
          </div>

          {/* Status */}
          {status === 'resolving' && (
            <div className="flex items-center gap-2 text-sm text-amber-300">
              <div className="w-4 h-4 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin" />
              Resolving accounts...
            </div>
          )}
          {status === 'sending' && (
            <div className="flex items-center gap-2 text-sm text-blue-300">
              <div className="w-4 h-4 border-2 border-blue-300/30 border-t-blue-300 rounded-full animate-spin" />
              Sending transaction...
            </div>
          )}
          {status === 'success' && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <p className="text-sm text-emerald-300 mb-1">Proposal executed</p>
              {txSig && (
                <p className="text-xs text-slate-400 font-mono break-all">{txSig}</p>
              )}
            </div>
          )}
          {status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-300">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            disabled={status === 'resolving' || status === 'sending'}
            className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100 transition-colors disabled:opacity-50"
          >
            Close
          </button>
          <button
            onClick={handleExecute}
            disabled={!account || status !== 'idle'}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
          >
            {status === 'idle'
              ? 'Execute'
              : status === 'success'
              ? 'Done'
              : 'Processing...'}
          </button>
        </div>
      </div>
    </div>
  );
}
