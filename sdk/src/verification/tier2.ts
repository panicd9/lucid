import { createHash } from 'node:crypto';
import type {
  AnchorIdl,
  IntentDefinition,
  VerificationResult,
} from '../types.js';

/**
 * Compute the Anchor discriminator for an instruction name.
 * Anchor convention: first 8 bytes of SHA-256("global:{name}")
 */
function anchorDiscriminator(name: string): number[] {
  const hash = createHash('sha256')
    .update(`global:${name}`)
    .digest();
  return Array.from(hash.subarray(0, 8));
}

/**
 * Compare two discriminator byte arrays.
 */
function discriminatorsMatch(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Tier 2 verification: IDL structural checks.
 * Verifies intent against its source Anchor IDL.
 */
export function verifyIdlStructural(
  intent: IntentDefinition,
  idl: AnchorIdl
): VerificationResult {
  const errors: string[] = [];

  // 1. Find instruction by discriminator
  const ix = idl.instructions.find((i) =>
    discriminatorsMatch(i.discriminator, intent.discriminator)
  );

  if (!ix) {
    return {
      status: 'mismatch',
      tier: 'idl_structural',
      confidence: 0,
      details: `No IDL instruction matches discriminator [${intent.discriminator.join(',')}]`,
    };
  }

  // 2. Verify name matches
  if (ix.name !== intent.instructionName) {
    errors.push(
      `Name mismatch: intent="${intent.instructionName}", IDL="${ix.name}"`
    );
  }

  // 3. Verify account count and writable/signer
  if (intent.accounts.length !== ix.accounts.length) {
    errors.push(
      `Account count: intent=${intent.accounts.length}, IDL=${ix.accounts.length}`
    );
  }
  const minAccounts = Math.min(intent.accounts.length, ix.accounts.length);
  for (let i = 0; i < minAccounts; i++) {
    const intentAcc = intent.accounts[i];
    const idlAcc = ix.accounts[i];

    if (intentAcc.writable !== (idlAcc.writable ?? false)) {
      errors.push(
        `Account ${i} (${idlAcc.name}): writable mismatch`
      );
    }
    if (intentAcc.signer !== (idlAcc.signer ?? false)) {
      errors.push(
        `Account ${i} (${idlAcc.name}): signer mismatch`
      );
    }
  }

  // 4. Verify arg types match data segment encodings
  const paramSegments = intent.dataSegments.filter((s) => s.type === 'param');
  // Count only supported IDL args (simple types only, matching generator logic)
  const supportedArgs = ix.args.filter((a) => typeof a.type === 'string');
  if (paramSegments.length !== supportedArgs.length) {
    errors.push(
      `Param segment count (${paramSegments.length}) vs supported IDL args (${supportedArgs.length})`
    );
  }

  // 5. Verify template references valid param names
  const paramNames = new Set(intent.params.map((p) => p.name));
  const templateRefs = intent.template.match(/\{(\w+)\}/g) || [];
  for (const ref of templateRefs) {
    const name = ref.slice(1, -1); // strip { }
    if (!paramNames.has(name)) {
      errors.push(`Template references unknown param: ${name}`);
    }
  }

  // 6. Verify discriminator matches Anchor convention
  const expected = anchorDiscriminator(ix.name);
  if (!discriminatorsMatch(intent.discriminator, expected)) {
    // Not necessarily an error — some programs use non-standard discriminators.
    // But for Anchor IDL structural verification, we note it.
    errors.push(
      `Discriminator does not match Anchor convention sha256("global:${ix.name}")[0..8]. ` +
        `Got [${intent.discriminator.join(',')}], expected [${expected.join(',')}]`
    );
  }

  if (errors.length > 0) {
    // Any structural error (accounts, args, discriminator) is a hard mismatch
    const hasCriticalError = errors.some(
      (e) =>
        e.includes('Name mismatch') ||
        e.includes('Account count') ||
        e.includes('writable mismatch') ||
        e.includes('signer mismatch') ||
        e.includes('Param segment count') ||
        e.includes('Discriminator does not match')
    );
    const totalChecks = 4 + templateRefs.length;
    const failedChecks = errors.length;
    const confidence = Math.max(0, (totalChecks - failedChecks) / totalChecks);

    return {
      status: hasCriticalError ? 'mismatch' : 'unverified',
      tier: 'idl_structural',
      confidence,
      details: errors.join('; '),
    };
  }

  // Compute intent hash for integrity
  const hashInput = JSON.stringify({
    programId: intent.programId,
    discriminator: intent.discriminator,
    accounts: intent.accounts.map((a) => ({
      name: a.name,
      source: a.source,
      writable: a.writable,
      signer: a.signer,
    })),
    params: intent.params.map((p) => ({ name: p.name, type: p.type })),
  });
  const intentHash = createHash('sha256').update(hashInput).digest('hex');

  return {
    status: 'verified',
    tier: 'idl_structural',
    confidence: 1.0,
    details: `Structurally verified against IDL instruction "${ix.name}"`,
    intentHash,
  };
}
