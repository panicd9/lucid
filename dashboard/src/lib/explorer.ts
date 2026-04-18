/**
 * Solana explorer URL helpers.
 */

const EXPLORER_BASES: Record<string, string> = {
  mainnet: 'https://solscan.io/tx/',
  devnet: 'https://solscan.io/tx/',
  localhost: 'https://explorer.solana.com/tx/',
};

const CLUSTER_PARAMS: Record<string, string> = {
  mainnet: '',
  devnet: '?cluster=devnet',
  localhost: '?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899',
};

export function getExplorerTxUrl(txSig: string, network: string): string {
  const base = EXPLORER_BASES[network] ?? EXPLORER_BASES.devnet;
  const param = CLUSTER_PARAMS[network] ?? CLUSTER_PARAMS.devnet;
  return `${base}${txSig}${param}`;
}
