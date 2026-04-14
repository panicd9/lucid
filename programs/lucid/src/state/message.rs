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
    render_template_into(&mut body, &mut bpos, intent, intent_data, params_data, intent.intent_type)?;

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
    intent_type: u8,
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
            format_param_into(buf, pos, intent_data, intent, params_data, param_index, intent_type)?;

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

/// Format a parameter value for display in the message.
/// When `display_decimals > 0`, numeric values are rendered with a decimal point
/// (e.g., 1500000000 with decimals=9 → "1.5", 1000000000 → "1").
fn format_param_into(
    buf: &mut [u8],
    pos: &mut usize,
    intent_data: &[u8],
    intent: &IntentHeader,
    params_data: &[u8],
    param_index: u8,
    intent_type: u8,
) -> Result<(), ProgramError> {
    let entry = read_param_entry(intent_data, intent, param_index)?;
    let bytes = read_param_bytes(intent_data, intent, params_data, param_index)?;
    let decimals = entry.display_decimals;

    match entry.param_type {
        PARAM_TYPE_ADDRESS => {
            // base58 encode
            let encoded = base58_encode(bytes);
            copy_to(buf, pos, &encoded.0[..encoded.1])?;
        }
        PARAM_TYPE_U64 => {
            let val = u64::from_le_bytes(bytes[..8].try_into().map_err(|_| ProgramError::InvalidInstructionData)?);
            if decimals > 0 {
                let s = u64_to_decimal_scaled(val, decimals);
                copy_to(buf, pos, &s.0[..s.1])?;
            } else {
                let s = u64_to_decimal(val);
                copy_to(buf, pos, &s.0[..s.1])?;
            }
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
            let content = &bytes[2..2 + slen];
            if intent_type == INTENT_TYPE_ADD || intent_type == INTENT_TYPE_UPDATE {
                format_meta_definition_into(buf, pos, content)?;
            } else {
                copy_to(buf, pos, content)?;
            }
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

    render_template_into(&mut buf, &mut pos, intent, intent_data, params_data, intent.intent_type)?;

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

/// Convert u64 to decimal string with display_decimals scaling.
/// E.g., val=1500000000, decimals=9 → "1.5"; val=1000000000, decimals=9 → "1"
/// No trailing zeros after decimal point; omit "." when fraction is zero.
fn u64_to_decimal_scaled(val: u64, decimals: u8) -> ([u8; 40], usize) {
    let mut buf = [0u8; 40];
    let divisor = 10u64.pow(decimals as u32);
    let whole = val / divisor;
    let frac = val % divisor;

    let w = u64_to_decimal(whole);
    let mut pos = w.1;
    buf[..pos].copy_from_slice(&w.0[..pos]);

    if frac > 0 {
        buf[pos] = b'.';
        pos += 1;

        // Write fractional digits with leading zeros, then strip trailing zeros
        let f = u64_to_decimal(frac);
        let frac_digits = decimals as usize;
        let leading_zeros = frac_digits - f.1;
        for _ in 0..leading_zeros {
            buf[pos] = b'0';
            pos += 1;
        }
        // Copy frac digits, then trim trailing zeros
        buf[pos..pos + f.1].copy_from_slice(&f.0[..f.1]);
        pos += f.1;
        while pos > 0 && buf[pos - 1] == b'0' {
            pos -= 1;
        }
    }

    (buf, pos)
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

// ─── Meta-intent definition rendering ──────────────────────────────────

/// Render a meta-intent definition blob as a human-readable summary.
/// Input: raw definition bytes (same layout as intent account data after PREFIX_LEN).
/// Output: `"template text" params:N accounts:M sha256:HEX`
fn format_meta_definition_into(
    buf: &mut [u8],
    pos: &mut usize,
    def_bytes: &[u8],
) -> Result<(), ProgramError> {
    if def_bytes.len() < IntentHeader::DATA_LEN {
        return Err(ProgramError::InvalidInstructionData);
    }

    // Read counts from header (offsets within the 88-byte IntentHeader struct)
    let proposer_count = def_bytes[78] as usize;
    let approver_count = def_bytes[79] as usize;
    let param_count = def_bytes[80];
    let account_count = def_bytes[81];
    let instruction_count = def_bytes[82] as usize;
    let data_segment_count = def_bytes[83] as usize;
    let seed_count = def_bytes[84] as usize;
    let byte_pool_len = u16::from_le_bytes([def_bytes[70], def_bytes[71]]) as usize;

    // Calculate byte_pool offset within def_bytes (no PREFIX_LEN in the blob)
    let bp_offset = IntentHeader::DATA_LEN
        + (proposer_count * 32)
        + (approver_count * 32)
        + (param_count as usize * ParamEntry::SIZE)
        + (account_count as usize * AccountEntry::SIZE)
        + (instruction_count * InstructionEntry::SIZE)
        + (data_segment_count * DataSegmentEntry::SIZE)
        + (seed_count * SeedEntry::SIZE);

    // Extract template from byte_pool
    if byte_pool_len >= 4 && bp_offset + 4 <= def_bytes.len() {
        let tmpl_offset = u16::from_le_bytes([def_bytes[bp_offset], def_bytes[bp_offset + 1]]) as usize;
        let tmpl_len = u16::from_le_bytes([def_bytes[bp_offset + 2], def_bytes[bp_offset + 3]]) as usize;
        let tmpl_start = bp_offset + 4 + tmpl_offset;
        let tmpl_end = tmpl_start + tmpl_len;

        // Opening quote
        copy_to(buf, pos, b"\"")?;
        if tmpl_end <= def_bytes.len() && tmpl_len <= 200 {
            copy_to(buf, pos, &def_bytes[tmpl_start..tmpl_end])?;
        } else if tmpl_end <= def_bytes.len() {
            // Truncate long templates
            copy_to(buf, pos, &def_bytes[tmpl_start..tmpl_start + 197])?;
            copy_to(buf, pos, b"...")?;
        }
        copy_to(buf, pos, b"\"")?;
    } else {
        copy_to(buf, pos, b"\"<empty>\"")?;
    }

    // params:N
    copy_to(buf, pos, b" params:")?;
    let pc = u64_to_decimal(param_count as u64);
    copy_to(buf, pos, &pc.0[..pc.1])?;

    // accounts:M
    copy_to(buf, pos, b" accounts:")?;
    let ac = u64_to_decimal(account_count as u64);
    copy_to(buf, pos, &ac.0[..ac.1])?;

    // sha256:HASH
    let hash = sha256_hash(def_bytes);
    copy_to(buf, pos, b" sha256:")?;
    hex_encode_into(buf, pos, &hash)?;

    Ok(())
}

/// Compute SHA256 hash using Solana's sol_sha256 syscall.
#[cfg(target_os = "solana")]
fn sha256_hash(data: &[u8]) -> [u8; 32] {
    use core::mem::MaybeUninit;
    use pinocchio::syscalls::sol_sha256;
    let input: [&[u8]; 1] = [data];
    let mut hash = MaybeUninit::<[u8; 32]>::uninit();
    unsafe {
        sol_sha256(
            input.as_ptr() as *const u8,
            1,
            hash.as_mut_ptr() as *mut u8,
        );
        hash.assume_init()
    }
}

/// Off-chain stub: returns zeros. Real hash verification happens in LiteSVM integration tests.
#[cfg(not(target_os = "solana"))]
fn sha256_hash(_data: &[u8]) -> [u8; 32] {
    [0u8; 32]
}

/// Encode bytes as lowercase hex into a buffer.
fn hex_encode_into(buf: &mut [u8], pos: &mut usize, input: &[u8]) -> Result<(), ProgramError> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for &byte in input {
        if *pos + 2 > buf.len() {
            return Err(ProgramError::InvalidInstructionData);
        }
        buf[*pos] = HEX[(byte >> 4) as usize];
        buf[*pos + 1] = HEX[(byte & 0xf) as usize];
        *pos += 2;
    }
    Ok(())
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
