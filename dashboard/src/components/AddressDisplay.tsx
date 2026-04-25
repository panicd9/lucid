import { useState } from 'react';

interface Props {
  address: string;
  chars?: number;
  className?: string;
}

export default function AddressDisplay({ address, chars = 4, className = '' }: Props) {
  const [copied, setCopied] = useState(false);

  const truncated =
    address.length > chars * 2 + 3
      ? `${address.slice(0, chars)}...${address.slice(-chars)}`
      : address;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs ${className}`}>
      <span className="text-neutral-400">{truncated}</span>
      <button
        onClick={handleCopy}
        className="text-neutral-600 hover:text-neutral-400 transition-colors cursor-pointer"
        title="Copy address"
        aria-label={copied ? 'Address copied' : 'Copy address to clipboard'}
      >
        {copied ? (
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </span>
  );
}
