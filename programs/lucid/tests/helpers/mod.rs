pub mod pda;
pub mod instructions;
pub mod ed25519;
pub mod intent;
pub mod setup;

use solana_address::Address;

pub fn program_id() -> Address {
    lucid_client::programs::LUCID_ID
}

// Re-export every on-chain constant. Tests must agree with the program
// byte-for-byte; redeclaring locally invites drift.
#[allow(unused_imports)]
pub use lucid::state::constants::*;

/// Struct sizes — used by tests for raw byte slicing into account data.
pub const WALLET_DATA_LEN: usize = 80;
pub const WALLET_LEN: usize = PREFIX_LEN + WALLET_DATA_LEN;
pub const VAULT_DATA_LEN: usize = 33;
pub const VAULT_LEN: usize = PREFIX_LEN + VAULT_DATA_LEN;
pub const INTENT_HEADER_LEN: usize = lucid::state::accounts::IntentHeader::HEADER_LEN;
pub const PROPOSAL_HEADER_LEN: usize = lucid::state::accounts::Proposal::HEADER_LEN;

pub const PARAM_ENTRY_SIZE: usize = 16;
pub const ACCOUNT_ENTRY_SIZE: usize = 8;
pub const INSTRUCTION_ENTRY_SIZE: usize = 8;
pub const DATA_SEGMENT_ENTRY_SIZE: usize = 6;
pub const SEED_ENTRY_SIZE: usize = 6;
