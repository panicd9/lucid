import { useState, useEffect, useCallback } from 'react';
import { useSelectedWalletAccount, useWalletAccountTransactionSigner } from '@solana/react';
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  createSolanaRpc,
} from '@solana/kit';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildExecuteInstruction } from '../lib/instructions';
import { ROLE_READONLY_SIGNER, ROLE_WRITABLE_SIGNER } from '../lib/constants';
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
  const signer = useWalletAccountTransactionSigner(account!, chain);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && status !== 'resolving' && status !== 'sending') onClose();
  }, [status, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  let rendered = '';
  try {
    const decoded = decodeParamsData(proposal.paramsData, intentData.params, intentData.intentType);
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

      const signerAccounts = ctx.remainingAccounts.map((acc) =>
        (acc.role === ROLE_WRITABLE_SIGNER || acc.role === ROLE_READONLY_SIGNER) &&
        acc.address === signer.address
          ? { ...acc, signer }
          : acc
      );

      const executeIx = buildExecuteInstruction(
        ctx.walletAddress,
        ctx.vaultAddress,
        ctx.intentAddress,
        ctx.proposalAddress,
        ctx.eventAuthority,
        signerAccounts
      );

      const rpc = createSolanaRpc(RPC_ENDPOINTS[network]);
      const { value: blockhash } = await rpc.getLatestBlockhash().send();

      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        (m) => appendTransactionMessageInstruction(executeIx as any, m),
      );

      const signedTx = await signTransactionMessageWithSigners(message);
      const encodedTx = getBase64EncodedWireTransaction(signedTx);
      const sig = await rpc.sendTransaction(encodedTx, { encoding: 'base64' }).send();
      setTxSig(typeof sig === 'string' ? sig : bs58.encode(sig as any));
      setStatus('success');
      setTimeout(onSuccess, 2000);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.message ?? String(err));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="execute-modal-title">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/30 rounded-2xl max-w-lg w-full shadow-2xl">
        {/* Gradient accent line */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/50">
          <h3 id="execute-modal-title" className="text-lg font-semibold text-slate-100 font-heading tracking-wide">
            Execute
            <span className="text-sm font-normal text-slate-500 ml-2 font-body">Proposal #{proposal.proposalIndex.toString()}</span>
          </h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer p-1 rounded-lg hover:bg-slate-800/50"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Action
            </label>
            <p className="text-sm text-slate-200 font-mono bg-slate-800/40 border border-slate-800/50 rounded-lg px-3 py-2.5">
              {rendered}
            </p>
          </div>

          <div className="bg-violet-500/5 border border-violet-500/15 rounded-lg p-4">
            <p className="text-sm text-violet-300/90">
              Execute is a permissionless crank — no offchain signature needed.
              Your wallet only signs the transaction fee.
            </p>
          </div>

          {status === 'resolving' && (
            <div className="flex items-center gap-3 text-sm text-amber-300 bg-amber-500/5 rounded-lg px-4 py-3 border border-amber-500/10">
              <div className="w-4 h-4 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin" />
              Resolving accounts...
            </div>
          )}
          {status === 'sending' && (
            <div className="flex items-center gap-3 text-sm text-violet-300 bg-violet-500/5 rounded-lg px-4 py-3 border border-violet-500/10">
              <div className="w-4 h-4 border-2 border-violet-300/30 border-t-violet-300 rounded-full animate-spin" />
              Sending transaction...
            </div>
          )}
          {status === 'success' && (
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-4">
              <p className="text-sm font-medium text-emerald-300 mb-1">Proposal executed</p>
              {txSig && (
                <p className="text-xs text-slate-500 font-mono break-all">{txSig}</p>
              )}
            </div>
          )}
          {status === 'error' && (
            <div className="bg-red-500/5 border border-red-500/15 rounded-lg p-4">
              <p className="text-sm text-red-300">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-800/50">
          <button
            onClick={onClose}
            disabled={status === 'resolving' || status === 'sending'}
            className="px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed rounded-lg hover:bg-slate-800/50"
          >
            Close
          </button>
          <button
            onClick={handleExecute}
            disabled={!account || status !== 'idle'}
            className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shadow-glow-purple"
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
