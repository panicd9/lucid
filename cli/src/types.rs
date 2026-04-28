use serde::{Deserialize, Serialize};

/// Intent definition JSON format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentDefinition {
    pub version: u8,
    pub program_id: String,
    pub instruction_name: String,
    pub discriminator: Vec<u8>,
    #[serde(default)]
    pub params: Vec<ParamDef>,
    pub accounts: Vec<AccountDef>,
    pub data_segments: Vec<DataSegmentDef>,
    #[serde(default)]
    pub seeds: Vec<SeedDef>,
    pub template: String,
    pub risk_level: String,
    pub timelock_seconds: u32,
    #[serde(default)]
    pub verification: Option<VerificationInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParamDef {
    pub name: String,
    pub param_type: String,
    #[serde(default)]
    pub constraint_type: String,
    #[serde(default)]
    pub constraint_value: u64,
    #[serde(default)]
    pub display_decimals: u8,
    #[serde(default)]
    pub decimals_param: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountDef {
    pub name: String,
    pub source: String,
    pub writable: bool,
    pub is_signer: bool,
    #[serde(default)]
    pub source_data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataSegmentDef {
    pub segment_type: String,
    #[serde(default)]
    pub data: Option<serde_json::Value>,
    #[serde(default)]
    pub param_index: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedDef {
    pub seed_type: String,
    #[serde(default)]
    pub value: Option<serde_json::Value>,
    #[serde(default)]
    pub param_index: Option<u8>,
    #[serde(default)]
    pub account_index: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub field_path: Option<Vec<FieldPathOp>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub field_len: Option<u8>,
}

/// One step in a SEED_ACCOUNT_FIELD walk plan. The walker starts past the
/// Anchor discriminator (offset 8) and processes ops in order, then reads
/// `field_len` bytes at the final offset.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldPathOp {
    /// "skip_fixed" — advance offset by `size`.
    /// "skip_option" — read 1 byte tag; advance 1; if tag != 0, advance by `size`.
    pub op: String,
    pub size: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationInfo {
    pub tier: u8,
    #[serde(default)]
    pub program_name: Option<String>,
    #[serde(default)]
    pub verified: Option<bool>,
}

/// On-chain Wallet account layout (after 2-byte prefix)
pub const PREFIX_LEN: usize = 2;
pub const WALLET_DATA_LEN: usize = 80;
pub const INTENT_HEADER_LEN: usize = 88;
pub const PROPOSAL_DATA_LEN: usize = 168;

/// Param type constants (matching on-chain)
pub const PARAM_TYPE_ADDRESS: u8 = 0;
pub const PARAM_TYPE_U64: u8 = 1;
pub const PARAM_TYPE_I64: u8 = 2;
pub const PARAM_TYPE_STRING: u8 = 3;
pub const PARAM_TYPE_BOOL: u8 = 4;
pub const PARAM_TYPE_U8: u8 = 5;
pub const PARAM_TYPE_U16: u8 = 6;
pub const PARAM_TYPE_U32: u8 = 7;
pub const PARAM_TYPE_U128: u8 = 8;

/// Account source constants
pub const SOURCE_STATIC: u8 = 0;
pub const SOURCE_PARAM: u8 = 1;
pub const SOURCE_VAULT: u8 = 2;
pub const SOURCE_PDA: u8 = 3;
pub const SOURCE_HAS_ONE: u8 = 4;

/// Data segment type constants
pub const SEGMENT_LITERAL: u8 = 0;
pub const SEGMENT_PARAM: u8 = 1;

/// Seed type constants
pub const SEED_LITERAL: u8 = 0;
pub const SEED_PARAM: u8 = 1;
pub const SEED_ACCOUNT: u8 = 2;
pub const SEED_ACCOUNT_FIELD: u8 = 3;

/// SEED_ACCOUNT_FIELD walk-plan op codes (mirror programs/lucid).
pub const FIELD_OP_SKIP_FIXED: u8 = 0;
pub const FIELD_OP_SKIP_OPTION: u8 = 1;

/// Intent type constants
pub const INTENT_TYPE_ADD: u8 = 0;
pub const INTENT_TYPE_REMOVE: u8 = 1;
pub const INTENT_TYPE_UPDATE: u8 = 2;
pub const INTENT_TYPE_CUSTOM: u8 = 3;

/// Status constants
pub const STATUS_ACTIVE: u8 = 0;
pub const STATUS_APPROVED: u8 = 1;
pub const STATUS_EXECUTED: u8 = 2;
pub const STATUS_CANCELLED: u8 = 3;

/// Discriminator constants
pub const DISC_WALLET: u8 = 1;
pub const DISC_INTENT: u8 = 3;
pub const DISC_PROPOSAL: u8 = 4;

/// Account entry size
pub const ACCOUNT_ENTRY_SIZE: usize = 8;
pub const PARAM_ENTRY_SIZE: usize = 16;
pub const INSTRUCTION_ENTRY_SIZE: usize = 8;
pub const DATA_SEGMENT_ENTRY_SIZE: usize = 6;
pub const SEED_ENTRY_SIZE: usize = 6;

pub fn param_type_from_str(s: &str) -> Option<u8> {
    match s {
        "address" | "publicKey" => Some(PARAM_TYPE_ADDRESS),
        "u64" => Some(PARAM_TYPE_U64),
        "i64" => Some(PARAM_TYPE_I64),
        "string" => Some(PARAM_TYPE_STRING),
        "bool" => Some(PARAM_TYPE_BOOL),
        "u8" => Some(PARAM_TYPE_U8),
        "u16" => Some(PARAM_TYPE_U16),
        "u32" => Some(PARAM_TYPE_U32),
        "u128" => Some(PARAM_TYPE_U128),
        _ => None,
    }
}

pub fn param_type_to_str(t: u8) -> &'static str {
    match t {
        PARAM_TYPE_ADDRESS => "address",
        PARAM_TYPE_U64 => "u64",
        PARAM_TYPE_I64 => "i64",
        PARAM_TYPE_STRING => "string",
        PARAM_TYPE_BOOL => "bool",
        PARAM_TYPE_U8 => "u8",
        PARAM_TYPE_U16 => "u16",
        PARAM_TYPE_U32 => "u32",
        PARAM_TYPE_U128 => "u128",
        _ => "unknown",
    }
}

pub fn param_type_size(t: u8) -> usize {
    match t {
        PARAM_TYPE_ADDRESS => 32,
        PARAM_TYPE_U64 => 8,
        PARAM_TYPE_I64 => 8,
        PARAM_TYPE_STRING => 0, // variable
        PARAM_TYPE_BOOL => 1,
        PARAM_TYPE_U8 => 1,
        PARAM_TYPE_U16 => 2,
        PARAM_TYPE_U32 => 4,
        PARAM_TYPE_U128 => 16,
        _ => 0,
    }
}

pub fn status_to_str(s: u8) -> &'static str {
    match s {
        STATUS_ACTIVE => "Active",
        STATUS_APPROVED => "Approved",
        STATUS_EXECUTED => "Executed",
        STATUS_CANCELLED => "Cancelled",
        _ => "Unknown",
    }
}

pub fn intent_type_to_str(t: u8) -> &'static str {
    match t {
        INTENT_TYPE_ADD => "Add",
        INTENT_TYPE_REMOVE => "Remove",
        INTENT_TYPE_UPDATE => "Update",
        INTENT_TYPE_CUSTOM => "Custom",
        _ => "Unknown",
    }
}

pub fn source_to_str(s: u8) -> &'static str {
    match s {
        SOURCE_STATIC => "static",
        SOURCE_PARAM => "param",
        SOURCE_VAULT => "vault",
        SOURCE_PDA => "pda",
        _ => "unknown",
    }
}
