use anyhow::{Context, Result};
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;

use crate::pda;
use crate::rpc;
use crate::types::*;

// ─── Typed Wallet deserialization ────────────────────────────────────

pub struct WalletInfo {
    pub proposal_index: u64,
    pub intent_count: u8,
    pub frozen: bool,
    pub name: String,
    pub create_key: Pubkey,
}

pub fn deserialize_wallet(data: &[u8]) -> Result<WalletInfo> {
    if data.len() < PREFIX_LEN + WALLET_DATA_LEN {
        anyhow::bail!("Invalid wallet account data");
    }
    if data[0] != DISC_WALLET {
        anyhow::bail!("Account is not a Wallet");
    }
    let wd = &data[PREFIX_LEN..];
    let proposal_index = u64::from_le_bytes(wd[0..8].try_into()?);
    let intent_count = wd[8];
    let frozen = wd[9] == 1;
    let name_len = wd[11] as usize;
    let create_key = Pubkey::from(<[u8; 32]>::try_from(&wd[16..48])?);
    let name = std::str::from_utf8(&wd[48..48 + name_len.min(32)])
        .context("Invalid wallet name UTF-8")?
        .to_string();
    Ok(WalletInfo { proposal_index, intent_count, frozen, name, create_key })
}

// ─── Typed IntentHeader deserialization ──────────────────────────────

pub struct IntentHeaderInfo {
    #[allow(dead_code)]
    pub wallet: Pubkey,
    #[allow(dead_code)]
    pub target_program: Pubkey,
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
}

pub fn deserialize_intent_header(data: &[u8]) -> Result<IntentHeaderInfo> {
    if data.len() < PREFIX_LEN + INTENT_HEADER_LEN {
        anyhow::bail!("Invalid intent account data");
    }
    let ih = &data[PREFIX_LEN..];
    Ok(IntentHeaderInfo {
        wallet: Pubkey::from(<[u8; 32]>::try_from(&ih[0..32])?),
        target_program: Pubkey::from(<[u8; 32]>::try_from(&ih[32..64])?),
        timelock_seconds: u32::from_le_bytes(ih[64..68].try_into()?),
        active_proposal_count: u16::from_le_bytes(ih[68..70].try_into()?),
        byte_pool_len: u16::from_le_bytes(ih[70..72].try_into()?),
        bump: ih[72],
        intent_index: ih[73],
        intent_type: ih[74],
        approved: ih[75],
        approval_threshold: ih[76],
        cancellation_threshold: ih[77],
        proposer_count: ih[78],
        approver_count: ih[79],
        param_count: ih[80],
        account_count: ih[81],
        instruction_count: ih[82],
        data_segment_count: ih[83],
        seed_count: ih[84],
    })
}

/// Read raw proposer pubkeys from intent data (after the header).
pub fn read_proposers(data: &[u8], header: &IntentHeaderInfo) -> Vec<Pubkey> {
    let start = PREFIX_LEN + INTENT_HEADER_LEN;
    let count = header.proposer_count as usize;
    (0..count)
        .filter_map(|i| {
            let off = start + i * 32;
            <[u8; 32]>::try_from(&data[off..off + 32]).ok().map(Pubkey::from)
        })
        .collect()
}

/// Read raw approver pubkeys from intent data (after proposers).
pub fn read_approvers(data: &[u8], header: &IntentHeaderInfo) -> Vec<Pubkey> {
    let start = PREFIX_LEN + INTENT_HEADER_LEN + (header.proposer_count as usize) * 32;
    let count = header.approver_count as usize;
    (0..count)
        .filter_map(|i| {
            let off = start + i * 32;
            <[u8; 32]>::try_from(&data[off..off + 32]).ok().map(Pubkey::from)
        })
        .collect()
}

/// Read the template string from raw intent account data.
/// Shared by approve, cancel, propose, and wallet commands.
pub fn read_template_string(data: &[u8]) -> Option<String> {
    let h = deserialize_intent_header(data).ok()?;

    if h.byte_pool_len < 4 {
        return None;
    }

    let bp_offset = byte_pool_offset(&h);

    if bp_offset + 4 > data.len() {
        return None;
    }

    let tmpl_offset = u16::from_le_bytes([data[bp_offset], data[bp_offset + 1]]) as usize;
    let tmpl_len = u16::from_le_bytes([data[bp_offset + 2], data[bp_offset + 3]]) as usize;
    let abs_start = bp_offset + 4 + tmpl_offset;
    let abs_end = abs_start + tmpl_len;
    if abs_end > data.len() {
        return None;
    }
    String::from_utf8(data[abs_start..abs_end].to_vec()).ok()
}

/// Compute the byte pool offset from an IntentHeaderInfo.
pub fn byte_pool_offset(h: &IntentHeaderInfo) -> usize {
    PREFIX_LEN + INTENT_HEADER_LEN
        + (h.proposer_count as usize * 32)
        + (h.approver_count as usize * 32)
        + (h.param_count as usize * PARAM_ENTRY_SIZE)
        + (h.account_count as usize * ACCOUNT_ENTRY_SIZE)
        + (h.instruction_count as usize * INSTRUCTION_ENTRY_SIZE)
        + (h.data_segment_count as usize * DATA_SEGMENT_ENTRY_SIZE)
        + (h.seed_count as usize * SEED_ENTRY_SIZE)
}

/// Compute the params entry offset from an IntentHeaderInfo.
pub fn params_entry_offset(h: &IntentHeaderInfo) -> usize {
    PREFIX_LEN + INTENT_HEADER_LEN
        + (h.proposer_count as usize * 32)
        + (h.approver_count as usize * 32)
}

/// Compute the accounts entry offset from an IntentHeaderInfo.
pub fn accounts_entry_offset(h: &IntentHeaderInfo) -> usize {
    params_entry_offset(h) + (h.param_count as usize * PARAM_ENTRY_SIZE)
}

/// Render a template by substituting param placeholders with decoded values from params_data.
/// Uses the compact cancel.rs approach with `param_type_size`.
pub fn render_template_with_params(template: &str, intent_data: &[u8], params_data: &[u8]) -> String {
    let h = match deserialize_intent_header(intent_data) {
        Ok(h) => h,
        Err(_) => return template.to_string(),
    };

    let params_entry_offset = params_entry_offset(&h);
    let param_count = h.param_count as usize;

    let mut result = template.to_string();
    let mut data_offset = 0usize;

    for i in 0..param_count {
        let entry_offset = params_entry_offset + (i * PARAM_ENTRY_SIZE);
        if entry_offset + PARAM_ENTRY_SIZE > intent_data.len() {
            break;
        }
        let pt = intent_data[entry_offset + 12];
        let display_decimals = intent_data[entry_offset + 14];
        let size = param_type_size(pt);

        let value_str = if size == 0 {
            // String type
            if data_offset + 2 <= params_data.len() {
                let slen = u16::from_le_bytes([params_data[data_offset], params_data[data_offset + 1]]) as usize;
                data_offset += 2;
                if data_offset + slen <= params_data.len() {
                    let s = String::from_utf8_lossy(&params_data[data_offset..data_offset + slen]).to_string();
                    data_offset += slen;
                    s
                } else {
                    "???".to_string()
                }
            } else {
                "???".to_string()
            }
        } else if pt == PARAM_TYPE_ADDRESS && data_offset + 32 <= params_data.len() {
            let pk = Pubkey::from(<[u8; 32]>::try_from(&params_data[data_offset..data_offset + 32]).unwrap_or([0; 32]));
            data_offset += 32;
            pk.to_string()
        } else if data_offset + size <= params_data.len() {
            let bytes = &params_data[data_offset..data_offset + size];
            data_offset += size;
            match pt {
                PARAM_TYPE_U64 => {
                    let val = u64::from_le_bytes(bytes.try_into().unwrap_or([0; 8]));
                    format_with_decimals(val, display_decimals)
                }
                PARAM_TYPE_I64 => i64::from_le_bytes(bytes.try_into().unwrap_or([0; 8])).to_string(),
                PARAM_TYPE_BOOL => (bytes[0] != 0).to_string(),
                PARAM_TYPE_U8 => bytes[0].to_string(),
                PARAM_TYPE_U16 => u16::from_le_bytes(bytes.try_into().unwrap_or([0; 2])).to_string(),
                PARAM_TYPE_U32 => u32::from_le_bytes(bytes.try_into().unwrap_or([0; 4])).to_string(),
                _ => format!("{:?}", bytes),
            }
        } else {
            "???".to_string()
        };

        // Replace by numeric index {0}, {1}, ...
        result = result.replace(&format!("{{{}}}", i), &value_str);

        // Replace by param name {amount}, {to}, ... if name is available
        let name_offset_field = u16::from_le_bytes([
            intent_data[entry_offset + 8],
            intent_data[entry_offset + 9],
        ]) as usize;
        let name_len_field = u16::from_le_bytes([
            intent_data[entry_offset + 10],
            intent_data[entry_offset + 11],
        ]) as usize;
        if name_len_field > 0 {
            let bp_off = byte_pool_offset(&h);
            // Names are stored at byte_pool + name_offset (absolute within pool)
            let name_start = bp_off + name_offset_field;
            let name_end = name_start + name_len_field;
            if name_end <= intent_data.len() {
                if let Ok(name) = std::str::from_utf8(&intent_data[name_start..name_end]) {
                    result = result.replace(&format!("{{{}}}", name), &value_str);
                }
            }
        }
    }

    result
}

/// Build the Solana offchain message envelope around a body string.
/// Format: \xffsolana offchain + version(0) + format(0) + length(u16 LE) + body bytes.
pub fn build_offchain_message(body: &str) -> Vec<u8> {
    let mut message = Vec::new();
    message.extend_from_slice(b"\xffsolana offchain");
    message.push(0); // version
    message.push(0); // format (ASCII)
    message.extend_from_slice(&(body.as_bytes().len() as u16).to_le_bytes());
    message.extend_from_slice(body.as_bytes());
    message
}

/// Format an expiry timestamp from a duration in seconds from now.
/// Returns a string like "14 Apr 2026 12:00:00".
pub fn format_expiry(secs: u64) -> String {
    let now = chrono::Utc::now();
    let expiry_time = now + chrono::Duration::seconds(secs as i64);
    expiry_time.format("%d %b %Y %H:%M:%S").to_string()
}

/// Find a proposal account by scanning all intents for a wallet.
/// Returns (intent_pda, proposal_pda, proposal_data).
pub fn find_proposal_for_wallet(
    client: &RpcClient,
    wallet: &Pubkey,
    proposal_index: u64,
    intent_count: u8,
    program_id: &Pubkey,
) -> Result<(Pubkey, Pubkey, Vec<u8>)> {
    let mut found_intent_pda = None;
    let mut found_proposal_pda = None;

    for i in 0..intent_count {
        let (intent_pda, _) = pda::find_intent_pda(wallet, i, program_id);
        let (proposal_pda, _) = pda::find_proposal_pda(&intent_pda, proposal_index, program_id);

        if rpc::fetch_account(client, &proposal_pda).is_ok() {
            found_intent_pda = Some(intent_pda);
            found_proposal_pda = Some(proposal_pda);
            break;
        }
    }

    let intent_pda = found_intent_pda
        .ok_or_else(|| anyhow::anyhow!("Proposal not found for index {}", proposal_index))?;
    let proposal_pda = found_proposal_pda.unwrap();

    let proposal_data = rpc::fetch_account(client, &proposal_pda)?;
    if proposal_data.len() < PREFIX_LEN + PROPOSAL_DATA_LEN {
        anyhow::bail!("Invalid proposal account data");
    }

    Ok((intent_pda, proposal_pda, proposal_data))
}

/// Format a u64 with display_decimals scaling (e.g., 1500000000 with decimals=9 → "1.5").
fn format_with_decimals(val: u64, decimals: u8) -> String {
    if decimals == 0 {
        return val.to_string();
    }
    let divisor = 10u64.pow(decimals as u32);
    let whole = val / divisor;
    let frac = val % divisor;
    if frac == 0 {
        whole.to_string()
    } else {
        let frac_str = format!("{:0>width$}", frac, width = decimals as usize);
        let trimmed = frac_str.trim_end_matches('0');
        format!("{}.{}", whole, trimmed)
    }
}

/// Convert a camelCase or PascalCase string to snake_case.
/// Shared by verify.rs and generate.rs.
pub fn snake_case(s: &str) -> String {
    let mut result = String::new();
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() && i > 0 {
            result.push('_');
        }
        result.push(c.to_lowercase().next().unwrap_or(c));
    }
    result
}

/// Map an Anchor IDL type value to a Lucid param type string.
/// Shared by verify.rs and generate.rs.
pub fn map_idl_type(ty: &serde_json::Value) -> String {
    if let Some(s) = ty.as_str() {
        match s {
            "publicKey" | "pubkey" => "address".to_string(),
            "u8" => "u8".to_string(),
            "u16" => "u16".to_string(),
            "u32" => "u32".to_string(),
            "u64" => "u64".to_string(),
            "u128" => "u128".to_string(),
            "i64" => "i64".to_string(),
            "bool" => "bool".to_string(),
            "string" => "string".to_string(),
            _ => "u64".to_string(),
        }
    } else if let Some(obj) = ty.as_object() {
        if let Some(inner) = obj.get("option") {
            return map_idl_type(inner);
        }
        "u64".to_string()
    } else {
        "u64".to_string()
    }
}
