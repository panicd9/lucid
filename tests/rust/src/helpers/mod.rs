pub mod pda;
pub mod instructions;
pub mod ed25519;
pub mod intent;
pub mod setup;

use solana_address::Address;

pub fn program_id() -> Address {
    lucid_client::programs::LUCID_ID
}

/// Account discriminators (must match on-chain constants)
pub const DISC_WALLET: u8 = 1;
pub const DISC_VAULT: u8 = 2;
pub const DISC_INTENT: u8 = 3;
pub const DISC_PROPOSAL: u8 = 4;
pub const ACCOUNT_VERSION: u8 = 1;
pub const PREFIX_LEN: usize = 2;

/// Intent types
pub const INTENT_TYPE_ADD: u8 = 0;
pub const INTENT_TYPE_REMOVE: u8 = 1;
pub const INTENT_TYPE_UPDATE: u8 = 2;
pub const INTENT_TYPE_CUSTOM: u8 = 3;

/// Proposal statuses
pub const STATUS_ACTIVE: u8 = 0;
pub const STATUS_APPROVED: u8 = 1;
pub const STATUS_EXECUTED: u8 = 2;
pub const STATUS_CANCELLED: u8 = 3;

/// Param types
pub const PARAM_TYPE_ADDRESS: u8 = 0;
pub const PARAM_TYPE_U64: u8 = 1;
pub const PARAM_TYPE_I64: u8 = 2;
pub const PARAM_TYPE_STRING: u8 = 3;
pub const PARAM_TYPE_BOOL: u8 = 4;
pub const PARAM_TYPE_U8: u8 = 5;
pub const PARAM_TYPE_U16: u8 = 6;
pub const PARAM_TYPE_U32: u8 = 7;
pub const PARAM_TYPE_U128: u8 = 8;

/// Account source types
pub const SOURCE_STATIC: u8 = 0;
pub const SOURCE_PARAM: u8 = 1;
pub const SOURCE_VAULT: u8 = 2;

/// Data segment types
pub const SEGMENT_LITERAL: u8 = 0;
pub const SEGMENT_PARAM: u8 = 1;

/// Offchain message constants
pub const OFFCHAIN_HEADER_PREFIX: &[u8] = b"\xffsolana offchain";
pub const OFFCHAIN_HEADER_LEN: usize = 20;

/// Struct sizes (must match on-chain)
pub const WALLET_DATA_LEN: usize = 80;
pub const WALLET_LEN: usize = PREFIX_LEN + WALLET_DATA_LEN;
pub const VAULT_DATA_LEN: usize = 33;
pub const VAULT_LEN: usize = PREFIX_LEN + VAULT_DATA_LEN;
pub const INTENT_HEADER_LEN: usize = PREFIX_LEN + 88;
pub const PROPOSAL_HEADER_LEN: usize = PREFIX_LEN + 168;

pub const PARAM_ENTRY_SIZE: usize = 16;
pub const ACCOUNT_ENTRY_SIZE: usize = 8;
pub const INSTRUCTION_ENTRY_SIZE: usize = 8;
pub const DATA_SEGMENT_ENTRY_SIZE: usize = 6;
pub const SEED_ENTRY_SIZE: usize = 6;
