//! Shank IDL definitions for the Lucid program.
//!
//! This module is only compiled with the `idl` feature and exists solely
//! to generate the program IDL via `shank idl`. It mirrors the real
//! account layouts and instruction signatures but uses Shank derive
//! macros so that Codama can produce typed clients.

use shank::{ShankAccount, ShankInstruction};

// Re-export the program ID so Shank can pick it up.
// TODO: replace with deployed program address.
pinocchio_pubkey::declare_id!("LUC1Dv2v3oMYnoZDgMkwkFo5GXDBrUg7KuRGTMRsbuH");

// ─── Accounts ────────────────────────────────────────────────────────

/// Multisig wallet configuration account.
/// Seeds: ["wallet", name_bytes]
#[derive(ShankAccount)]
pub struct Wallet {
    pub proposal_index: u64,
    pub intent_count: u8,
    pub frozen: u8,
    pub bump: u8,
    pub name_len: u8,
    pub reserved: [u8; 4],
    pub name: [u8; 32],
}

/// Vault PDA that holds SOL/tokens on behalf of a wallet.
/// Seeds: ["vault", wallet]
#[derive(ShankAccount)]
pub struct Vault {
    pub wallet: [u8; 32],
    pub bump: u8,
}

/// Intent template header — defines an allowed action for the wallet.
/// Seeds: ["intent", wallet, intent_index.to_le_bytes()]
/// Variable-length data follows the header (proposers, approvers,
/// param entries, account entries, instruction entries, data segments,
/// seed entries, and byte pool).
#[derive(ShankAccount)]
pub struct IntentHeader {
    pub wallet: [u8; 32],
    pub timelock_seconds: u32,
    pub active_proposal_count: u16,
    pub byte_pool_len: u16,
    pub bump: u8,
    pub intent_index: u8,
    pub intent_type: u8,
    pub approved: u8,
    pub approval_threshold: u8,
    pub cancellation_threshold: u8,
    pub proposer_count: u8,
    pub approver_count: u8,
    pub param_count: u8,
    pub account_count: u8,
    pub instruction_count: u8,
    pub data_segment_count: u8,
    pub seed_count: u8,
    pub reserved: [u8; 3],
}

/// Proposal created against an intent.
/// Seeds: ["proposal", intent, proposal_index.to_le_bytes()]
/// Variable-length params_data follows the header.
#[derive(ShankAccount)]
pub struct Proposal {
    pub wallet: [u8; 32],
    pub intent: [u8; 32],
    pub proposal_index: u64,
    pub proposer: [u8; 32],
    pub approval_bitmap: u16,
    pub cancellation_bitmap: u16,
    pub status: u8,
    pub bump: u8,
    pub pad: [u8; 2],
    pub proposed_at: i64,
    pub approved_at: i64,
    pub rent_refund: [u8; 32],
    pub params_data_len: u16,
    pub reserved: [u8; 6],
}

// ─── Instructions ────────────────────────────────────────────────────

#[derive(ShankInstruction)]
#[repr(u8)]
pub enum LucidInstruction {
    // ── Wallet lifecycle ─────────────────────────────────────────────

    /// Create a new multisig wallet with proposers, approvers,
    /// thresholds, and timelock configuration.
    #[account(0, writable, name = "wallet", desc = "Wallet PDA to create")]
    #[account(1, writable, name = "vault", desc = "Vault PDA to create")]
    #[account(2, writable, name = "meta_intent_add", desc = "Meta-intent for ADD operations")]
    #[account(3, writable, name = "meta_intent_remove", desc = "Meta-intent for REMOVE operations")]
    #[account(4, writable, name = "meta_intent_update", desc = "Meta-intent for UPDATE operations")]
    #[account(5, writable, signer, name = "payer", desc = "Rent payer")]
    #[account(6, name = "system_program", desc = "System program")]
    CreateWallet = 0,

    /// Add a single intent template to the wallet (setup phase only).
    #[account(0, writable, name = "wallet", desc = "Wallet PDA")]
    #[account(1, writable, name = "intent", desc = "Intent PDA to create")]
    #[account(2, writable, signer, name = "payer", desc = "Rent payer")]
    #[account(3, name = "system_program", desc = "System program")]
    AddIntent = 1,

    /// Batch-add up to 10 intent templates (setup phase only).
    #[account(0, writable, name = "wallet", desc = "Wallet PDA")]
    #[account(1, writable, signer, name = "payer", desc = "Rent payer")]
    #[account(2, name = "system_program", desc = "System program")]
    AddIntentsBatch = 2,

    /// Deactivate an intent (setup phase only, requires approver).
    #[account(0, name = "wallet", desc = "Wallet PDA")]
    #[account(1, writable, name = "intent", desc = "Intent PDA to deactivate")]
    #[account(2, signer, name = "authority", desc = "Approver of the intent")]
    DeactivateIntent = 3,

    /// Freeze the wallet configuration permanently.
    #[account(0, writable, name = "wallet", desc = "Wallet PDA")]
    #[account(1, name = "meta_intent", desc = "Any meta-intent PDA (for approver verification)")]
    #[account(2, signer, name = "authority", desc = "Approver")]
    FreezeWallet = 4,

    // ── Proposal flow ────────────────────────────────────────────────

    /// Create a proposal against an intent with Ed25519 signature.
    #[account(0, name = "wallet", desc = "Wallet PDA")]
    #[account(1, writable, name = "intent", desc = "Intent PDA")]
    #[account(2, writable, name = "proposal", desc = "Proposal PDA to create")]
    #[account(3, name = "instructions_sysvar", desc = "Instructions sysvar (for Ed25519 verification)")]
    #[account(4, writable, signer, name = "payer", desc = "Rent payer")]
    #[account(5, name = "system_program", desc = "System program")]
    Propose = 10,

    /// Approve a proposal with Ed25519 signature.
    #[account(0, name = "wallet", desc = "Wallet PDA")]
    #[account(1, name = "intent", desc = "Intent PDA")]
    #[account(2, writable, name = "proposal", desc = "Proposal PDA")]
    #[account(3, name = "instructions_sysvar", desc = "Instructions sysvar (for Ed25519 verification)")]
    Approve = 11,

    /// Cancel a proposal with Ed25519 signature.
    #[account(0, name = "wallet", desc = "Wallet PDA")]
    #[account(1, name = "intent", desc = "Intent PDA")]
    #[account(2, writable, name = "proposal", desc = "Proposal PDA")]
    #[account(3, name = "instructions_sysvar", desc = "Instructions sysvar (for Ed25519 verification)")]
    Cancel = 12,

    // ── Execution ────────────────────────────────────────────────────

    /// Execute an approved proposal after timelock has elapsed.
    #[account(0, name = "wallet", desc = "Wallet PDA")]
    #[account(1, writable, name = "vault", desc = "Vault PDA (CPI signer)")]
    #[account(2, writable, name = "intent", desc = "Intent PDA")]
    #[account(3, writable, name = "proposal", desc = "Proposal PDA")]
    #[account(4, name = "event_authority", desc = "Event authority PDA")]
    #[account(5, name = "program", desc = "Lucid program (self, for CPI)")]
    Execute = 20,

    // ── Cleanup ──────────────────────────────────────────────────────

    /// Close a completed/cancelled proposal and refund rent.
    #[account(0, writable, name = "proposal", desc = "Proposal PDA to close")]
    #[account(1, writable, name = "intent", desc = "Intent PDA (decrement active count)")]
    #[account(2, writable, name = "rent_refund", desc = "Recipient of rent refund")]
    Cleanup = 30,

    // ── Events ───────────────────────────────────────────────────────

    /// Emit an Anchor-compatible event (internal CPI only).
    #[account(0, signer, name = "event_authority", desc = "Event authority PDA (must be signer)")]
    EmitEvent = 228,
}
