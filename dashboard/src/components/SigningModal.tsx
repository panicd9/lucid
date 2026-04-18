import { useState, useEffect, useCallback } from 'react';
import { useSelectedWalletAccount, useSignMessage, useWalletAccountTransactionSigner } from '@solana/react';
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
import bs58 from 'bs58';
import { buildEd25519Instruction, buildApproveInstruction, buildCancelInstruction, type LucidInstruction } from '../lib/instructions';
import { buildMessageBody, buildOffchainEnvelope, formatExpiry } from '../lib/message';
import { decodeParamsData, renderTemplate } from '../lib/params';
import { RPC_ENDPOINTS } from '../lib/constants';
import { CHAIN_MAP } from '../App';
import { parseTransactionError } from '../lib/errors';
import { getExplorerTxUrl } from '../lib/explorer';
import type { IntentAccount, ProposalAccount } from '../lib/deserialize';
import type { PublicKey } from '@solana/web3.js';
import { address } from '@solana/kit';

type Status = 'idle' | 'signing' | 'sending' | 'success' | 'error';

interface Props {
  action: 'approve' | 'cancel';
  proposal: ProposalAccount & { address: PublicKey; intentData: IntentAccount };
  walletName: string;
  walletAddress: string;
  network: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SigningModal({
  action,
  proposal,
  walletName,
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
  const [expirySeconds, setExpirySeconds] = useState(300);

  const [account] = useSelectedWalletAccount();
  const chain = CHAIN_MAP[network] ?? 'solana:localnet';
  const signMessage = useSignMessage(account!);
  const signer = useWalletAccountTransactionSigner(account!, chain);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && status !== 'signing' && status !== 'sending') onClose();
  }, [status, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  const decoded = decodeParamsData(proposal.paramsData, intentData.params, intentData.intentType);
  const rendered = renderTemplate(intentData.template, decoded, intentData.params);
  const expiryStr = formatExpiry(expirySeconds);
  const messageBody = buildMessageBody(
    action,
    rendered,
    walletName,
    proposal.proposalIndex,
    expiryStr
  );

  const handleSubmit = async () => {
    if (!account) return;

    try {
      setStatus('signing');
      setErrorMsg('');
      setRecoveryMsg('');

      const envelope = buildOffchainEnvelope(messageBody);
      const { signature } = await signMessage({ message: envelope });

      setStatus('sending');

      const pubkeyBytes = new Uint8Array(bs58.decode(account.address));
      const ed25519Ix = buildEd25519Instruction(
        new Uint8Array(signature),
        pubkeyBytes,
        envelope
      );

      const walletAddr = address(walletAddress);
      const intentPdaAddr = address(proposal.intent.toBase58());
      const proposalAddr = address(proposal.address.toBase58());

      const actionIx =
        action === 'approve'
          ? buildApproveInstruction(walletAddr, intentPdaAddr, proposalAddr)
          : buildCancelInstruction(walletAddr, intentPdaAddr, proposalAddr);

      const rpc = createSolanaRpc(RPC_ENDPOINTS[network]);
      const { value: blockhash } = await rpc.getLatestBlockhash().send();

      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        (m) => appendTransactionMessageInstruction(ed25519Ix as any, m),
        (m) => appendTransactionMessageInstruction(actionIx as any, m),
      );

      const signedTx = await signTransactionMessageWithSigners(message);
      const encodedTx = getBase64EncodedWireTransaction(signedTx);
      const sig = await rpc.sendTransaction(encodedTx, { encoding: 'base64' }).send();
      setTxSig(typeof sig === 'string' ? sig : bs58.encode(sig as any));
      setStatus('success');
      setTimeout(onSuccess, 2000);
    } catch (err: any) {
      console.error('[Sign] Transaction failed:', err);
      if (err?.logs) console.error('[Sign] Program logs:', err.logs);
      if (err?.context) console.error('[Sign] Context:', err.context);
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

  const isApprove = action === 'approve';
  const accentGradient = isApprove
    ? 'from-transparent via-emerald-500/50 to-transparent'
    : 'from-transparent via-red-500/50 to-transparent';

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="signing-modal-title">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/30 rounded-2xl max-w-lg w-full shadow-2xl">
        {/* Gradient accent line */}
        <div className={`h-[1px] bg-gradient-to-r ${accentGradient}`} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/50">
          <h3 id="signing-modal-title" className="text-lg font-semibold text-slate-100 font-heading tracking-wide capitalize">
            {action} Proposal
            <span className="text-sm font-normal text-slate-500 ml-2 font-body">#{proposal.proposalIndex.toString()}</span>
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
              Message to sign
            </label>
            <div className="bg-slate-800/40 border border-slate-800/50 rounded-lg p-3 text-sm text-amber-300/90 font-mono break-all">
              {messageBody}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Signature expiry
            </label>
            <select
              value={expirySeconds}
              onChange={(e) => setExpirySeconds(Number(e.target.value))}
              disabled={status !== 'idle'}
              className="bg-slate-800/40 border border-slate-800/50 rounded-lg px-3 py-2.5 text-sm text-slate-200 w-full focus:outline-none focus:border-amber-500/40 cursor-pointer"
            >
              <option value={60}>1 minute</option>
              <option value={300}>5 minutes</option>
              <option value={600}>10 minutes</option>
              <option value={1800}>30 minutes</option>
              <option value={3600}>1 hour</option>
            </select>
          </div>

          {status === 'signing' && (
            <div className="flex items-center gap-3 text-sm text-amber-300 bg-amber-500/5 rounded-lg px-4 py-3 border border-amber-500/10">
              <div className="w-4 h-4 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin" />
              Waiting for wallet signature... Check your wallet for the approval prompt.
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
              <p className="text-sm font-medium text-emerald-300 mb-2">Transaction confirmed</p>
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
              disabled={status === 'signing' || status === 'sending'}
              className="px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed rounded-lg hover:bg-slate-800/50"
            >
              {status === 'success' ? 'Done' : 'Cancel'}
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
                onClick={handleSubmit}
                disabled={!account || status !== 'idle'}
                className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed ${
                  isApprove
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                    : 'bg-red-500 hover:bg-red-400 text-white'
                }`}
              >
                {status === 'idle' ? `Sign & ${isApprove ? 'Approve' : 'Cancel'}` : 'Processing...'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
