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

    // SignatureOffsets layout (Solana ed25519 precompile):
    //   u16 signature_offset           data[2..4]
    //   u16 signature_instruction_idx  data[4..6]
    //   u16 public_key_offset          data[6..8]
    //   u16 public_key_instruction_idx data[8..10]
    //   u16 message_data_offset        data[10..12]
    //   u16 message_data_size          data[12..14]
    //   u16 message_instruction_idx    data[14..16]
    //
    // When any *_instruction_idx is not 0xFFFF, the precompile reads the
    // corresponding bytes from a sibling instruction's data, but this code
    // reads pubkey/message from the precompile's own data. Allowing the two
    // to point at different bytes lets an attacker make the precompile
    // verify one (sig, pk, msg) triple while we read a forged pubkey and
    // message stuffed into the precompile's own data — full signer forgery.
    // Require self-referencing offsets only.
    let sig_ix_idx = u16::from_le_bytes([data[4], data[5]]);
    let pk_ix_idx = u16::from_le_bytes([data[8], data[9]]);
    let msg_ix_idx = u16::from_le_bytes([data[14], data[15]]);
    if sig_ix_idx != u16::MAX || pk_ix_idx != u16::MAX || msg_ix_idx != u16::MAX {
        return Err(ProgramError::Custom(ERR_INVALID_ED25519_INSTRUCTION));
    }

    let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let message_data_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_data_size = u16::from_le_bytes([data[12], data[13]]) as usize;

    if pubkey_offset + 32 > data.len() || message_data_offset + message_data_size > data.len() {
        return Err(ProgramError::Custom(ERR_INVALID_ED25519_INSTRUCTION));
    }

    // Defense-in-depth: reject before the silent .min(512) truncation below.
    // The signer signed `message_data_size` bytes; if we silently truncated and
    // compared only the prefix, trailing bytes the signer attested to would be
    // ignored. With a 512-byte cap on legitimate bodies (build_message buf size),
    // any larger message is definitionally invalid and shouldn't be accepted.
    if message_data_size > 512 {
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
    // Parse "DD Mon YYYY HH:MM:SS" into a unix timestamp
    let expiry_ts = parse_timestamp_to_unix(expiry_str)?;
    if clock.unix_timestamp > expiry_ts {
        return Err(ProgramError::Custom(ERR_EXPIRED));
    }
    Ok(expiry_str)
}

/// Parse "DD Mon YYYY HH:MM:SS" (20 chars) → unix timestamp (no leap seconds)
fn parse_timestamp_to_unix(s: &[u8]) -> Result<i64, ProgramError> {
    if s.len() != 20 {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }
    let day = parse_decimal(&s[0..2])? as i64;
    let month = parse_month_name(&s[3..6])? as i64;
    let year = parse_decimal(&s[7..11])? as i64;
    let hour = parse_decimal(&s[12..14])? as i64;
    let min = parse_decimal(&s[15..17])? as i64;
    let sec = parse_decimal(&s[18..20])? as i64;

    let days_in_months: [i64; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    // O(1) leap day calculation: leaps(y) = y/4 - y/100 + y/400
    let leaps = |y: i64| -> i64 { y / 4 - y / 100 + y / 400 };
    let leap_days = leaps(year - 1) - leaps(1969);
    let mut total_days: i64 = 365 * (year - 1970) + leap_days;

    for m in 1..month {
        total_days += days_in_months[(m - 1) as usize];
        if m == 2 && is_leap(year) {
            total_days += 1;
        }
    }
    total_days += day - 1;

    Ok(total_days * 86400 + hour * 3600 + min * 60 + sec)
}

/// Parse 3-letter month name to 1-based month number
fn parse_month_name(s: &[u8]) -> Result<u32, ProgramError> {
    match s {
        b"Jan" => Ok(1),
        b"Feb" => Ok(2),
        b"Mar" => Ok(3),
        b"Apr" => Ok(4),
        b"May" => Ok(5),
        b"Jun" => Ok(6),
        b"Jul" => Ok(7),
        b"Aug" => Ok(8),
        b"Sep" => Ok(9),
        b"Oct" => Ok(10),
        b"Nov" => Ok(11),
        b"Dec" => Ok(12),
        _ => Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER)),
    }
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
    wallet_pda: &[u8; 32],
    proposal_index: u64,
    params_data: &[u8],
) -> Result<([u8; 32], u8), ProgramError> {
    let clock = Clock::get()?;
    let ed25519_ix = load_ed25519_data(instructions_sysvar)?;
    let proposer_index = find_in_proposers(intent_data, intent, &ed25519_ix.pubkey)?;

    let message = &ed25519_ix.message[..ed25519_ix.message_len];
    let body = extract_message_body(message, &ed25519_ix.pubkey)?;
    let expiry_str = validate_expiry(body, &clock)?;

    let mut expected = [0u8; MAX_BODY_LEN];
    let expected_len = build_message(
        &mut expected, expiry_str, b"propose", wallet_name, wallet_pda,
        proposal_index, intent, intent_data, params_data,
    )?;

    if &expected[..expected_len] != body {
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
    wallet_pda: &[u8; 32],
    action: &[u8],
) -> Result<([u8; 32], u8), ProgramError> {
    let clock = Clock::get()?;
    let ed25519_ix = load_ed25519_data(instructions_sysvar)?;
    let approver_index = find_in_approvers(intent_data, intent, &ed25519_ix.pubkey)?;

    let message = &ed25519_ix.message[..ed25519_ix.message_len];
    let body = extract_message_body(message, &ed25519_ix.pubkey)?;
    let expiry_str = validate_expiry(body, &clock)?;

    let params = read_params_data(proposal_data, proposal)?;

    let mut expected = [0u8; MAX_BODY_LEN];
    let expected_len = build_message(
        &mut expected, expiry_str, action, wallet_name, wallet_pda,
        proposal.proposal_index, intent, intent_data, params,
    )?;

    if &expected[..expected_len] != body {
        return Err(ProgramError::Custom(ERR_MESSAGE_MISMATCH));
    }

    Ok((ed25519_ix.pubkey, approver_index))
}

/// Extract body from a Solana offchain message envelope. Accepts both
/// sRFC 38 v1 (single-signer) and V0 (the format the released Ledger Solana
/// app currently emits).
///
/// Validates:
///   - prefix is "\xffsolana offchain"
///   - version is 0 or 1
///   - numSigners is exactly 1 (Lucid does not accept multi-signer envelopes)
///   - the embedded signer pubkey matches the precompile-verified signer
///
/// Binding the envelope's embedded pubkey to the precompile-verified pubkey
/// closes a malleability gap where someone could sign their own envelope but
/// claim authorship attached to a different wallet's authorization scope.
fn extract_message_body<'a>(message: &'a [u8], precompile_pubkey: &[u8; 32]) -> Result<&'a [u8], ProgramError> {
    if message.len() < 17 {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }
    if &message[..16] != OFFCHAIN_HEADER_PREFIX {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }

    match message[OFFCHAIN_VERSION_OFFSET] {
        OFFCHAIN_VERSION_V1 => parse_v1(message, precompile_pubkey),
        OFFCHAIN_VERSION_V0 => parse_v0(message, precompile_pubkey),
        _ => Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER)),
    }
}

fn parse_v1<'a>(message: &'a [u8], precompile_pubkey: &[u8; 32]) -> Result<&'a [u8], ProgramError> {
    if message.len() < OFFCHAIN_HEADER_LEN_V1 {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }
    if message[V1_NUM_SIGNERS_OFFSET] != 0x01 {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }
    if &message[V1_SIGNERS_OFFSET..V1_SIGNERS_OFFSET + 32] != precompile_pubkey {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }
    Ok(&message[OFFCHAIN_HEADER_LEN_V1..])
}

fn parse_v0<'a>(message: &'a [u8], precompile_pubkey: &[u8; 32]) -> Result<&'a [u8], ProgramError> {
    if message.len() < OFFCHAIN_HEADER_LEN_V0 {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }
    if message[V0_NUM_SIGNERS_OFFSET] != 0x01 {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }
    if &message[V0_SIGNERS_OFFSET..V0_SIGNERS_OFFSET + 32] != precompile_pubkey {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }
    // body length at V0_BODY_LEN_OFFSET (u16 LE), body starts at OFFCHAIN_HEADER_LEN_V0
    let body_len = u16::from_le_bytes([message[V0_BODY_LEN_OFFSET], message[V0_BODY_LEN_OFFSET + 1]]) as usize;
    if body_len + OFFCHAIN_HEADER_LEN_V0 != message.len() {
        return Err(ProgramError::Custom(ERR_INVALID_OFFCHAIN_HEADER));
    }
    Ok(&message[OFFCHAIN_HEADER_LEN_V0..])
}
