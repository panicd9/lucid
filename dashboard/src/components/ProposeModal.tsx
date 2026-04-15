import { useState, useEffect, useCallback } from 'react';
import { useSelectedWalletAccount, useSignMessage, useWalletAccountTransactionSendingSigner } from '@solana/react';
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signAndSendTransactionMessageWithSigners,
  createSolanaRpc,
  address,
} from '@solana/kit';
import { PublicKey, Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildEd25519Instruction, buildProposeInstruction } from '../lib/instructions';
import { buildMessageBody, buildOffchainEnvelope, formatExpiry } from '../lib/message';
import { encodeParamsData, renderTemplate } from '../lib/params';
import { RPC_ENDPOINTS, PARAM_TYPE_LABELS, PARAM_TYPE_ADDRESS, PARAM_TYPE_BOOL } from '../lib/constants';
import { findProposalPDA, findIntentPDA } from '../lib/pda';
import { deserializeWallet } from '../lib/deserialize';
import { CHAIN_MAP } from '../App';
import type { IntentAccount } from '../lib/deserialize';

type Status = 'form' | 'preview' | 'signing' | 'sending' | 'success' | 'error';

interface Props {
  intent: IntentAccount;
  walletAddress: string;
  walletName: string;
  network: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProposeModal({
  intent,
  walletAddress,
  walletName,
  network,
  onClose,
  onSuccess,
}: Props) {
  const [status, setStatus] = useState<Status>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [txSig, setTxSig] = useState('');
  const [expirySeconds, setExpirySeconds] = useState(300);
  const [paramValues, setParamValues] = useState<string[]>(
    intent.params.map(() => '')
  );

  const [account] = useSelectedWalletAccount();
  const chain = CHAIN_MAP[network] ?? 'solana:localnet';
  const signMessage = useSignMessage(account!);
  const signer = useWalletAccountTransactionSendingSigner(account!, chain);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && status !== 'signing' && status !== 'sending') onClose();
  }, [status, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  const updateParam = (index: number, value: string) => {
    setParamValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  // Preview
  const rendered = renderTemplate(intent.template, paramValues, intent.params);
  const expiryStr = formatExpiry(expirySeconds);

  const handleSubmit = async () => {
    if (!account) return;

    try {
      setStatus('signing');
      setErrorMsg('');

      // Fetch current wallet to get next proposalIndex
      const connection = new Connection(RPC_ENDPOINTS[network]);
      const walletPk = new PublicKey(walletAddress);
      const walletInfo = await connection.getAccountInfo(walletPk);
      if (!walletInfo) throw new Error('Wallet account not found');
      const walletData = deserializeWallet(Buffer.from(walletInfo.data));
      const proposalIndex = walletData.proposalIndex;

      // Encode params
      const paramsData = encodeParamsData(paramValues, intent.params);

      // Build message
      const body = buildMessageBody(
        'propose',
        rendered,
        walletName,
        proposalIndex,
        expiryStr
      );
      const envelope = buildOffchainEnvelope(body);

      // Sign offchain message
      const { signature } = await signMessage({ message: envelope });

      setStatus('sending');

      // Build instructions
      const pubkeyBytes = new Uint8Array(bs58.decode(account.address));
      const ed25519Ix = buildEd25519Instruction(
        new Uint8Array(signature),
        pubkeyBytes,
        envelope
      );

      // Derive PDAs
      const [intentPda] = findIntentPDA(walletPk, intent.intentIndex);
      const [proposalPda] = findProposalPDA(intentPda, proposalIndex);

      const proposeIx = buildProposeInstruction(
        address(walletAddress),
        address(intentPda.toBase58()),
        address(proposalPda.toBase58()),
        address(account.address),
        proposalIndex,
        paramsData
      );

      // Build and send transaction
      const rpc = createSolanaRpc(RPC_ENDPOINTS[network]);
      const { value: blockhash } = await rpc.getLatestBlockhash().send();

      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        (m) => appendTransactionMessageInstruction(ed25519Ix as any, m),
        (m) => appendTransactionMessageInstruction(proposeIx as any, m),
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="propose-modal-title">
      <div className="bg-slate-800/90 backdrop-blur-md border border-slate-700/50 rounded-xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 sticky top-0 bg-slate-800/90 backdrop-blur-md z-10">
          <h3 id="propose-modal-title" className="text-lg font-semibold text-slate-100 font-heading tracking-wide">
            New Proposal — Intent #{intent.intentIndex}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Template */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Template
            </label>
            <p className="text-sm text-slate-200 font-mono bg-slate-900 border border-slate-600 rounded-lg p-3">
              {intent.template}
            </p>
          </div>

          {/* Param inputs */}
          {intent.params.map((param, i) => (
            <div key={i}>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {param.name || `Param {${i}}`}
                <span className="text-slate-500 ml-2">
                  ({PARAM_TYPE_LABELS[param.paramType] ?? 'unknown'})
                </span>
              </label>
              <input
                type="text"
                value={paramValues[i]}
                onChange={(e) => updateParam(i, e.target.value)}
                disabled={status !== 'form' && status !== 'preview'}
                placeholder={
                  param.paramType === PARAM_TYPE_ADDRESS
                    ? 'Base58 address...'
                    : param.paramType === PARAM_TYPE_BOOL
                    ? 'true or false'
                    : 'Value...'
                }
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
              />
            </div>
          ))}

          {/* Expiry */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Signature expiry
            </label>
            <select
              value={expirySeconds}
              onChange={(e) => setExpirySeconds(Number(e.target.value))}
              disabled={status !== 'form' && status !== 'preview'}
              className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 w-full focus:outline-none focus:border-amber-500/50"
            >
              <option value={60}>1 minute</option>
              <option value={300}>5 minutes</option>
              <option value={600}>10 minutes</option>
              <option value={1800}>30 minutes</option>
              <option value={3600}>1 hour</option>
            </select>
          </div>

          {/* Preview */}
          {(status === 'preview' || status === 'form') && rendered && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Message preview
              </label>
              <div className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm text-amber-300 font-mono break-all">
                {buildMessageBody('propose', rendered, walletName, '?', expiryStr)}
              </div>
            </div>
          )}

          {/* Status */}
          {status === 'signing' && (
            <div className="flex items-center gap-2 text-sm text-amber-300">
              <div className="w-4 h-4 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin" />
              Waiting for wallet signature...
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
              <p className="text-sm text-emerald-300 mb-1">Proposal created</p>
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
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-700/50 sticky bottom-0 bg-slate-800/90 backdrop-blur-md">
          <button
            onClick={onClose}
            disabled={status === 'signing' || status === 'sending'}
            className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            Close
          </button>
          <button
            onClick={handleSubmit}
            disabled={!account || (status !== 'form' && status !== 'preview')}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shadow-glow-purple"
          >
            {status === 'form' || status === 'preview'
              ? 'Sign & Propose'
              : status === 'success'
              ? 'Done'
              : 'Processing...'}
          </button>
        </div>
      </div>
    </div>
  );
}
