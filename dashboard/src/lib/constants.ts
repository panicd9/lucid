import { PublicKey } from '@solana/web3.js';

// Program ID — update after deploy
export const PROGRAM_ID = new PublicKey('LUC1Dv2v3oMYnoZDgMkwkFo5GXDBrUg7KuRGTMRsbuH');

// PDA Seeds
export const WALLET_SEED = Buffer.from('wallet');
export const VAULT_SEED = Buffer.from('vault');
export const INTENT_SEED = Buffer.from('intent');
export const PROPOSAL_SEED = Buffer.from('proposal');

// Discriminators
export const DISC_WALLET = 1;
export const DISC_VAULT = 2;
export const DISC_INTENT = 3;
export const DISC_PROPOSAL = 4;

// Prefix length (disc + version)
export const PREFIX_LEN = 2;

// Struct sizes
export const WALLET_DATA_LEN = 48;
export const WALLET_LEN = PREFIX_LEN + WALLET_DATA_LEN;
export const INTENT_HEADER_LEN = PREFIX_LEN + 56;
export const PROPOSAL_HEADER_LEN = PREFIX_LEN + 168;

// Entry sizes
export const PARAM_ENTRY_SIZE = 16;
export const ACCOUNT_ENTRY_SIZE = 8;
export const INSTRUCTION_ENTRY_SIZE = 8;
export const DATA_SEGMENT_ENTRY_SIZE = 6;
export const SEED_ENTRY_SIZE = 6;

// Intent types
export const INTENT_TYPE_ADD = 0;
export const INTENT_TYPE_REMOVE = 1;
export const INTENT_TYPE_UPDATE = 2;
export const INTENT_TYPE_CUSTOM = 3;

export const INTENT_TYPE_LABELS: Record<number, string> = {
  [INTENT_TYPE_ADD]: 'Add',
  [INTENT_TYPE_REMOVE]: 'Remove',
  [INTENT_TYPE_UPDATE]: 'Update',
  [INTENT_TYPE_CUSTOM]: 'Custom',
};

// Proposal statuses
export const STATUS_ACTIVE = 0;
export const STATUS_APPROVED = 1;
export const STATUS_EXECUTED = 2;
export const STATUS_CANCELLED = 3;
export const STATUS_EXPIRED = 4;

export const STATUS_LABELS: Record<number, string> = {
  [STATUS_ACTIVE]: 'Active',
  [STATUS_APPROVED]: 'Approved',
  [STATUS_EXECUTED]: 'Executed',
  [STATUS_CANCELLED]: 'Cancelled',
  [STATUS_EXPIRED]: 'Expired',
};

// Param types
export const PARAM_TYPE_ADDRESS = 0;
export const PARAM_TYPE_U64 = 1;
export const PARAM_TYPE_I64 = 2;
export const PARAM_TYPE_STRING = 3;
export const PARAM_TYPE_BOOL = 4;
export const PARAM_TYPE_U8 = 5;
export const PARAM_TYPE_U16 = 6;
export const PARAM_TYPE_U32 = 7;
export const PARAM_TYPE_U128 = 8;

export const PARAM_TYPE_LABELS: Record<number, string> = {
  [PARAM_TYPE_ADDRESS]: 'Address',
  [PARAM_TYPE_U64]: 'u64',
  [PARAM_TYPE_I64]: 'i64',
  [PARAM_TYPE_STRING]: 'String',
  [PARAM_TYPE_BOOL]: 'Bool',
  [PARAM_TYPE_U8]: 'u8',
  [PARAM_TYPE_U16]: 'u16',
  [PARAM_TYPE_U32]: 'u32',
  [PARAM_TYPE_U128]: 'u128',
};

// Constraint types
export const CONSTRAINT_NONE = 0;
export const CONSTRAINT_MAX = 1;
export const CONSTRAINT_EXACT = 2;

export const CONSTRAINT_LABELS: Record<number, string> = {
  [CONSTRAINT_NONE]: 'None',
  [CONSTRAINT_MAX]: 'Max',
  [CONSTRAINT_EXACT]: 'Exact',
};

// Account source types
export const SOURCE_STATIC = 0;
export const SOURCE_PARAM = 1;
export const SOURCE_VAULT = 2;
export const SOURCE_PDA = 3;
export const SOURCE_HAS_ONE = 4;

export const SOURCE_LABELS: Record<number, string> = {
  [SOURCE_STATIC]: 'Static',
  [SOURCE_PARAM]: 'Param',
  [SOURCE_VAULT]: 'Vault',
  [SOURCE_PDA]: 'PDA',
  [SOURCE_HAS_ONE]: 'Has One',
};

// Risk levels (for display, mapped from intent metadata)
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

// RPC endpoints
export const RPC_ENDPOINTS: Record<string, string> = {
  devnet: 'https://api.devnet.solana.com',
  mainnet: 'https://api.mainnet-beta.solana.com',
};

// Demo wallets for home page
export const DEMO_WALLETS = [
  {
    name: 'treasury',
    description: 'Demo treasury multisig with 2-of-3 approval',
  },
  {
    name: 'protocol',
    description: 'Protocol governance wallet',
  },
];
