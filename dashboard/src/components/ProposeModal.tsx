import { useState, useEffect, useCallback, useMemo } from 'react';
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
  address,
} from '@solana/kit';
import { PublicKey, Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildEd25519Instruction, buildProposeInstruction } from '../lib/instructions';
import { buildMessageBody, buildOffchainEnvelope, formatExpiry } from '../lib/message';
import { encodeParamsData, renderTemplate, normalizeDecimal, resolveDecimals } from '../lib/params';
import {
  RPC_ENDPOINTS,
  PARAM_TYPE_LABELS,
  PARAM_TYPE_ADDRESS,
  PARAM_TYPE_BOOL,
  PARAM_TYPE_U64,
  PARAM_TYPE_I64,
  PARAM_TYPE_U8,
  PARAM_TYPE_U16,
  PARAM_TYPE_U32,
  PARAM_TYPE_U128,
  CONSTRAINT_LESS_THAN_U64,
  CONSTRAINT_GREATER_THAN_U64,
} from '../lib/constants';
import { findProposalPDA, findIntentPDA } from '../lib/pda';
import { deserializeWallet } from '../lib/deserialize';
import { signWithLedger } from '../lib/ledger';
import { CHAIN_MAP } from '../App';
import { parseTransactionError } from '../lib/errors';
import { getExplorerTxUrl } from '../lib/explorer';
import type { IntentAccount } from '../lib/deserialize';

const TOKEN_PROGRAM_LEGACY = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_PROGRAM_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

const NUMERIC_TYPES = new Set([PARAM_TYPE_U64, PARAM_TYPE_I64, PARAM_TYPE_U8, PARAM_TYPE_U16, PARAM_TYPE_U32, PARAM_TYPE_U128]);

type Status = 'form' | 'signing' | 'sending' | 'success' | 'error';

interface Props {
  intent: IntentAccount;
  walletAddress: string;
  walletName: string;
  network: string;
  onClose: () => void;
  onSuccess: () => void;
}

/** Validate a single param value. Returns error string or null. */
function validateParam(value: string, paramType: number, constraintType: number, constraintValue: bigint): string | null {
  if (!value.trim()) return 'Required';

  if (paramType === PARAM_TYPE_ADDRESS) {
    try {
      const decoded = bs58.decode(value.trim());
      if (decoded.length !== 32) return 'Address must be 32 bytes';
    } catch {
      return 'Invalid base58 address';
    }
    return null;
  }

  if (paramType === PARAM_TYPE_BOOL) {
    if (value !== 'true' && value !== 'false') return 'Must be true or false';
    return null;
  }

  if (NUMERIC_TYPES.has(paramType)) {
    // Allow decimal input (will be normalized later)
    const cleaned = value.replace(/,/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return 'Must be a number';

    try {
      // Parse as BigInt for constraint checking (ignore decimals for now)
      const intPart = cleaned.includes('.') ? cleaned.split('.')[0] : cleaned;
      const n = BigInt(intPart);

      if (paramType !== PARAM_TYPE_I64 && n < 0n) return 'Must be non-negative';

      // Range checks for small types
      if (paramType === PARAM_TYPE_U8 && n > 255n) return 'Max value is 255';
      if (paramType === PARAM_TYPE_U16 && n > 65535n) return 'Max value is 65,535';
      if (paramType === PARAM_TYPE_U32 && n > 4294967295n) return 'Max value is 4,294,967,295';

      // Constraint checks
      if (constraintType === CONSTRAINT_LESS_THAN_U64 && n >= constraintValue) {
        return `Must be less than ${constraintValue.toLocaleString()}`;
      }
      if (constraintType === CONSTRAINT_GREATER_THAN_U64 && n <= constraintValue) {
        return `Must be greater than ${constraintValue.toLocaleString()}`;
      }
    } catch {
      return 'Invalid number';
    }
    return null;
  }

  return null;
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
  const [recoveryMsg, setRecoveryMsg] = useState('');
  const [txSig, setTxSig] = useState('');
  const [txCopied, setTxCopied] = useState(false);
  const [expirySeconds, setExpirySeconds] = useState(300);
  const [paramValues, setParamValues] = useState<string[]>(
    intent.params.map(() => '')
  );
  const [touched, setTouched] = useState<boolean[]>(
    intent.params.map(() => false)
  );

  const [account] = useSelectedWalletAccount();
  const chain = CHAIN_MAP[network] ?? 'solana:localnet';
  const signer = useWalletAccountTransactionSigner(account!, chain);

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

  const markTouched = (index: number) => {
    setTouched((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  };

  // Validation
  const paramErrors = useMemo(() =>
    intent.params.map((param, i) => {
      if (param.name === 'token_program') return null; // handled by toggle
      return validateParam(
        paramValues[i],
        param.paramType,
        param.constraintType,
        param.constraintValue
      );
    }),
    [paramValues, intent.params]
  );

  const hasValidationErrors = paramErrors.some((e) => e !== null);

  // Preview
  const rendered = renderTemplate(intent.template, paramValues, intent.params);
  const expiryStr = formatExpiry(expirySeconds);

  /** Sign with Ledger via WebHID and submit the proposal transaction. */
  const handleLedgerSign = async () => {
    if (!account) return;

    try {
      setStatus('signing');
      setErrorMsg('');
      setRecoveryMsg('');


      // Prepare on-chain data
      const connection = new Connection(RPC_ENDPOINTS[network]);
      const walletPk = new PublicKey(walletAddress);
      const walletInfo = await connection.getAccountInfo(walletPk);
      if (!walletInfo) throw new Error('Wallet account not found');
      const walletData = deserializeWallet(Buffer.from(walletInfo.data));
      const proposalIndex = walletData.proposalIndex;

      const paramsData = encodeParamsData(paramValues, intent.params);

      const normalized = paramValues.map((v, i) => {
        const d = resolveDecimals(intent.params[i], paramValues);
        return d ? normalizeDecimal(v, d) : v;
      });
      const signedRendered = renderTemplate(intent.template, normalized, intent.params);

      const body = buildMessageBody(
        'propose',
        signedRendered,
        walletName,
        proposalIndex,
        expiryStr
      );
      const envelope = buildOffchainEnvelope(body);

      const result = await signWithLedger(envelope, account.address);

      // Fetch blockhash after signing — signing can take time and blockhash would go stale
      setStatus('sending');
      const rpc = createSolanaRpc(RPC_ENDPOINTS[network]);
      const { value: blockhash } = await rpc.getLatestBlockhash().send();

      const ed25519Ix = buildEd25519Instruction(result.signature, result.publicKey, result.v0Envelope);

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

      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        (m) => appendTransactionMessageInstruction(ed25519Ix as any, m),
        (m) => appendTransactionMessageInstruction(proposeIx as any, m),
      );

      const signedTx = await signTransactionMessageWithSigners(message);
      const encodedTx = getBase64EncodedWireTransaction(signedTx);
      const sig = await rpc.sendTransaction(encodedTx, { encoding: 'base64' }).send();
      setTxSig(typeof sig === 'string' ? sig : bs58.encode(sig as any));
      setStatus('success');
      setTimeout(onSuccess, 2000);
    } catch (err: any) {
      console.error('[Propose] Ledger signing failed:', err);
      const parsed = parseTransactionError(err);
      setStatus('error');
      setErrorMsg(parsed.message);
      setRecoveryMsg(parsed.recovery);
    }
  };

  const handleRetry = () => {
    setStatus('form');
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="propose-modal-title">
      <div className="bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/30 rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        {/* Gradient accent line */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-800/50 sticky top-0 bg-neutral-900/95 backdrop-blur-xl z-10">
          <h3 id="propose-modal-title" className="text-lg font-semibold text-neutral-100 font-heading tracking-wide">
            New Proposal
            <span className="text-sm font-normal text-neutral-500 ml-2 font-body">Intent #{intent.intentIndex}</span>
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer p-1 rounded-lg hover:bg-neutral-800/50"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Template */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
              Template
            </label>
            <p className="text-sm text-neutral-300 font-mono bg-neutral-800/40 border border-neutral-800/50 rounded-lg p-3">
              {intent.template}
            </p>
          </div>

          {/* Param inputs */}
          {intent.params.map((param, i) => {
            const error = touched[i] ? paramErrors[i] : null;
            const isValid = touched[i] && paramValues[i].trim() && !paramErrors[i];
            const borderClass = error
              ? 'border-red-500/40 ring-1 ring-red-500/15'
              : isValid
              ? 'border-emerald-500/40 ring-1 ring-emerald-500/15'
              : 'border-neutral-800/50';

            return (
              <div key={i}>
                <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                  {param.name || `Param {${i}}`}
                  <span className="text-neutral-600 ml-2 normal-case tracking-normal">
                    ({PARAM_TYPE_LABELS[param.paramType] ?? 'unknown'})
                  </span>
                </label>
                {param.name === 'token_program' ? (
                  <div className="flex rounded-lg border border-neutral-800/50 bg-neutral-800/40 p-1 gap-1">
                    {[
                      { label: 'Token Program (Legacy)', value: TOKEN_PROGRAM_LEGACY },
                      { label: 'Token Program 2022', value: TOKEN_PROGRAM_2022 },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={status !== 'form'}
                        onClick={() => { updateParam(i, opt.value); markTouched(i); }}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                          paramValues[i] === opt.value
                            ? 'bg-emerald-700 text-white shadow-md shadow-emerald-500/20'
                            : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={paramValues[i]}
                      onChange={(e) => updateParam(i, e.target.value)}
                      onBlur={() => markTouched(i)}
                      disabled={status !== 'form'}
                      placeholder={
                        param.paramType === PARAM_TYPE_ADDRESS
                          ? 'Base58 address...'
                          : param.paramType === PARAM_TYPE_BOOL
                          ? 'true or false'
                          : 'Value...'
                      }
                      className={`w-full bg-neutral-800/40 ${borderClass} rounded-lg px-3 py-2.5 pr-9 text-sm text-neutral-200 font-mono focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 disabled:opacity-50 transition-all`}
                    />
                    {/* Validation indicator */}
                    {error && (
                      <svg className="absolute right-3 top-1/2 -tranneutral-y-1/2 w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {isValid && (
                      <svg className="absolute right-3 top-1/2 -tranneutral-y-1/2 w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                )}
                {error && (
                  <p role="alert" className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                  </p>
                )}
                {/* Constraint hint */}
                {param.constraintType !== 0 && (
                  <p className="text-xs text-neutral-600 mt-1">
                    Constraint: {param.constraintType === CONSTRAINT_LESS_THAN_U64 ? '<' : '>'} {param.constraintValue.toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}

          {/* Expiry */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
              Signature expiry
            </label>
            <select
              value={expirySeconds}
              onChange={(e) => setExpirySeconds(Number(e.target.value))}
              disabled={status !== 'form'}
              className="bg-neutral-800/40 border border-neutral-800/50 rounded-lg px-3 py-2.5 text-sm text-neutral-200 w-full focus:outline-none focus:border-emerald-500/40 cursor-pointer"
            >
              <option value={60}>1 minute</option>
              <option value={300}>5 minutes</option>
              <option value={600}>10 minutes</option>
              <option value={1800}>30 minutes</option>
              <option value={3600}>1 hour</option>
            </select>
          </div>

          {/* Fee estimate */}
          {status === 'form' && (
            <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800/30 border border-neutral-800/40 rounded-lg">
              <svg className="w-3.5 h-3.5 text-neutral-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-neutral-500">
                Estimated fee: <span className="text-neutral-400 font-mono">~0.00001 SOL</span>
                <span className="text-neutral-600 ml-1">(base fee for 2 signatures)</span>
              </p>
            </div>
          )}

          {/* Preview */}
          {status === 'form' && rendered && (
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                Message preview
              </label>
              <div className="bg-neutral-800/40 border border-neutral-800/50 rounded-lg p-3 text-sm text-emerald-300/90 font-mono break-all">
                {buildMessageBody('propose', rendered, walletName, '?', expiryStr)}
              </div>
            </div>
          )}

          {/* Status */}
          {status === 'signing' && (
            <div className="flex items-center gap-3 text-sm text-amber-300 bg-amber-500/5 rounded-lg px-4 py-3 border border-amber-500/10">
              <div className="w-4 h-4 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin" />
              <span>Check your Ledger device and approve the message.</span>
            </div>
          )}
          {status === 'sending' && (
            <div className="flex items-center gap-3 text-sm text-emerald-300 bg-emerald-500/5 rounded-lg px-4 py-3 border border-emerald-500/10">
              <div className="w-4 h-4 border-2 border-emerald-300/30 border-t-emerald-300 rounded-full animate-spin" />
              Sending transaction...
            </div>
          )}
          {status === 'success' && (
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-4">
              <p className="text-sm font-medium text-emerald-300 mb-2">Proposal created</p>
              {txSig && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-neutral-500 font-mono break-all flex-1">{txSig}</p>
                  <button
                    onClick={handleCopyTx}
                    className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-neutral-600 hover:text-neutral-300 hover:bg-neutral-700/50 transition-all cursor-pointer"
                    aria-label={txCopied ? 'Copied' : 'Copy transaction signature'}
                  >
                    {txCopied ? (
                      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800/50 sticky bottom-0 bg-neutral-900/95 backdrop-blur-xl">
          <div>
            {status === 'success' && txSig && (
              <a
                href={getExplorerTxUrl(txSig, network)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 bg-neutral-800/50 hover:bg-neutral-700/50 border border-neutral-700/40 hover:border-neutral-600/50 rounded-lg transition-all cursor-pointer"
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
              className="px-4 py-2.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed rounded-lg hover:bg-neutral-800/50"
            >
              {status === 'success' ? 'Done' : 'Close'}
            </button>
            {status === 'error' ? (
              <button
                onClick={handleRetry}
                className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white transition-all cursor-pointer shadow-glow-green"
              >
                Retry
              </button>
            ) : status === 'form' ? (
              <button
                onClick={handleLedgerSign}
                disabled={!account || hasValidationErrors}
                title={hasValidationErrors ? 'Fix validation errors before signing' : undefined}
                className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed shadow-glow-green"
              >
                Sign with Ledger
              </button>
            ) : status !== 'success' ? (
              <button disabled className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-emerald-600/50 text-white/50 cursor-not-allowed">
                Processing...
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
