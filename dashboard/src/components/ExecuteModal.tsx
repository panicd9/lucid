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
import { parseTransactionError } from '../lib/errors';
import { getExplorerTxUrl } from '../lib/explorer';
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
  const [recoveryMsg, setRecoveryMsg] = useState('');
  const [txSig, setTxSig] = useState('');
  const [txCopied, setTxCopied] = useState(false);

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
      setRecoveryMsg('');

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
      console.error('[Execute] Transaction failed:', err);
      if (err?.logs) console.error('[Execute] Program logs:', err.logs);
      if (err?.context) console.error('[Execute] Context:', err.context);
      const parsed = parseTransactionError(err);
      setStatus('error');
      setErrorMsg(parsed.message);
      setRecoveryMsg(parsed.recovery);
    }
  };

  const handleRetry = () => {
    setStatus('idle');
    setErrorMsg('');
    setRecoveryMsg('');
    setTxSig('');
  };

  const handleCopyTx = async () => {
    if (!txSig) return;
    await navigator.clipboard.writeText(txSig);
    setTxCopied(true);
    setTimeout(() => setTxCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="execute-modal-title">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/30 rounded-2xl max-w-lg w-full shadow-2xl animate-slide-up">
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

          {/* Fee estimate */}
          {status === 'idle' && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/30 border border-slate-800/40 rounded-lg">
              <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-slate-500">
                Estimated fee: <span className="text-slate-400 font-mono">~0.000005 SOL</span>
                <span className="text-slate-600 ml-1">(base fee for 1 signature)</span>
              </p>
            </div>
          )}

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
              <p className="text-sm font-medium text-emerald-300 mb-2">Proposal executed</p>
              {txSig && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-500 font-mono break-all flex-1">{txSig}</p>
                  <button
                    onClick={handleCopyTx}
                    className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:text-slate-300 hover:bg-slate-700/50 transition-all cursor-pointer"
                    aria-label={txCopied ? 'Copied' : 'Copy transaction signature'}
                  >
                    {txCopied ? (
                      <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
          {status === 'error' && (
            <div className="space-y-3">
              <div className="bg-red-500/5 border border-red-500/15 rounded-lg p-4">
                <p className="text-sm text-red-300">{errorMsg}</p>
              </div>
              {recoveryMsg && (
                <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-4 py-3 flex gap-3">
                  <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p className="text-sm text-amber-200/80">{recoveryMsg}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/50">
          <div>
            {status === 'success' && txSig && (
              <a
                href={getExplorerTxUrl(txSig, network)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/40 hover:border-slate-600/50 rounded-lg transition-all cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                Verify on Solscan
              </a>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={status === 'resolving' || status === 'sending'}
              className="px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed rounded-lg hover:bg-slate-800/50"
            >
              {status === 'success' ? 'Done' : 'Close'}
            </button>
            {status === 'error' ? (
              <button
                onClick={handleRetry}
                className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white transition-all cursor-pointer shadow-glow-purple"
              >
                Retry
              </button>
            ) : status !== 'success' ? (
              <button
                onClick={handleExecute}
                disabled={!account || status !== 'idle'}
                className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shadow-glow-purple"
              >
                {status === 'idle' ? 'Execute' : 'Processing...'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
