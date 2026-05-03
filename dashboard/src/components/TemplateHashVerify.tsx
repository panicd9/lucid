import { useRef, useState } from 'react';
import { bytesToHexString, computeTemplateHashFromJson } from '../lib/templateHash';

interface Props {
  onChainHash: Uint8Array;
}

type VerifyResult =
  | { kind: 'idle' }
  | { kind: 'match'; localHex: string; filename: string }
  | { kind: 'mismatch'; localHex: string; filename: string }
  | { kind: 'error'; message: string };

export default function TemplateHashVerify({ onChainHash }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<VerifyResult>({ kind: 'idle' });

  const onChainHex = bytesToHexString(onChainHash);
  const isAllZero = onChainHash.every((b) => b === 0);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const localHash = computeTemplateHashFromJson(parsed);
      const localHex = bytesToHexString(localHash);
      const matches = localHex === onChainHex;
      setResult({ kind: matches ? 'match' : 'mismatch', localHex, filename: file.name });
    } catch (err) {
      setResult({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
        Template Hash
      </h4>

      <div className="rounded-lg border border-neutral-800/50 bg-neutral-800/30 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <code className="text-xs text-neutral-300 font-mono break-all">
            {isAllZero ? (
              <span className="text-neutral-500">not set (legacy intent)</span>
            ) : (
              onChainHex
            )}
          </code>
          {!isAllZero && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFile}
              />
              <button
                onClick={() => inputRef.current?.click()}
                className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-700/50 text-neutral-300 transition-colors"
              >
                Verify against JSON…
              </button>
            </>
          )}
        </div>

        {result.kind === 'match' && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>
              <span className="font-medium">Match</span> — <code className="font-mono text-neutral-400">{result.filename}</code> hashes to the on-chain value.
            </span>
          </div>
        )}

        {result.kind === 'mismatch' && (
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2 text-rose-400">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>
                <span className="font-medium">Mismatch</span> — <code className="font-mono text-neutral-400">{result.filename}</code> does not match the on-chain template.
              </span>
            </div>
            <code className="block font-mono text-neutral-500 break-all pl-6">
              local: {result.localHex}
            </code>
          </div>
        )}

        {result.kind === 'error' && (
          <div className="text-xs text-amber-400">
            Could not hash file: {result.message}
          </div>
        )}
      </div>
    </div>
  );
}
