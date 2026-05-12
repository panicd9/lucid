import type { CanonicalIntent } from '../lib/templateHash';
import solTransferJson from './sol-transfer.json';
import splTransferJson from './spl-transfer.json';

/**
 * Canonical preset intent — what gets registered on a wallet via AddIntent
 * during setup phase. Mirrors the JSON shape in `demo/intents/*` so
 * `templateHash` produces identical hashes across CLI / SDK / dashboard.
 */
export interface PresetIntent extends CanonicalIntent {
  // Display-only fields (not part of the canonical hash):
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | string;
  timelockSeconds: number;
  // Dashboard-only metadata:
  displayName: string;
  description: string;
}

const SOL_TRANSFER = solTransferJson as unknown as Omit<PresetIntent, 'displayName' | 'description'>;
const SPL_TRANSFER = splTransferJson as unknown as Omit<PresetIntent, 'displayName' | 'description'>;

export const PRESET_INTENTS: PresetIntent[] = [
  {
    ...SOL_TRANSFER,
    displayName: 'Transfer SOL',
    description: 'Move native SOL from the vault to any address.',
  },
  {
    ...SPL_TRANSFER,
    displayName: 'Transfer SPL Token',
    description: 'Move SPL tokens (USDC, USDT, etc.) from the vault to any token account.',
  },
];
