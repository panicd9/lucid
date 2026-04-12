use pinocchio::error::ProgramError;

use crate::state::constants::*;
use crate::state::errors::*;

// ─── Wallet ───────────────────────────────────────────────────────────
/// Seeds: ["wallet", name_bytes]
/// Layout: [disc:1 | version:1 | data...]
#[repr(C)]
pub struct Wallet {
    pub proposal_index: u64,
    pub intent_count: u8,
    pub frozen: u8,
    pub bump: u8,
    pub name_len: u8,
    pub _reserved: [u8; 4],
    pub name: [u8; 32],
}

assert_no_padding!(Wallet, 48);

impl Wallet {
    pub const DATA_LEN: usize = 48;
    pub const LEN: usize = PREFIX_LEN + Self::DATA_LEN;
    pub const DISCRIMINATOR: u8 = DISC_WALLET;

    pub fn from_bytes(data: &[u8]) -> Result<&Self, ProgramError> {
        validate_discriminator!(data, Self::DISCRIMINATOR);
        require_account_len!(data, Self::LEN);
        Ok(unsafe { &*(data[PREFIX_LEN..].as_ptr() as *const Self) })
    }

    pub fn from_bytes_mut(data: &mut [u8]) -> Result<&mut Self, ProgramError> {
        validate_discriminator!(data, Self::DISCRIMINATOR);
        require_account_len!(data, Self::LEN);
        Ok(unsafe { &mut *(data[PREFIX_LEN..].as_mut_ptr() as *mut Self) })
    }

    pub fn name_bytes(&self) -> &[u8] {
        &self.name[..self.name_len as usize]
    }
}

// ─── Vault ────────────────────────────────────────────────────────────
/// Seeds: ["vault", wallet]
#[repr(C)]
pub struct Vault {
    pub wallet: [u8; 32],
    pub bump: u8,
}

assert_no_padding!(Vault, 33);

impl Vault {
    pub const DATA_LEN: usize = 33;
    pub const LEN: usize = PREFIX_LEN + Self::DATA_LEN;
    pub const DISCRIMINATOR: u8 = DISC_VAULT;

    pub fn from_bytes(data: &[u8]) -> Result<&Self, ProgramError> {
        validate_discriminator!(data, Self::DISCRIMINATOR);
        require_account_len!(data, Self::LEN);
        Ok(unsafe { &*(data[PREFIX_LEN..].as_ptr() as *const Self) })
    }

    pub fn from_bytes_mut(data: &mut [u8]) -> Result<&mut Self, ProgramError> {
        validate_discriminator!(data, Self::DISCRIMINATOR);
        require_account_len!(data, Self::LEN);
        Ok(unsafe { &mut *(data[PREFIX_LEN..].as_mut_ptr() as *mut Self) })
    }
}

// ─── IntentHeader ─────────────────────────────────────────────────────
/// Seeds: ["intent", wallet, index.to_le_bytes()]
/// Fixed header followed by variable-length byte_pool data
#[repr(C)]
pub struct IntentHeader {
    pub wallet: [u8; 32],
    pub target_program: [u8; 32],
    pub timelock_seconds: u32,         // 4-byte aligned
    pub active_proposal_count: u16,    // 2-byte aligned
    pub byte_pool_len: u16,            // 2-byte aligned
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
    pub _reserved: [u8; 3],
}

assert_no_padding!(IntentHeader, 88);

impl IntentHeader {
    pub const DATA_LEN: usize = 88;
    pub const HEADER_LEN: usize = PREFIX_LEN + Self::DATA_LEN;
    pub const DISCRIMINATOR: u8 = DISC_INTENT;

    pub fn from_bytes(data: &[u8]) -> Result<&Self, ProgramError> {
        validate_discriminator!(data, Self::DISCRIMINATOR);
        require_account_len!(data, Self::HEADER_LEN);
        Ok(unsafe { &*(data[PREFIX_LEN..].as_ptr() as *const Self) })
    }

    pub fn from_bytes_mut(data: &mut [u8]) -> Result<&mut Self, ProgramError> {
        validate_discriminator!(data, Self::DISCRIMINATOR);
        require_account_len!(data, Self::HEADER_LEN);
        Ok(unsafe { &mut *(data[PREFIX_LEN..].as_mut_ptr() as *mut Self) })
    }

    /// Total account size including header, all arrays, and byte_pool
    pub fn total_account_len(&self) -> usize {
        Self::HEADER_LEN
            + (self.proposer_count as usize * 32)
            + (self.approver_count as usize * 32)
            + (self.param_count as usize * ParamEntry::SIZE)
            + (self.account_count as usize * AccountEntry::SIZE)
            + (self.instruction_count as usize * InstructionEntry::SIZE)
            + (self.data_segment_count as usize * DataSegmentEntry::SIZE)
            + (self.seed_count as usize * SeedEntry::SIZE)
            + self.byte_pool_len as usize
    }

    // ── Offset helpers for navigating the byte_pool layout ──

    pub fn proposers_offset(&self) -> usize {
        Self::HEADER_LEN
    }

    pub fn approvers_offset(&self) -> usize {
        self.proposers_offset() + (self.proposer_count as usize * 32)
    }

    pub fn params_offset(&self) -> usize {
        self.approvers_offset() + (self.approver_count as usize * 32)
    }

    pub fn accounts_offset(&self) -> usize {
        self.params_offset() + (self.param_count as usize * ParamEntry::SIZE)
    }

    pub fn instructions_offset(&self) -> usize {
        self.accounts_offset() + (self.account_count as usize * AccountEntry::SIZE)
    }

    pub fn data_segments_offset(&self) -> usize {
        self.instructions_offset() + (self.instruction_count as usize * InstructionEntry::SIZE)
    }

    pub fn seeds_offset(&self) -> usize {
        self.data_segments_offset() + (self.data_segment_count as usize * DataSegmentEntry::SIZE)
    }

    pub fn byte_pool_offset(&self) -> usize {
        self.seeds_offset() + (self.seed_count as usize * SeedEntry::SIZE)
    }
}

// ─── ParamEntry ───────────────────────────────────────────────────────
#[repr(C)]
pub struct ParamEntry {
    pub constraint_value: u64,         // 8-byte aligned first
    pub name_offset: u16,
    pub name_len: u16,
    pub param_type: u8,
    pub constraint_type: u8,
    pub _pad: [u8; 2],
}

assert_no_padding!(ParamEntry, 16);

impl ParamEntry {
    pub const SIZE: usize = 16;
}

// ─── AccountEntry ─────────────────────────────────────────────────────
#[repr(C)]
pub struct AccountEntry {
    pub source: u8,
    pub writable: u8,
    pub is_signer: u8,
    pub _pad: u8,
    pub source_data: [u8; 4],
}

assert_no_padding!(AccountEntry, 8);

impl AccountEntry {
    pub const SIZE: usize = 8;
}

// ─── InstructionEntry ─────────────────────────────────────────────────
#[repr(C)]
pub struct InstructionEntry {
    pub program_account_index: u8,
    pub account_start_index: u8,
    pub account_count: u8,
    pub data_segment_start_index: u8,
    pub data_segment_count: u8,
    pub _pad: [u8; 3],
}

assert_no_padding!(InstructionEntry, 8);

impl InstructionEntry {
    pub const SIZE: usize = 8;
}

// ─── DataSegmentEntry ─────────────────────────────────────────────────
#[repr(C)]
pub struct DataSegmentEntry {
    pub segment_type: u8,
    pub _pad: u8,
    pub segment_data: [u8; 4],
}

assert_no_padding!(DataSegmentEntry, 6);

impl DataSegmentEntry {
    pub const SIZE: usize = 6;
}

// ─── SeedEntry ────────────────────────────────────────────────────────
#[repr(C)]
pub struct SeedEntry {
    pub seed_type: u8,
    pub _pad: u8,
    pub seed_data: [u8; 4],
}

assert_no_padding!(SeedEntry, 6);

impl SeedEntry {
    pub const SIZE: usize = 6;
}

// ─── Proposal ─────────────────────────────────────────────────────────
/// Seeds: ["proposal", intent, proposal_index.to_le_bytes()]
#[repr(C)]
pub struct Proposal {
    pub wallet: [u8; 32],
    pub intent: [u8; 32],
    pub proposal_index: u64,
    pub proposer: [u8; 32],
    pub approval_bitmap: u16,
    pub cancellation_bitmap: u16,
    pub status: u8,
    pub bump: u8,
    pub _pad: [u8; 2],
    pub proposed_at: i64,
    pub approved_at: i64,
    pub rent_refund: [u8; 32],
    pub params_data_len: u16,
    pub _reserved: [u8; 6],
}

assert_no_padding!(Proposal, 168);

impl Proposal {
    pub const DATA_LEN: usize = 168;
    pub const HEADER_LEN: usize = PREFIX_LEN + Self::DATA_LEN;
    pub const DISCRIMINATOR: u8 = DISC_PROPOSAL;

    pub fn from_bytes(data: &[u8]) -> Result<&Self, ProgramError> {
        validate_discriminator!(data, Self::DISCRIMINATOR);
        require_account_len!(data, Self::HEADER_LEN);
        Ok(unsafe { &*(data[PREFIX_LEN..].as_ptr() as *const Self) })
    }

    pub fn from_bytes_mut(data: &mut [u8]) -> Result<&mut Self, ProgramError> {
        validate_discriminator!(data, Self::DISCRIMINATOR);
        require_account_len!(data, Self::HEADER_LEN);
        Ok(unsafe { &mut *(data[PREFIX_LEN..].as_mut_ptr() as *mut Self) })
    }

    /// Total account size including params_data
    pub fn total_len(&self) -> usize {
        Self::HEADER_LEN + self.params_data_len as usize
    }
}

/// Validate that an IntentHeader has sane values after being written from user data
pub fn validate_intent_header(intent: &IntentHeader, account_len: usize) -> Result<(), ProgramError> {
    if intent.proposer_count == 0 || intent.proposer_count as usize > MAX_SIGNERS {
        return Err(ProgramError::Custom(ERR_TOO_MANY_SIGNERS));
    }
    if intent.approver_count == 0 || intent.approver_count as usize > MAX_SIGNERS {
        return Err(ProgramError::Custom(ERR_INVALID_THRESHOLD));
    }
    if intent.approval_threshold == 0 || intent.approval_threshold > intent.approver_count {
        return Err(ProgramError::Custom(ERR_INVALID_THRESHOLD));
    }
    if intent.cancellation_threshold == 0 || intent.cancellation_threshold > intent.approver_count {
        return Err(ProgramError::Custom(ERR_INVALID_THRESHOLD));
    }
    if intent.total_account_len() > account_len {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}
