import { createHash } from 'node:crypto';
import type {
  AnchorIdl,
  AnchorSeed,
  AnchorType,
  FieldPathOp,
  IntentDefinition,
  SeedDefinition,
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
 * Convert snake_case to PascalCase. Used to derive a struct type name from a
 * local account name when the IDL doesn't provide an explicit `account` field
 * on a nested-path seed.
 */
function snakeToPascal(s: string): string {
  return s
    .split('_')
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join('');
}

/**
 * Compute the Borsh-encoded byte size of a fixed-size IDL type.
 * Returns null for variable-length types (Vec, String) and `Option<VariableT>`,
 * which intentionally fail verification — they require richer walk-plan ops
 * we haven't implemented yet.
 */
function idlTypeSize(ty: any): number | null {
  if (typeof ty === 'string') {
    switch (ty) {
      case 'bool':
      case 'u8':
      case 'i8':
        return 1;
      case 'u16':
      case 'i16':
        return 2;
      case 'u32':
      case 'i32':
        return 4;
      case 'u64':
      case 'i64':
        return 8;
      case 'u128':
      case 'i128':
        return 16;
      case 'pubkey':
        return 32;
      default:
        return null;
    }
  }
  if (ty && typeof ty === 'object' && 'option' in ty) {
    const inner = idlTypeSize((ty as { option: unknown }).option);
    return inner === null ? null : 1 + inner;
  }
  return null;
}

/**
 * Walk an IDL struct's fields and produce the same walk plan the CLI encoder
 * would produce. Used to verify that an intent's `account_field` seed wasn't
 * tampered with — its fieldPath and fieldLen must match what the IDL implies.
 */
function idlWalkPlanToField(
  types: AnchorType[] | undefined,
  typeName: string,
  fieldName: string
): { path: FieldPathOp[]; targetSize: number } | { error: string } {
  if (!types) return { error: `IDL has no 'types' array (looking up ${typeName})` };
  const typeDef = types.find((t) => t.name === typeName);
  if (!typeDef) return { error: `type '${typeName}' not found in IDL` };
  const fields = typeDef.type?.fields;
  if (!Array.isArray(fields)) return { error: `type '${typeName}' has no fields` };

  const path: FieldPathOp[] = [];
  let fixedRun = 0;

  for (const field of fields) {
    const fname = field.name;
    const ty = field.type;

    if (fname === fieldName) {
      const targetSize = idlTypeSize(ty);
      if (targetSize === null) {
        return { error: `target field '${typeName}.${fieldName}' has unsupported type` };
      }
      if (fixedRun > 0) path.push({ op: 'skip_fixed', size: fixedRun });
      return { path, targetSize };
    }

    // Option<FixedT> — emit SKIP_OPTION
    if (ty && typeof ty === 'object' && 'option' in ty) {
      const innerSize = idlTypeSize((ty as { option: unknown }).option);
      if (innerSize === null) {
        return {
          error: `field '${typeName}.${fname}' is Option<variable>; only Option<FixedT> is supported`,
        };
      }
      if (fixedRun > 0) {
        path.push({ op: 'skip_fixed', size: fixedRun });
        fixedRun = 0;
      }
      path.push({ op: 'skip_option', size: innerSize });
      continue;
    }

    // Otherwise must be fixed-size. Vec/String/defined-struct return null.
    const size = idlTypeSize(ty);
    if (size === null) {
      return {
        error: `field '${typeName}.${fname}' has unsupported type before target '${fieldName}' (Vec/String/nested struct not yet supported)`,
      };
    }
    fixedRun += size;
  }

  return { error: `field '${fieldName}' not found in type '${typeName}'` };
}

/**
 * Compare an intent's seed against the IDL's seed at the same position.
 * Returns null on match, error string on mismatch.
 */
function compareSeed(
  intentSeed: SeedDefinition,
  idlSeed: AnchorSeed,
  argNames: string[],
  accountNames: string[],
  idlTypes: AnchorType[] | undefined,
  seedIndex: number
): string | null {
  switch (idlSeed.kind) {
    case 'const': {
      if (intentSeed.type !== 'literal') {
        return `seed[${seedIndex}]: IDL kind=const but intent type=${intentSeed.type}`;
      }
      const expected = idlSeed.value ?? [];
      const actual = intentSeed.value ?? [];
      if (expected.length !== actual.length || !expected.every((v, i) => v === actual[i])) {
        return `seed[${seedIndex}]: literal bytes mismatch`;
      }
      return null;
    }
    case 'arg': {
      if (intentSeed.type !== 'param') {
        return `seed[${seedIndex}]: IDL kind=arg but intent type=${intentSeed.type}`;
      }
      const path = idlSeed.path ?? '';
      const expectedIdx = argNames.indexOf(path);
      if (expectedIdx < 0) {
        return `seed[${seedIndex}]: IDL arg '${path}' not found in instruction args`;
      }
      if (intentSeed.paramIndex !== expectedIdx) {
        return `seed[${seedIndex}]: paramIndex mismatch (intent=${intentSeed.paramIndex}, expected=${expectedIdx})`;
      }
      return null;
    }
    case 'account': {
      const path = idlSeed.path ?? '';
      const dotIdx = path.indexOf('.');
      const rootName = dotIdx >= 0 ? path.slice(0, dotIdx) : path;
      const expectedAcctIdx = accountNames.indexOf(rootName);
      if (expectedAcctIdx < 0) {
        return `seed[${seedIndex}]: IDL account '${rootName}' not found in instruction accounts`;
      }

      if (dotIdx < 0) {
        // Plain account-address seed.
        if (intentSeed.type !== 'account') {
          return `seed[${seedIndex}]: IDL kind=account (no path) but intent type=${intentSeed.type}`;
        }
        if (intentSeed.accountIndex !== expectedAcctIdx) {
          return `seed[${seedIndex}]: accountIndex mismatch (intent=${intentSeed.accountIndex}, expected=${expectedAcctIdx})`;
        }
        return null;
      }

      // Nested-path account seed: must be account_field with matching walk plan.
      if (intentSeed.type !== 'account_field') {
        return `seed[${seedIndex}]: IDL nested path '${path}' but intent type=${intentSeed.type} (expected account_field)`;
      }
      if (intentSeed.accountIndex !== expectedAcctIdx) {
        return `seed[${seedIndex}]: accountIndex mismatch (intent=${intentSeed.accountIndex}, expected=${expectedAcctIdx})`;
      }
      const fieldName = path.slice(dotIdx + 1);
      const typeName = idlSeed.account ?? snakeToPascal(rootName);
      const expected = idlWalkPlanToField(idlTypes, typeName, fieldName);
      if ('error' in expected) {
        return `seed[${seedIndex}]: ${expected.error}`;
      }
      if (intentSeed.fieldLen !== expected.targetSize) {
        return `seed[${seedIndex}]: fieldLen mismatch (intent=${intentSeed.fieldLen}, expected=${expected.targetSize})`;
      }
      const actualPath = intentSeed.fieldPath ?? [];
      if (actualPath.length !== expected.path.length) {
        return `seed[${seedIndex}]: fieldPath op count mismatch (intent=${actualPath.length}, expected=${expected.path.length})`;
      }
      for (let k = 0; k < expected.path.length; k++) {
        if (actualPath[k].op !== expected.path[k].op || actualPath[k].size !== expected.path[k].size) {
          return `seed[${seedIndex}]: fieldPath op[${k}] mismatch (intent=${JSON.stringify(actualPath[k])}, expected=${JSON.stringify(expected.path[k])})`;
        }
      }
      return null;
    }
    default:
      return `seed[${seedIndex}]: unknown IDL seed kind '${(idlSeed as { kind: string }).kind}'`;
  }
}

/**
 * Verify each PDA account's seeds against the corresponding IDL pda definition.
 * Catches tampering where the seeds list is modified to derive a different PDA
 * than what the IDL implies. Returns errors found; empty array means OK.
 */
function verifySeeds(
  intent: IntentDefinition,
  idlInstruction: { accounts: any[]; args: { name: string }[] },
  idlTypes: AnchorType[] | undefined
): string[] {
  const errors: string[] = [];
  const argNames = idlInstruction.args.map((a) => a.name);
  const accountNames = idlInstruction.accounts.map((a) => a.name);

  const minAccts = Math.min(intent.accounts.length, idlInstruction.accounts.length);
  for (let i = 0; i < minAccts; i++) {
    const idlAcc = idlInstruction.accounts[i];
    const intentAcc = intent.accounts[i];
    if (!idlAcc.pda || intentAcc.source !== 'pda') continue;

    const idlSeeds: AnchorSeed[] = idlAcc.pda.seeds ?? [];
    const intentSeeds: SeedDefinition[] = intentAcc.seeds ?? [];

    if (idlSeeds.length !== intentSeeds.length) {
      errors.push(
        `Account ${i} (${idlAcc.name}): seed count mismatch (intent=${intentSeeds.length}, IDL=${idlSeeds.length})`
      );
      continue;
    }
    for (let j = 0; j < idlSeeds.length; j++) {
      const err = compareSeed(intentSeeds[j], idlSeeds[j], argNames, accountNames, idlTypes, j);
      if (err) errors.push(`Account ${i} (${idlAcc.name}): ${err}`);
    }
  }

  return errors;
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

  // 6. Verify PDA seeds match the IDL
  const seedErrors = verifySeeds(intent, ix, idl.types);
  for (const e of seedErrors) errors.push(e);

  // 7. Verify discriminator matches Anchor convention
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
        e.includes('Discriminator does not match') ||
        // Any seed error: prefixed with "Account N (name): seed[..]" or "seed count mismatch"
        e.startsWith('Account ') && e.includes('seed')
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
