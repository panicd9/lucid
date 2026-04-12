import type {
  AnchorIdl,
  IntentDefinition,
  VerificationResult,
} from '../types.js';
import { verifyKnownProgram } from './tier1.js';
import { verifyIdlStructural } from './tier2.js';

/**
 * VerificationEngine: multi-tier intent verification.
 *
 * Tier 1 — Known programs: hardcoded definitions for System, SPL Token, BPF Loader.
 * Tier 2 — IDL structural: verify against the source Anchor IDL.
 * Tier 3 — Unverified: no data available.
 */
export class VerificationEngine {
  /**
   * Verify a single intent definition.
   * Tries Tier 1 (known programs) first, then Tier 2 (IDL structural) if IDL provided.
   */
  verify(intent: IntentDefinition, idl?: AnchorIdl): VerificationResult {
    // Try Tier 1 first
    const tier1 = verifyKnownProgram(intent);
    if (tier1.status === 'verified' || tier1.status === 'mismatch') return tier1;

    // Try Tier 2 if IDL provided
    if (idl) {
      return verifyIdlStructural(intent, idl);
    }

    // Tier 3: unverified
    return {
      status: 'unverified',
      tier: 'unverified',
      confidence: 0,
      details: 'No IDL available for verification',
    };
  }

  /**
   * Verify all intents in a batch, attaching results to each.
   */
  verifyAll(intents: IntentDefinition[], idl?: AnchorIdl): IntentDefinition[] {
    return intents.map((i) => ({
      ...i,
      verification: this.verify(i, idl),
    }));
  }
}
