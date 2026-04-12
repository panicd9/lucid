import type { IntentDefinition, VerificationResult } from '../types.js';
import { KNOWN_PROGRAMS } from './known-programs.js';

/**
 * Compare two discriminator byte arrays for equality.
 */
function discriminatorsMatch(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Tier 1 verification: known programs.
 * Checks intent against hardcoded definitions for System Program, SPL Token, BPF Loader.
 */
export function verifyKnownProgram(intent: IntentDefinition): VerificationResult {
  const program = KNOWN_PROGRAMS.get(intent.programId);
  if (!program) {
    return {
      status: 'unverified',
      tier: 'unverified',
      confidence: 0,
      details: `Program ${intent.programId} not in known programs list`,
    };
  }

  // Find instruction by discriminator
  const knownIx = program.instructions.find((ix) =>
    discriminatorsMatch(ix.discriminator, intent.discriminator)
  );

  if (!knownIx) {
    return {
      status: 'mismatch',
      tier: 'known_program',
      confidence: 0,
      details: `Discriminator [${intent.discriminator.join(',')}] not found in ${program.name}`,
    };
  }

  const errors: string[] = [];

  // Verify account count matches
  if (intent.accounts.length !== knownIx.accounts.length) {
    errors.push(
      `Account count mismatch: intent has ${intent.accounts.length}, expected ${knownIx.accounts.length}`
    );
  }

  // Verify account writable/signer flags
  const minAccounts = Math.min(intent.accounts.length, knownIx.accounts.length);
  for (let i = 0; i < minAccounts; i++) {
    const intentAcc = intent.accounts[i];
    const knownAcc = knownIx.accounts[i];

    if (intentAcc.writable !== knownAcc.writable) {
      errors.push(
        `Account ${i} (${knownAcc.name}): writable mismatch — intent=${intentAcc.writable}, expected=${knownAcc.writable}`
      );
    }
    if (intentAcc.signer !== knownAcc.signer) {
      errors.push(
        `Account ${i} (${knownAcc.name}): signer mismatch — intent=${intentAcc.signer}, expected=${knownAcc.signer}`
      );
    }
  }

  // Verify data segments produce correct encoding:
  // First segment should be discriminator literal
  if (intent.dataSegments.length > 0) {
    const firstSeg = intent.dataSegments[0];
    if (firstSeg.type !== 'literal') {
      errors.push('First data segment should be a literal (discriminator)');
    } else if (
      firstSeg.value &&
      !discriminatorsMatch(firstSeg.value, knownIx.discriminator)
    ) {
      errors.push(
        `Discriminator in data segment [${firstSeg.value?.join(',')}] does not match known [${knownIx.discriminator.join(',')}]`
      );
    }
  }

  // Verify arg count: param segments should match known args
  const paramSegments = intent.dataSegments.filter((s) => s.type === 'param');
  if (paramSegments.length !== knownIx.args.length) {
    errors.push(
      `Arg count mismatch: intent has ${paramSegments.length} param segments, expected ${knownIx.args.length}`
    );
  }

  // Verify arg type encodings match
  const minArgs = Math.min(paramSegments.length, knownIx.args.length);
  for (let i = 0; i < minArgs; i++) {
    const seg = paramSegments[i];
    const knownArg = knownIx.args[i];
    if (seg.encoding && seg.encoding !== knownArg.type) {
      errors.push(
        `Arg ${i} (${knownArg.name}): encoding mismatch — intent=${seg.encoding}, expected=${knownArg.type}`
      );
    }
  }

  if (errors.length > 0) {
    return {
      status: 'mismatch',
      tier: 'known_program',
      confidence: 0,
      details: errors.join('; '),
    };
  }

  return {
    status: 'verified',
    tier: 'known_program',
    confidence: 1.0,
    details: `Matched ${program.name} / ${knownIx.name}`,
  };
}
