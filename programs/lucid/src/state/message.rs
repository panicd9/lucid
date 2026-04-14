use pinocchio::error::ProgramError;

use crate::state::accounts::*;
use crate::state::byte_pool::*;
use crate::state::constants::*;

/// Build the full offchain message bytes for a proposal action.
///
/// Format:
/// \xffsolana offchain + version(0) + format(0=ASCII) + length(u16 LE)
/// + body: "{action} {rendered_template} | wallet: {name}; proposal: #{index}; expires: {timestamp}"
pub fn build_message(
    expiry_str: &[u8],
    action: &[u8],
    wallet_name: &[u8],
    proposal_index: u64,
    intent: &IntentHeader,
    intent_data: &[u8],
    params_data: &[u8],
) -> Result<([u8; 512], usize), ProgramError> {
    let mut buf = [0u8; 512];
    let mut pos = 0;

    // Build body first so we know the length
    let mut body = [0u8; 450];
    let mut bpos = 0;

    // action ("propose", "approve", "cancel")
    copy_to(&mut body, &mut bpos, action)?;

    // " "
    copy_to(&mut body, &mut bpos, b" ")?;

    // Render template with params
    render_template_into(&mut body, &mut bpos, intent, intent_data, params_data)?;

    // " | wallet: "
    copy_to(&mut body, &mut bpos, b" | wallet: ")?;

    // wallet name + separator
    copy_to(&mut body, &mut bpos, wallet_name)?;
    copy_to(&mut body, &mut bpos, b"; ")?;

    // "proposal: #"
    copy_to(&mut body, &mut bpos, b"proposal: #")?;

    // proposal index as decimal string
    let idx_str = u64_to_decimal(proposal_index);
    copy_to(&mut body, &mut bpos, &idx_str.0[..idx_str.1])?;

    // "; expires: "
    copy_to(&mut body, &mut bpos, b"; expires: ")?;

    // timestamp
    copy_to(&mut body, &mut bpos, expiry_str)?;

    // Now build the full message with offchain header
    // \xffsolana offchain (16 bytes)
    copy_to(&mut buf, &mut pos, OFFCHAIN_HEADER_PREFIX)?;

    // version: 0
    buf[pos] = 0;
    pos += 1;

    // format: 0 (ASCII)
    buf[pos] = 0;
    pos += 1;

    // length: u16 LE
    let body_len = bpos as u16;
    buf[pos] = body_len as u8;
    buf[pos + 1] = (body_len >> 8) as u8;
    pos += 2;

    // body
    if pos + bpos > buf.len() {
        return Err(ProgramError::InvalidInstructionData);
    }
    buf[pos..pos + bpos].copy_from_slice(&body[..bpos]);
    pos += bpos;

    Ok((buf, pos))
}

/// Render the intent template with parameter substitution.
/// Template format: "change admin authority to {0}" where {N} references params
fn render_template_into(
    buf: &mut [u8],
    pos: &mut usize,
    intent: &IntentHeader,
    intent_data: &[u8],
    params_data: &[u8],
) -> Result<(), ProgramError> {
    let template = read_template(intent_data, intent)?;

    let mut i = 0;
    while i < template.len() {
        if template[i] == b'{' {
            // Find closing brace
            let start = i + 1;
            let mut end = start;
            while end < template.len() && template[end] != b'}' {
                end += 1;
            }
            if end >= template.len() {
                return Err(ProgramError::InvalidAccountData);
            }

            // Parse param index (could be name or number)
            let idx_bytes = &template[start..end];
            let param_index = resolve_param_index(idx_bytes, intent, intent_data)?;

            // Format the parameter value
            format_param_into(buf, pos, intent_data, intent, params_data, param_index)?;

            i = end + 1;
        } else {
            if *pos >= buf.len() {
                return Err(ProgramError::InvalidInstructionData);
            }
            buf[*pos] = template[i];
            *pos += 1;
            i += 1;
        }
    }

    Ok(())
}

/// Format a parameter value for display in the message
fn format_param_into(
    buf: &mut [u8],
    pos: &mut usize,
    intent_data: &[u8],
    intent: &IntentHeader,
    params_data: &[u8],
    param_index: u8,
) -> Result<(), ProgramError> {
    let entry = read_param_entry(intent_data, intent, param_index)?;
    let bytes = read_param_bytes(intent_data, intent, params_data, param_index)?;

    match entry.param_type {
        PARAM_TYPE_ADDRESS => {
            // base58 encode
            let encoded = base58_encode(bytes);
            copy_to(buf, pos, &encoded.0[..encoded.1])?;
        }
        PARAM_TYPE_U64 => {
            let val = u64::from_le_bytes(bytes[..8].try_into().map_err(|_| ProgramError::InvalidInstructionData)?);
            let s = u64_to_decimal(val);
            copy_to(buf, pos, &s.0[..s.1])?;
        }
        PARAM_TYPE_I64 => {
            let val = i64::from_le_bytes(bytes[..8].try_into().map_err(|_| ProgramError::InvalidInstructionData)?);
            let s = i64_to_decimal(val);
            copy_to(buf, pos, &s.0[..s.1])?;
        }
        PARAM_TYPE_STRING => {
            // u16 len prefix + UTF-8 bytes
            if bytes.len() < 2 {
                return Err(ProgramError::InvalidInstructionData);
            }
            let slen = u16::from_le_bytes([bytes[0], bytes[1]]) as usize;
            if bytes.len() < 2 + slen {
                return Err(ProgramError::InvalidInstructionData);
            }
            copy_to(buf, pos, &bytes[2..2 + slen])?;
        }
        PARAM_TYPE_BOOL => {
            if bytes[0] != 0 {
                copy_to(buf, pos, b"true")?;
            } else {
                copy_to(buf, pos, b"false")?;
            }
        }
        PARAM_TYPE_U8 => {
            let val = bytes[0] as u64;
            let s = u64_to_decimal(val);
            copy_to(buf, pos, &s.0[..s.1])?;
        }
        PARAM_TYPE_U16 => {
            let val = u16::from_le_bytes([bytes[0], bytes[1]]) as u64;
            let s = u64_to_decimal(val);
            copy_to(buf, pos, &s.0[..s.1])?;
        }
        PARAM_TYPE_U32 => {
            let val = u32::from_le_bytes(bytes[..4].try_into().map_err(|_| ProgramError::InvalidInstructionData)?) as u64;
            let s = u64_to_decimal(val);
            copy_to(buf, pos, &s.0[..s.1])?;
        }
        PARAM_TYPE_U128 => {
            let val = u128::from_le_bytes(bytes[..16].try_into().map_err(|_| ProgramError::InvalidInstructionData)?);
            let s = u128_to_decimal(val);
            copy_to(buf, pos, &s.0[..s.1])?;
        }
        _ => return Err(ProgramError::InvalidInstructionData),
    }

    Ok(())
}

/// Resolve a template placeholder to a param index.
/// Tries numeric first (e.g. "0", "1"), then name lookup (e.g. "amount", "to").
fn resolve_param_index(
    bytes: &[u8],
    intent: &IntentHeader,
    intent_data: &[u8],
) -> Result<u8, ProgramError> {
    // Try numeric parse first
    if let Ok(idx) = parse_param_index_numeric(bytes) {
        return Ok(idx);
    }
    // Fall back to name lookup
    let bp_offset = intent.byte_pool_offset();
    for i in 0..intent.param_count {
        let entry = read_param_entry(intent_data, intent, i)?;
        if entry.name_len == 0 {
            continue;
        }
        // Name is stored at byte_pool + name_offset (absolute within pool)
        let name_start = bp_offset + entry.name_offset as usize;
        let name_end = name_start + entry.name_len as usize;
        if name_end > intent_data.len() {
            continue;
        }
        if &intent_data[name_start..name_end] == bytes {
            return Ok(i);
        }
    }
    Err(ProgramError::InvalidAccountData)
}

/// Parse a decimal number from bytes (e.g., "0", "1", "12")
fn parse_param_index_numeric(bytes: &[u8]) -> Result<u8, ProgramError> {
    if bytes.is_empty() {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut val: u8 = 0;
    for &b in bytes {
        if b < b'0' || b > b'9' {
            return Err(ProgramError::InvalidAccountData);
        }
        val = val.checked_mul(10)
            .and_then(|v| v.checked_add(b - b'0'))
            .ok_or(ProgramError::InvalidAccountData)?;
    }
    Ok(val)
}

/// Render the intent message for an execution receipt
pub fn render_intent_message(
    intent: &IntentHeader,
    intent_data: &[u8],
    params_data: &[u8],
    wallet_name: &[u8],
    proposal_index: u64,
) -> Result<([u8; 512], usize), ProgramError> {
    let mut buf = [0u8; 512];
    let mut pos = 0;

    render_template_into(&mut buf, &mut pos, intent, intent_data, params_data)?;

    copy_to(&mut buf, &mut pos, b" | wallet: ")?;
    copy_to(&mut buf, &mut pos, wallet_name)?;
    copy_to(&mut buf, &mut pos, b"; ")?;
    copy_to(&mut buf, &mut pos, b"proposal: #")?;
    let idx = u64_to_decimal(proposal_index);
    copy_to(&mut buf, &mut pos, &idx.0[..idx.1])?;

    Ok((buf, pos))
}

// ─── Formatting helpers (no alloc) ────────────────────────────────────

fn copy_to(buf: &mut [u8], pos: &mut usize, src: &[u8]) -> Result<(), ProgramError> {
    let end = *pos + src.len();
    if end > buf.len() {
        return Err(ProgramError::InvalidInstructionData);
    }
    buf[*pos..end].copy_from_slice(src);
    *pos = end;
    Ok(())
}

/// Convert u64 to decimal string, returns (buffer, length)
pub fn u64_to_decimal(mut val: u64) -> ([u8; 20], usize) {
    let mut buf = [0u8; 20];
    if val == 0 {
        buf[0] = b'0';
        return (buf, 1);
    }
    let mut i = 20;
    while val > 0 {
        i -= 1;
        buf[i] = b'0' + (val % 10) as u8;
        val /= 10;
    }
    let len = 20 - i;
    let mut result = [0u8; 20];
    result[..len].copy_from_slice(&buf[i..]);
    (result, len)
}

fn i64_to_decimal(val: i64) -> ([u8; 21], usize) {
    let mut buf = [0u8; 21];
    if val < 0 {
        buf[0] = b'-';
        let abs = (val as i128).unsigned_abs() as u64;
        let d = u64_to_decimal(abs);
        buf[1..1 + d.1].copy_from_slice(&d.0[..d.1]);
        (buf, 1 + d.1)
    } else {
        let d = u64_to_decimal(val as u64);
        buf[..d.1].copy_from_slice(&d.0[..d.1]);
        (buf, d.1)
    }
}

fn u128_to_decimal(mut val: u128) -> ([u8; 40], usize) {
    let mut buf = [0u8; 40];
    if val == 0 {
        buf[0] = b'0';
        return (buf, 1);
    }
    let mut i = 40;
    while val > 0 {
        i -= 1;
        buf[i] = b'0' + (val % 10) as u8;
        val /= 10;
    }
    let len = 40 - i;
    let mut result = [0u8; 40];
    result[..len].copy_from_slice(&buf[i..]);
    (result, len)
}

/// Minimal base58 encoder for 32-byte pubkeys (no alloc)
/// Returns (buffer, length)
pub fn base58_encode(input: &[u8]) -> ([u8; 44], usize) {
    const ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let mut buf = [0u8; 44];

    // Count leading zeros
    let mut leading_zeros = 0;
    for &b in input {
        if b != 0 {
            break;
        }
        leading_zeros += 1;
    }

    // Convert to base58 using big-endian arithmetic
    let mut temp = [0u8; 44];
    let mut temp_len = 0;

    for &byte in input {
        let mut carry = byte as u32;
        for j in 0..temp_len {
            carry += (temp[j] as u32) * 256;
            temp[j] = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            temp[temp_len] = (carry % 58) as u8;
            carry /= 58;
            temp_len += 1;
        }
    }

    let mut pos = 0;
    // Add '1' for each leading zero byte
    for _ in 0..leading_zeros {
        buf[pos] = b'1';
        pos += 1;
    }

    // Reverse the temp array and map to alphabet
    for i in (0..temp_len).rev() {
        buf[pos] = ALPHABET[temp[i] as usize];
        pos += 1;
    }

    (buf, pos)
}

/// Parse timestamp from the end of the message body.
/// Expected suffix: "; expires: DD Mon YYYY HH:MM:SS"
/// Returns the timestamp string bytes.
pub fn parse_expiry_from_body(body: &[u8]) -> Result<&[u8], ProgramError> {
    // "; expires: " = 11 bytes, timestamp = 20 bytes ("DD Mon YYYY HH:MM:SS")
    let suffix_len = 11 + 20; // 31
    if body.len() < suffix_len {
        return Err(ProgramError::Custom(crate::state::errors::ERR_INVALID_OFFCHAIN_HEADER));
    }
    let suffix_start = body.len() - suffix_len;
    if &body[suffix_start..suffix_start + 11] != b"; expires: " {
        return Err(ProgramError::Custom(crate::state::errors::ERR_INVALID_OFFCHAIN_HEADER));
    }
    Ok(&body[suffix_start + 11..])
}
