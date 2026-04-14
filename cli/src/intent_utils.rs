use anyhow::Result;
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;

use crate::pda;
use crate::rpc;
use crate::types::*;

/// Read the template string from raw intent account data.
/// Shared by approve, cancel, propose, and wallet commands.
pub fn read_template_string(data: &[u8]) -> Option<String> {
    if data.len() < PREFIX_LEN + INTENT_HEADER_LEN {
        return None;
    }
    let ih = &data[PREFIX_LEN..];
    let byte_pool_len = u16::from_le_bytes([ih[38], ih[39]]) as usize;
    let proposer_count = ih[46] as usize;
    let approver_count = ih[47] as usize;
    let param_count = ih[48] as usize;
    let account_count = ih[49] as usize;
    let instruction_count = ih[50] as usize;
    let data_segment_count = ih[51] as usize;
    let seed_count = ih[52] as usize;

    if byte_pool_len < 4 {
        return None;
    }

    let bp_offset = PREFIX_LEN + INTENT_HEADER_LEN
        + (proposer_count * 32)
        + (approver_count * 32)
        + (param_count * PARAM_ENTRY_SIZE)
        + (account_count * ACCOUNT_ENTRY_SIZE)
        + (instruction_count * INSTRUCTION_ENTRY_SIZE)
        + (data_segment_count * DATA_SEGMENT_ENTRY_SIZE)
        + (seed_count * SEED_ENTRY_SIZE);

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

/// Render a template by substituting param placeholders with decoded values from params_data.
/// Uses the compact cancel.rs approach with `param_type_size`.
pub fn render_template_with_params(template: &str, intent_data: &[u8], params_data: &[u8]) -> String {
    if intent_data.len() < PREFIX_LEN + INTENT_HEADER_LEN {
        return template.to_string();
    }

    let ih = &intent_data[PREFIX_LEN..];
    let param_count = ih[48] as usize;
    let proposer_count = ih[46] as usize;
    let approver_count = ih[47] as usize;

    let params_entry_offset = PREFIX_LEN + INTENT_HEADER_LEN + (proposer_count * 32) + (approver_count * 32);

    let mut result = template.to_string();
    let mut data_offset = 0usize;

    for i in 0..param_count {
        let entry_offset = params_entry_offset + (i * PARAM_ENTRY_SIZE);
        if entry_offset + PARAM_ENTRY_SIZE > intent_data.len() {
            break;
        }
        let pt = intent_data[entry_offset + 12];
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
                PARAM_TYPE_U64 => u64::from_le_bytes(bytes.try_into().unwrap_or([0; 8])).to_string(),
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

        result = result.replace(&format!("{{{}}}", i), &value_str);
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
