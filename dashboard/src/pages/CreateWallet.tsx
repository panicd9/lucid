import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { PublicKey, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildCreateWalletInstruction } from '../lib/instructions';
import { findWalletPDA, findVaultPDA, findIntentPDA } from '../lib/pda';
import { RPC_ENDPOINTS } from '../lib/constants';
import { CHAIN_MAP } from '../App';
import { parseTransactionError } from '../lib/errors';
import { getExplorerTxUrl } from '../lib/explorer';

const STEPS = [
  { label: 'Name' },
  { label: 'Proposers' },
  { label: 'Approvers' },
  { label: 'Thresholds' },
  { label: 'Review' },
];

type Status = 'idle' | 'sending' | 'success' | 'error';

interface Props {
  network: string;
}

function isValidBase58(s: string): boolean {
  try {
    const decoded = bs58.decode(s.trim());
    return decoded.length === 32;
  } catch {
    return false;
  }
}

export default function CreateWallet({ network }: Props) {
  const navigate = useNavigate();
  const [account] = useSelectedWalletAccount();
  const chain = CHAIN_MAP[network] ?? 'solana:localnet';
  const signer = useWalletAccountTransactionSigner(account!, chain);

  const [currentStep, setCurrentStep] = useState(0);
  const [walletName, setWalletName] = useState('');
  const [proposers, setProposers] = useState<string[]>([]);
  const [approvers, setApprovers] = useState<string[]>([]);
  const [newProposer, setNewProposer] = useState('');
  const [newApprover, setNewApprover] = useState('');
  const [approvalThreshold, setApprovalThreshold] = useState(1);
  const [cancelThreshold, setCancelThreshold] = useState(1);
  const [timelockSeconds, setTimelockSeconds] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [recoveryMsg, setRecoveryMsg] = useState('');
  const [txSig, setTxSig] = useState('');

  const addProposer = useCallback(() => {
    const addr = newProposer.trim();
    if (isValidBase58(addr) && !proposers.includes(addr)) {
      setProposers((prev) => [...prev, addr]);
      setNewProposer('');
    }
  }, [newProposer, proposers]);

  const addApprover = useCallback(() => {
    const addr = newApprover.trim();
    if (isValidBase58(addr) && !approvers.includes(addr)) {
      setApprovers((prev) => [...prev, addr]);
      setNewApprover('');
    }
  }, [newApprover, approvers]);

  const isStepValid = (step: number): boolean => {
    switch (step) {
      case 0: return walletName.trim().length > 0 && walletName.trim().length <= 32;
      case 1: return proposers.length > 0 && proposers.length <= 16;
      case 2: return approvers.length > 0 && approvers.length <= 16;
      case 3: return approvalThreshold >= 1 && approvalThreshold <= approvers.length &&
                     cancelThreshold >= 1 && cancelThreshold <= approvers.length;
      case 4: return true;
      default: return false;
    }
  };

  const handleCreate = async () => {
    if (!account) return;

    try {
      setStatus('sending');
      setErrorMsg('');
      setRecoveryMsg('');

      const createKeyPair = Keypair.generate();
      const createKey = createKeyPair.publicKey;

      const [walletPda] = findWalletPDA(createKey);
      const [vaultPda] = findVaultPDA(walletPda);
      const [intent0] = findIntentPDA(walletPda, 0);
      const [intent1] = findIntentPDA(walletPda, 1);
      const [intent2] = findIntentPDA(walletPda, 2);

      const proposerKeys = proposers.map((p) => new Uint8Array(bs58.decode(p)));
      const approverKeys = approvers.map((a) => new Uint8Array(bs58.decode(a)));

      const ix = buildCreateWalletInstruction(
        address(walletPda.toBase58()),
        address(vaultPda.toBase58()),
        address(intent0.toBase58()),
        address(intent1.toBase58()),
        address(intent2.toBase58()),
        address(account.address),
        createKey.toBytes(),
        walletName.trim(),
        proposerKeys,
        approverKeys,
        approvalThreshold,
        cancelThreshold,
        timelockSeconds,
      );

      const rpc = createSolanaRpc(RPC_ENDPOINTS[network]);
      const { value: blockhash } = await rpc.getLatestBlockhash().send();

      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        (m) => appendTransactionMessageInstruction(ix as any, m),
      );

      const signedTx = await signTransactionMessageWithSigners(message);
      const encodedTx = getBase64EncodedWireTransaction(signedTx);
      const sig = await rpc.sendTransaction(encodedTx, { encoding: 'base64' }).send();
      const sigStr = typeof sig === 'string' ? sig : bs58.encode(sig as any);
      setTxSig(sigStr);
      setStatus('success');
      // Navigate to the wallet after a brief delay
      setTimeout(() => navigate(`/wallet/${walletName.trim()}`), 3000);
    } catch (err: any) {
      console.error('[CreateWallet] Transaction failed:', err);
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
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6" key="step-0">
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                Wallet Name
              </label>
              <input
                type="text"
                value={walletName}
                onChange={(e) => setWalletName(e.target.value.slice(0, 32))}
                placeholder="e.g. drift-governance"
                className="w-full px-4 py-3 bg-neutral-800/40 border border-neutral-800/50 rounded-lg text-sm text-neutral-200 placeholder-neutral-600 font-mono focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                maxLength={32}
                autoFocus
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-neutral-600">Used as a display name. Lowercase, hyphens recommended.</p>
                <span className={`text-xs font-mono ${walletName.length > 28 ? 'text-emerald-400' : 'text-neutral-600'}`}>
                  {walletName.length}/32
                </span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                Default Timelock (seconds)
              </label>
              <input
                type="number"
                value={timelockSeconds}
                onChange={(e) => setTimelockSeconds(Math.max(0, Number(e.target.value)))}
                min={0}
                className="w-32 px-4 py-3 bg-neutral-800/40 border border-neutral-800/50 rounded-lg text-sm text-neutral-200 font-mono text-center focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
              />
              <p className="text-xs text-neutral-600 mt-2">Delay between approval and execution. 0 = immediate.</p>
            </div>
          </div>
        );
      case 1:
        return renderAddressList('Proposers', proposers, newProposer, setNewProposer, addProposer, (i) => setProposers((p) => p.filter((_, j) => j !== i)));
      case 2:
        return renderAddressList('Approvers', approvers, newApprover, setNewApprover, addApprover, (i) => setApprovers((a) => a.filter((_, j) => j !== i)));
      case 3:
        return (
          <div className="space-y-6" key="step-3">
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                Approval Threshold
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={approvalThreshold}
                  onChange={(e) => setApprovalThreshold(Math.min(Math.max(1, Number(e.target.value)), approvers.length))}
                  min={1}
                  max={approvers.length}
                  className="w-24 px-4 py-3 bg-neutral-800/40 border border-neutral-800/50 rounded-lg text-sm text-neutral-200 font-mono text-center focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                />
                <span className="text-sm text-neutral-500">
                  of <span className="text-neutral-300 font-semibold">{approvers.length}</span> approvers
                </span>
              </div>
              <p className="text-xs text-neutral-600 mt-2">Minimum approvals required to execute a proposal.</p>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                Cancellation Threshold
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={cancelThreshold}
                  onChange={(e) => setCancelThreshold(Math.min(Math.max(1, Number(e.target.value)), approvers.length))}
                  min={1}
                  max={approvers.length}
                  className="w-24 px-4 py-3 bg-neutral-800/40 border border-neutral-800/50 rounded-lg text-sm text-neutral-200 font-mono text-center focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                />
                <span className="text-sm text-neutral-500">
                  of <span className="text-neutral-300 font-semibold">{approvers.length}</span> approvers
                </span>
              </div>
              <p className="text-xs text-neutral-600 mt-2">Minimum cancellations to reject a proposal.</p>
            </div>
            {/* Visual threshold indicator */}
            <div className="bg-neutral-800/30 rounded-lg px-4 py-3 border border-neutral-800/50">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-neutral-500">Approval quorum</span>
                <span className="text-emerald-300 font-mono">{approvalThreshold}/{approvers.length}</span>
              </div>
              <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                  style={{ width: `${(approvalThreshold / Math.max(approvers.length, 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-5" key="step-4">
            {[
              { label: 'Wallet Name', value: walletName, mono: true },
              { label: 'Proposers', value: `${proposers.length} address${proposers.length !== 1 ? 'es' : ''}` },
              { label: 'Approvers', value: `${approvers.length} address${approvers.length !== 1 ? 'es' : ''}` },
              { label: 'Approval Threshold', value: `${approvalThreshold} of ${approvers.length}` },
              { label: 'Cancel Threshold', value: `${cancelThreshold} of ${approvers.length}` },
              { label: 'Timelock', value: timelockSeconds > 0 ? `${timelockSeconds}s` : 'None (immediate)' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-neutral-800/30 last:border-b-0">
                <span className="text-xs text-neutral-500 uppercase tracking-wider">{row.label}</span>
                <span className={`text-sm text-neutral-200 ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
              </div>
            ))}

            {/* Address lists */}
            {[
              { label: 'Proposers', list: proposers },
              { label: 'Approvers', list: approvers },
            ].map((group) => (
              <div key={group.label}>
                <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">{group.label}</h4>
                <div className="space-y-1">
                  {group.list.map((addr, i) => (
                    <div key={i} className="bg-neutral-800/20 rounded px-3 py-1.5">
                      <span className="text-xs font-mono text-neutral-400">{addr}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Fee estimate */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-neutral-800/20 border border-neutral-800/40 rounded-lg">
              <span className="text-xs text-neutral-500">Estimated creation fee</span>
              <span className="text-xs font-mono text-neutral-400">~0.01 SOL</span>
            </div>

            {/* Status messages */}
            {status === 'sending' && (
              <div className="flex items-center gap-3 text-sm text-amber-300 bg-amber-500/5 rounded-lg px-4 py-3 border border-amber-500/10">
                <div className="w-4 h-4 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin" />
                Creating wallet... Check your wallet for approval.
              </div>
            )}
            {status === 'success' && (
              <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-4">
                <p className="text-sm font-medium text-emerald-300 mb-2">Wallet created!</p>
                {txSig && (
                  <div className="flex items-center gap-2">
                    <a
                      href={getExplorerTxUrl(txSig, network)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-neutral-500 hover:text-emerald-300 break-all transition-colors"
                    >
                      {txSig.slice(0, 12)}...{txSig.slice(-8)}
                    </a>
                  </div>
                )}
                <p className="text-xs text-neutral-500 mt-2">Redirecting to your wallet...</p>
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
        );
      default:
        return null;
    }
  };

  const renderAddressList = (
    label: string,
    list: string[],
    inputValue: string,
    setInput: (v: string) => void,
    onAdd: () => void,
    onRemove: (i: number) => void,
  ) => (
    <div className="space-y-4" key={`step-${label}`}>
      <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
        {label}
      </label>

      {/* Input row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
          placeholder="Enter base58 public key..."
          className="flex-1 px-4 py-3 bg-neutral-800/40 border border-neutral-800/50 rounded-lg text-sm text-neutral-200 placeholder-neutral-600 font-mono focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
        />
        <button
          onClick={onAdd}
          disabled={!isValidBase58(inputValue)}
          className="w-full sm:w-auto px-4 py-3 text-sm font-semibold rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          Add
        </button>
      </div>

      {/* Connected wallet shortcut */}
      {account && !list.includes(account.address) && (
        <button
          onClick={() => {
            if (!list.includes(account.address)) {
              if (label === 'Proposers') setProposers((p) => [...p, account.address]);
              else setApprovers((a) => [...a, account.address]);
            }
          }}
          className="text-xs text-neutral-500 hover:text-emerald-300 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add connected wallet ({account.address.slice(0, 6)}...{account.address.slice(-4)})
        </button>
      )}

      {/* Address list */}
      <div className="space-y-2">
        {list.map((addr, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-4 py-2.5 bg-neutral-800/30 border border-neutral-800/50 rounded-lg group"
          >
            <span className="text-xs font-mono text-neutral-300 truncate mr-3">{addr}</span>
            <button
              onClick={() => onRemove(i)}
              className="shrink-0 text-neutral-600 hover:text-red-400 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
              aria-label={`Remove ${addr.slice(0, 8)}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {list.length === 0 && (
        <p className="text-xs text-neutral-600 text-center py-4">No {label.toLowerCase()} added yet. Add at least one.</p>
      )}

      <p className="text-xs text-neutral-500">
        <span className="text-emerald-300 font-semibold">{list.length}</span> {label.toLowerCase()} added
        <span className="text-neutral-600 ml-1">(max 16)</span>
      </p>
    </div>
  );

  return (
    <div className="flex flex-col items-center pt-8 pb-16">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-2xl font-heading font-bold text-neutral-100 tracking-wide mb-2">
          Create Wallet
        </h1>
        <p className="text-sm text-neutral-500">Set up a new Lucid multisig wallet on Solana</p>
      </div>

      {!account && (
        <div className="w-full max-w-2xl bg-amber-500/5 border border-amber-500/15 rounded-xl p-6 text-center">
          <p className="text-sm text-amber-300">Connect your wallet to create a Lucid multisig.</p>
          <p className="text-xs text-neutral-500 mt-2">Your wallet will pay the transaction fee and rent for account creation.</p>
        </div>
      )}

      {account && (
        <div className="w-full max-w-2xl">
          {/* Progress bar */}
          <div className="flex items-center gap-1 mb-3">
            {STEPS.map((_, i) => (
              <div key={i} className="flex-1">
                <div className={`h-1.5 w-full rounded-full transition-all ${
                  i < currentStep
                    ? 'bg-emerald-400'
                    : i === currentStep
                      ? 'bg-gradient-to-r from-emerald-400 to-emerald-400/40'
                      : 'bg-neutral-800'
                }`} />
              </div>
            ))}
          </div>

          {/* Step labels */}
          <div className="flex justify-between mb-6 px-1">
            {STEPS.map((step, i) => (
              <span
                key={i}
                className={`text-[10px] uppercase tracking-wider font-semibold transition-colors ${
                  i <= currentStep ? 'text-emerald-400/70' : 'text-neutral-700'
                }`}
              >
                {step.label}
              </span>
            ))}
          </div>

          {/* Form card */}
          <div className="bg-neutral-900/60 border border-neutral-800/60 rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
            <div className="p-5 sm:p-8">
              <div key={currentStep} className="animate-step-in">
                {renderStep()}
              </div>
            </div>

            {/* Navigation footer */}
            <div className="flex items-center justify-between px-5 sm:px-8 py-5 border-t border-neutral-800/50">
              <button
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
                className="px-4 py-2.5 text-sm text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer rounded-lg hover:bg-neutral-800/50"
              >
                Back
              </button>
              {currentStep < STEPS.length - 1 ? (
                <button
                  onClick={() => setCurrentStep(currentStep + 1)}
                  disabled={!isStepValid(currentStep)}
                  className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white transition-all cursor-pointer shadow-glow-green disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              ) : status === 'error' ? (
                <button
                  onClick={handleRetry}
                  className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white transition-all cursor-pointer shadow-glow-green"
                >
                  Retry
                </button>
              ) : status !== 'success' ? (
                <button
                  onClick={handleCreate}
                  disabled={status === 'sending'}
                  className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white transition-all cursor-pointer shadow-glow-green disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'sending' ? (
                    <span className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    'Create Wallet'
                  )}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
