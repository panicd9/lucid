/// Program ID — placeholder, will be replaced after first deploy
pub const PROGRAM_ID: [u8; 32] = [0; 32]; // TODO: set after deploy

/// Account discriminators
pub const DISC_WALLET: u8 = 1;
pub const DISC_VAULT: u8 = 2;
pub const DISC_INTENT: u8 = 3;
pub const DISC_PROPOSAL: u8 = 4;

/// Version
pub const ACCOUNT_VERSION: u8 = 1;

/// Intent type constants
pub const INTENT_TYPE_ADD: u8 = 0;
pub const INTENT_TYPE_REMOVE: u8 = 1;
pub const INTENT_TYPE_UPDATE: u8 = 2;
pub const INTENT_TYPE_CUSTOM: u8 = 3;

/// Proposal status constants
pub const STATUS_ACTIVE: u8 = 0;
pub const STATUS_APPROVED: u8 = 1;
pub const STATUS_EXECUTED: u8 = 2;
pub const STATUS_CANCELLED: u8 = 3;
pub const STATUS_EXPIRED: u8 = 4;

/// Account source type constants (for AccountEntry)
pub const SOURCE_STATIC: u8 = 0;
pub const SOURCE_PARAM: u8 = 1;
pub const SOURCE_VAULT: u8 = 2;
pub const SOURCE_PDA: u8 = 3;
pub const SOURCE_HAS_ONE: u8 = 4;

/// Param type constants
pub const PARAM_TYPE_ADDRESS: u8 = 0;
pub const PARAM_TYPE_U64: u8 = 1;
pub const PARAM_TYPE_I64: u8 = 2;
pub const PARAM_TYPE_STRING: u8 = 3;
pub const PARAM_TYPE_BOOL: u8 = 4;
pub const PARAM_TYPE_U8: u8 = 5;
pub const PARAM_TYPE_U16: u8 = 6;
pub const PARAM_TYPE_U32: u8 = 7;
pub const PARAM_TYPE_U128: u8 = 8;

/// Constraint type constants
pub const CONSTRAINT_NONE: u8 = 0;
pub const CONSTRAINT_LESS_THAN_U64: u8 = 1;
pub const CONSTRAINT_GREATER_THAN_U64: u8 = 2;

/// Data segment type constants
pub const SEGMENT_LITERAL: u8 = 0;
pub const SEGMENT_PARAM: u8 = 1;

/// Seed type constants
pub const SEED_LITERAL: u8 = 0;
pub const SEED_PARAM: u8 = 1;
pub const SEED_ACCOUNT: u8 = 2;

/// Limits
pub const MAX_NAME_LEN: usize = 32;
pub const MAX_SIGNERS: usize = 16;
pub const MAX_SEEDS: usize = 16;
pub const MAX_BATCH_INTENTS: usize = 10;
pub const MAX_PARAMS_DATA_LEN: usize = 512;
pub const MAX_CPI_ACCOUNTS: usize = 16;
pub const MAX_CPI_DATA_LEN: usize = 512;

/// Prefix bytes for PDA derivation
pub const WALLET_SEED: &[u8] = b"wallet";
pub const VAULT_SEED: &[u8] = b"vault";
pub const INTENT_SEED: &[u8] = b"intent";
pub const PROPOSAL_SEED: &[u8] = b"proposal";
pub const EVENT_AUTHORITY_SEED: &[u8] = b"event_authority";

/// Ed25519 program ID (Ed25519SigVerify111111111111111111111111111)
pub const ED25519_PROGRAM_ID: [u8; 32] = [
    0x03, 0x7d, 0x46, 0xd6, 0x7c, 0x93, 0xfb, 0xbe,
    0x12, 0xf9, 0x42, 0x8f, 0x83, 0x8d, 0x40, 0xff,
    0x05, 0x70, 0x74, 0x49, 0x27, 0xf4, 0x8a, 0x64,
    0xfc, 0xca, 0x70, 0x44, 0x80, 0x00, 0x00, 0x00,
];

/// Instructions sysvar ID (Sysvar1nstructions1111111111111111111111111)
pub const INSTRUCTIONS_SYSVAR_ID: [u8; 32] = [
    0x06, 0xa7, 0xd5, 0x17, 0x18, 0x7b, 0xd1, 0x66,
    0x35, 0xda, 0xd4, 0x04, 0x55, 0xfd, 0xc2, 0xc0,
    0xc1, 0x24, 0xc6, 0x8f, 0x21, 0x56, 0x75, 0xa5,
    0xdb, 0xba, 0xcb, 0x5f, 0x08, 0x00, 0x00, 0x00,
];

/// Solana offchain message header (20 bytes)
/// \xffsolana offchain (16) + version u8 (0) + format u8 (0 = ASCII) + length u16 LE
pub const OFFCHAIN_HEADER_PREFIX: &[u8] = b"\xffsolana offchain";
pub const OFFCHAIN_HEADER_LEN: usize = 20; // 16 prefix + 1 version + 1 format + 2 length

/// Event tag (Anchor-compatible)
pub const EVENT_IX_TAG: u64 = 0x1d9acb512ea545e4;
pub const EVENT_IX_TAG_LE: [u8; 8] = EVENT_IX_TAG.to_le_bytes();

/// Event discriminator for EmitEvent instruction
pub const DISC_EMIT_EVENT: u8 = 228;

/// Event IDs
pub const EVENT_ID_EXECUTION_RECEIPT: u8 = 0;

/// Default timelock for meta-intents (24 hours)
pub const DEFAULT_META_TIMELOCK: u32 = 86400;

/// Disc + version prefix length
pub const PREFIX_LEN: usize = 2;
