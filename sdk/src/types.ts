// ---- Intent Definition (output of generator, input to on-chain registration) ----

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface IntentDefinition {
  version: number;
  programId: string;
  instructionName: string;
  discriminator: number[];
  params: ParamDefinition[];
  accounts: AccountDefinition[];
  dataSegments: DataSegmentDefinition[];
  seeds: SeedDefinition[];
  template: string;
  riskLevel: RiskLevel;
  timelockSeconds: number;
  verification: VerificationResult;
}

export interface ParamDefinition {
  name: string;
  type: 'address' | 'u64' | 'i64' | 'string' | 'bool' | 'u8' | 'u16' | 'u32' | 'u128';
  label: string;
  constraintType: 'none' | 'less_than_u64' | 'greater_than_u64';
  constraintValue: bigint;
}

export interface AccountDefinition {
  index: number;
  name: string;
  source: 'static' | 'param' | 'vault' | 'pda' | 'has_one';
  writable: boolean;
  signer: boolean;
  // source-specific data
  staticAddress?: string;
  paramIndex?: number;
  seeds?: SeedDefinition[];
  pdaProgram?: string;
  sourceAccountIndex?: number;
  dataOffset?: number;
}

export interface DataSegmentDefinition {
  type: 'literal' | 'param';
  value?: number[];
  paramIndex?: number;
  encoding?: string;
}

export interface SeedDefinition {
  type: 'literal' | 'param' | 'account';
  value?: number[];
  paramIndex?: number;
  accountIndex?: number;
}

export interface VerificationResult {
  status: 'verified' | 'unverified' | 'mismatch';
  tier: 'known_program' | 'idl_structural' | 'unverified';
  confidence: number;
  details?: string;
  intentHash?: string;
}

// ---- Anchor IDL types (subset we need) ----

export interface AnchorIdl {
  address: string;
  metadata: { name: string; version: string; spec: string };
  instructions: AnchorInstruction[];
  accounts?: AnchorAccount[];
  types?: AnchorType[];
}

export interface AnchorInstruction {
  name: string;
  discriminator: number[];
  accounts: AnchorAccountMeta[];
  args: AnchorArg[];
}

export interface AnchorAccountMeta {
  name: string;
  writable?: boolean;
  signer?: boolean;
  pda?: { seeds: AnchorSeed[] };
  address?: string;
}

export interface AnchorSeed {
  kind: 'const' | 'arg' | 'account';
  value?: number[];
  path?: string;
}

export interface AnchorArg {
  name: string;
  type: string | { defined?: { name: string }; option?: string; vec?: string; array?: [string, number] };
}

export interface AnchorAccount {
  name: string;
  discriminator: number[];
}

export interface AnchorType {
  name: string;
  type: { kind: string; fields?: any[] };
}

// ---- Wallet info returned by LucidWallet.show() ----

export interface WalletInfo {
  address: string;
  name: string;
  proposalIndex: bigint;
  intentCount: number;
  frozen: boolean;
  bump: number;
}

// ---- Known program types ----

export interface KnownInstruction {
  name: string;
  discriminator: number[];
  accounts: { name: string; writable: boolean; signer: boolean }[];
  args: { name: string; type: ParamDefinition['type'] }[];
}

export interface KnownProgram {
  name: string;
  address: string;
  instructions: KnownInstruction[];
}
