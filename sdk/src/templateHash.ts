import { createHash } from 'crypto';

/**
 * Canonical JSON shape of an intent file (matches the CLI's `IntentDefinition`
 * with serde camelCase). This is the *external* shape that lives in
 * intent JSON files — keep it in sync with `cli/src/types.rs`.
 *
 * The fields excluded from the hash (`riskLevel`, `timelockSeconds`,
 * `verification`, plus per-wallet config like proposers/approvers) are
 * deliberately omitted from this type so callers can't accidentally include
 * them in the canonical projection.
 */
export interface CanonicalIntent {
  version: number;
  programId: string;
  discriminator: number[];
  params: Array<{
    name: string;
    paramType: string;
    constraintType?: string;
    constraintValue?: number;
    displayDecimals?: number;
    decimalsParam?: number;
  }>;
  accounts: Array<{
    name: string;
    source: string;
    writable: boolean;
    isSigner: boolean;
    sourceData?: unknown;
  }>;
  dataSegments: Array<{
    segmentType: string;
    data?: unknown;
    paramIndex?: number | null;
  }>;
  seeds: Array<{
    seedType: string;
    value?: unknown;
    paramIndex?: number | null;
    accountIndex?: number | null;
    fieldPath?: unknown;
    fieldLen?: number | null;
  }>;
  template: string;
}

/**
 * Compute the 32-byte SHA256 of the canonical template-only projection.
 * Mirrors `compute_template_hash` in `cli/src/intent_utils.rs` — same field
 * set, same canonicalization (sorted keys, no whitespace).
 */
export function computeTemplateHash(intent: CanonicalIntent): Uint8Array {
  const projected = {
    version: intent.version,
    programId: intent.programId,
    discriminator: intent.discriminator,
    params: intent.params.map((p) => ({
      name: p.name,
      paramType: p.paramType,
      constraintType: p.constraintType ?? '',
      constraintValue: p.constraintValue ?? 0,
      displayDecimals: p.displayDecimals ?? 0,
      decimalsParam: p.decimalsParam ?? 0,
    })),
    accounts: intent.accounts.map((a) => ({
      name: a.name,
      source: a.source,
      writable: a.writable,
      isSigner: a.isSigner,
      sourceData: a.sourceData ?? null,
    })),
    dataSegments: intent.dataSegments.map((d) => ({
      segmentType: d.segmentType,
      data: d.data ?? null,
      paramIndex: d.paramIndex ?? null,
    })),
    seeds: (intent.seeds ?? []).map((s) => ({
      seedType: s.seedType,
      value: s.value ?? null,
      paramIndex: s.paramIndex ?? null,
      accountIndex: s.accountIndex ?? null,
      fieldPath: s.fieldPath ?? null,
      fieldLen: s.fieldLen ?? null,
    })),
    template: intent.template,
  };

  const canonical = canonicalStringify(projected);
  return createHash('sha256').update(canonical).digest();
}

export function templateHashHex(intent: CanonicalIntent): string {
  return Buffer.from(computeTemplateHash(intent)).toString('hex');
}

function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      '{' +
      keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') +
      '}'
    );
  }
  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}
