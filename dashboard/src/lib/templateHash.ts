import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Canonical JSON shape of an intent file. Mirrors `cli/src/types.rs` and
 * `sdk/src/templateHash.ts` — keep all three in sync; a locked
 * cross-implementation hex test catches drift.
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

  return sha256(new TextEncoder().encode(canonicalStringify(projected)));
}

export function templateHashHex(intent: CanonicalIntent): string {
  return bytesToHex(computeTemplateHash(intent));
}

export function bytesToHexString(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

/**
 * Loose-typed entry point for verifier UIs that take user-provided JSON.
 * Throws if the JSON is missing required fields.
 */
export function computeTemplateHashFromJson(parsed: unknown): Uint8Array {
  const intent = parsed as Partial<CanonicalIntent>;
  const required = ['version', 'programId', 'discriminator', 'params', 'accounts', 'dataSegments', 'seeds', 'template'] as const;
  for (const field of required) {
    if (intent[field] === undefined) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  return computeTemplateHash(intent as CanonicalIntent);
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
