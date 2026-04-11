use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::error::ProgramError;
use pinocchio::sysvars::clock::Clock;
use pinocchio::sysvars::Sysvar;
use pinocchio::sysvars::instructions::Instructions;

use crate::state::accounts::*;
use crate::state::byte_pool::*;
use crate::state::constants::*;
use crate::state::errors::*;
use crate::state::message::*;

/// Parsed Ed25519 instruction data
pub struct Ed25519Data<'a> {
    pub pubkey: [u8; 32],
    pub message: &'a [u8],
}

/// Parse the message from the ed25519 instruction preceding the current one
fn load_ed25519_data(instructions_sysvar: &AccountView) -> Result<Ed25519DataOwned, ProgramError> {
    // Validate that this is the real instructions sysvar
    let sysvar_addr = Address::new_from_array(INSTRUCTIONS_SYSVAR_ID);
    if instructions_sysvar.address() != &sysvar_addr {
        return Err(ProgramError::Custom(ERR_INVALID_ED25519_INSTRUCTION));
    }

    let instructions = Instructions::try_from(instructions_sysvar)?;

    // Read the current instruction index from the sysvar data and load
    // the ed25519 instruction immediately before it
    let sysvar_data = instructions_sysvar.try_borrow()?;
    let data_len = sysvar_data.len();
    if data_len < 2 {
        return Err(ProgramError::Custom(ERR_INVALID_ED25519_INSTRUCTION));
    }
    let current_index = u16::from_le_bytes([
        sysvar_data[data_len - 2],
        sysvar_data[data_len - 1],
    ]) as usize;
    if current_index == 0 {
        return Err(ProgramError::Custom(ERR_INVALID_ED25519_INSTRUCTION));
    }
    drop(sysvar_data);

    let ed25519_index = current_index - 1;
    let ix = instructions.load_instruction_at(ed25519_index)
        .map_err(|_| ProgramError::Custom(ERR_INVALID_ED25519_INSTRUCTION))?;

    let program_id = ix.get_program_id();
    let ed25519_addr = Address::new_from_array(ED25519_PROGRAM_ID);
    if program_id != &ed25519_addr {
        return Err(ProgramError::Custom(ERR_INVALID_ED25519_INSTRUCTION));
    }

    let data = ix.get_instruction_data();
    if data.len() < 16 + 32 + 64 {
        return Err(ProgramError::Custom(ERR_INVALID_ED25519_INSTRUCTION));
    }

    if data[0] != 1 {
        return Err(ProgramError::Custom(ERR_INVALID_ED25519_INSTRUCTION));
    }

    let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let message_data_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_data_size = u16::from_le_bytes([data[12], data[13]]) as usize;

    if pubkey_offset + 32 > data.len() || message_data_offset + message_data_size > data.len() {
        return Err(ProgramError::Custom(ERR_INVALID_ED25519_INSTRUCTION));
    }

    let mut pubkey = [0u8; 32];
    pubkey.copy_from_slice(&data[pubkey_offset..pubkey_offset + 32]);

    let mut message = [0u8; 512];
    let msg_len = message_data_size.min(512);
    message[..msg_len].copy_from_slice(&data[message_data_offset..message_data_offset + msg_len]);

    Ok(Ed25519DataOwned { pubkey, message, message_len: msg_len })
}

/// Owned version of Ed25519Data that doesn't borrow from the sysvar
struct Ed25519DataOwned {
    pub pubkey: [u8; 32],
    pub message: [u8; 512],
    pub message_len: usize,
}

/// Parse expiry timestamp from message body and validate against current clock
fn validate_expiry<'a>(body: &'a [u8], clock: &Clock) -> Result<&'a [u8], ProgramError> {
    let expiry_str = parse_expiry_from_body(body)?;
    // Parse "YYYY-MM-DD HH:MM:SS" into a unix timestamp approximation
    // We validate that the signature hasn't expired
    let expiry_ts = parse_iso8601_to_unix(expiry_str)?;
    if clock.unix_timestamp > expiry_ts {
        return Err(ProgramError::Custom(ERR_EXPIRED));
    }
    Ok(expiry_str)
}

/// Rough ISO8601 "YYYY-MM-DD HH:MM:SS" → unix timestamp parser (no leap seconds)
fn parse_iso8601_to_unix(s: &[u8]) -> Result<i64, ProgramError> {
    if s.len() != 19 {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }
    let year = parse_decimal(&s[0..4])? as i64;
    let month = parse_decimal(&s[5..7])? as i64;
    let day = parse_decimal(&s[8..10])? as i64;
    let hour = parse_decimal(&s[11..13])? as i64;
    let min = parse_decimal(&s[14..16])? as i64;
    let sec = parse_decimal(&s[17..19])? as i64;

    // Days from months (approximate, handles most cases)
    let days_in_months: [i64; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut total_days: i64 = 0;

    // Years since epoch (1970)
    for y in 1970..year {
        total_days += if is_leap(y) { 366 } else { 365 };
    }
    for m in 1..month {
        total_days += days_in_months[(m - 1) as usize];
        if m == 2 && is_leap(year) {
            total_days += 1;
        }
    }
    total_days += day - 1;

    Ok(total_days * 86400 + hour * 3600 + min * 60 + sec)
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn parse_decimal(s: &[u8]) -> Result<u32, ProgramError> {
    let mut val: u32 = 0;
    for &b in s {
        if b < b'0' || b > b'9' {
            return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
        }
        val = val * 10 + (b - b'0') as u32;
    }
    Ok(val)
}

/// Extract and verify Ed25519 signature for propose
pub fn extract_and_verify_ed25519_for_propose(
    instructions_sysvar: &AccountView,
    intent_data: &[u8],
    intent: &IntentHeader,
    wallet_name: &[u8],
    proposal_index: u64,
    params_data: &[u8],
) -> Result<([u8; 32], u8), ProgramError> {
    let clock = Clock::get()?;
    let ed25519_ix = load_ed25519_data(instructions_sysvar)?;
    let proposer_index = find_in_proposers(intent_data, intent, &ed25519_ix.pubkey)?;

    let message = &ed25519_ix.message[..ed25519_ix.message_len];
    let body = extract_message_body(message)?;
    let expiry_str = validate_expiry(body, &clock)?;

    let (expected, expected_len) = build_message(
        expiry_str, b"propose", wallet_name,
        proposal_index, intent, intent_data, params_data,
    )?;

    if expected_len != ed25519_ix.message_len || expected[..expected_len] != *message {
        return Err(ProgramError::Custom(ERR_MESSAGE_MISMATCH));
    }

    Ok((ed25519_ix.pubkey, proposer_index))
}

/// Extract and verify Ed25519 signature for approve/cancel
pub fn extract_and_verify_ed25519(
    instructions_sysvar: &AccountView,
    intent_data: &[u8],
    intent: &IntentHeader,
    proposal: &Proposal,
    proposal_data: &[u8],
    wallet_name: &[u8],
    action: &[u8],
) -> Result<([u8; 32], u8), ProgramError> {
    let clock = Clock::get()?;
    let ed25519_ix = load_ed25519_data(instructions_sysvar)?;
    let approver_index = find_in_approvers(intent_data, intent, &ed25519_ix.pubkey)?;

    let message = &ed25519_ix.message[..ed25519_ix.message_len];
    let body = extract_message_body(message)?;
    let expiry_str = validate_expiry(body, &clock)?;

    let params = read_params_data(proposal_data, proposal)?;

    let (expected, expected_len) = build_message(
        expiry_str, action, wallet_name,
        proposal.proposal_index, intent, intent_data, params,
    )?;

    if expected_len != ed25519_ix.message_len || expected[..expected_len] != *message {
        return Err(ProgramError::Custom(ERR_MESSAGE_MISMATCH));
    }

    Ok((ed25519_ix.pubkey, approver_index))
}

fn extract_message_body(message: &[u8]) -> Result<&[u8], ProgramError> {
    if message.len() < OFFCHAIN_HEADER_LEN {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }
    if &message[..16] != OFFCHAIN_HEADER_PREFIX {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }
    Ok(&message[OFFCHAIN_HEADER_LEN..])
}
