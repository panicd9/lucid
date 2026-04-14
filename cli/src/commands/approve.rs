use anyhow::{Context, Result};
use colored::Colorize;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signer::Signer,
    transaction::Transaction,
};
use std::str::FromStr;

use crate::pda;
use crate::rpc;
use crate::types::*;

pub fn approve(
    wallet_str: &str,
    proposal_index: u64,
    expiry_secs: u64,
    keypair_path: &str,
    url: &str,
) -> Result<()> {
    let client = rpc::create_client(url);
    let payer = rpc::load_keypair(keypair_path)?;
    let program_id = pda::PROGRAM_ID;

    let wallet_pubkey = Pubkey::from_str(wallet_str).context("Invalid wallet address")?;

    // Fetch wallet to get name
    let wallet_data = rpc::fetch_account(&client, &wallet_pubkey)?;
    if wallet_data.len() < PREFIX_LEN + WALLET_DATA_LEN {
        anyhow::bail!("Invalid wallet account data");
    }
    let wd = &wallet_data[PREFIX_LEN..];
    let name_len = wd[11] as usize;
    let wallet_name = std::str::from_utf8(&wd[16..16 + name_len.min(32)])?;

    // We need to find the proposal account. The proposal PDA is derived from intent + proposal_index.
    // We need to scan intents to find which one owns this proposal.
    // For simplicity, we scan all intent PDAs and try to find the proposal.
    let intent_count = wd[8];

    let mut found_intent_pda = None;
    let mut found_proposal_pda = None;

    for i in 0..intent_count {
        let (intent_pda, _) = pda::find_intent_pda(&wallet_pubkey, i, &program_id);
        let (proposal_pda, _) = pda::find_proposal_pda(&intent_pda, proposal_index, &program_id);

        // Try to fetch the proposal
        if rpc::fetch_account(&client, &proposal_pda).is_ok() {
            found_intent_pda = Some(intent_pda);
            found_proposal_pda = Some(proposal_pda);
            break;
        }
    }

    let intent_pda = found_intent_pda.ok_or_else(|| anyhow::anyhow!("Proposal not found for index {}", proposal_index))?;
    let proposal_pda = found_proposal_pda.unwrap();

    // Fetch proposal to read params_data for message
    let proposal_data = rpc::fetch_account(&client, &proposal_pda)?;
    if proposal_data.len() < PREFIX_LEN + PROPOSAL_DATA_LEN {
        anyhow::bail!("Invalid proposal account data");
    }
    let pd = &proposal_data[PREFIX_LEN..];
    let status = pd[108]; // status offset: wallet(32)+intent(32)+proposal_index(8)+proposer(32)+approval_bitmap(2)+cancellation_bitmap(2)=108
    if status != STATUS_ACTIVE {
        anyhow::bail!("Proposal is not active (status: {})", status_to_str(status));
    }

    let params_data_len = u16::from_le_bytes([pd[160], pd[161]]) as usize;
    let params_data = &proposal_data[PREFIX_LEN + PROPOSAL_DATA_LEN..PREFIX_LEN + PROPOSAL_DATA_LEN + params_data_len];

    // Fetch intent to render template
    let intent_data = rpc::fetch_account(&client, &intent_pda)?;
    let template = read_template_string(&intent_data).unwrap_or_default();
    let rendered = render_template_with_params(&template, &intent_data, params_data);

    // Build expiry timestamp
    let now = chrono::Utc::now();
    let expiry_time = now + chrono::Duration::seconds(expiry_secs as i64);
    let expiry_str = expiry_time.format("%d %b %Y %H:%M:%S").to_string();

    // Build the offchain message — must match on-chain build_message() format exactly
    let body = format!(
        "approve {} | wallet: {}; proposal: #{}; expires: {}",
        rendered, wallet_name, proposal_index, expiry_str
    );

    let mut message = Vec::new();
    message.extend_from_slice(b"\xffsolana offchain");
    message.push(0); // version
    message.push(0); // format
    message.extend_from_slice(&(body.as_bytes().len() as u16).to_le_bytes());
    message.extend_from_slice(body.as_bytes());

    // Ed25519 instruction
    let ed25519_ix = crate::rpc::build_ed25519_instruction(&payer, &message)?;

    // Approve instruction: disc=11, no additional data
    let ix_data = vec![11u8];

    let instructions_sysvar = solana_sdk::sysvar::instructions::id();

    let accounts = vec![
        AccountMeta::new_readonly(wallet_pubkey, false),
        AccountMeta::new_readonly(intent_pda, false),
        AccountMeta::new(proposal_pda, false),
        AccountMeta::new_readonly(instructions_sysvar, false),
    ];

    let approve_ix = Instruction::new_with_bytes(program_id, &ix_data, accounts);

    let recent_blockhash = client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ed25519_ix, approve_ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );

    let sig = rpc::send_and_confirm(&client, &tx)?;

    println!("{}", "Proposal approved!".green().bold());
    println!("  Wallet:    {}", wallet_pubkey);
    println!("  Proposal:  {} (index {})", proposal_pda, proposal_index);
    println!("  Message:   {}", body);
    println!("  Signature: {}", sig);

    Ok(())
}

fn read_template_string(data: &[u8]) -> Option<String> {
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

fn render_template_with_params(template: &str, intent_data: &[u8], params_data: &[u8]) -> String {
    if intent_data.len() < PREFIX_LEN + INTENT_HEADER_LEN {
        return template.to_string();
    }

    let ih = &intent_data[PREFIX_LEN..];
    let param_count = ih[48] as usize;
    let proposer_count = ih[46] as usize;
    let approver_count = ih[47] as usize;

    let params_offset = PREFIX_LEN + INTENT_HEADER_LEN + (proposer_count * 32) + (approver_count * 32);

    let mut result = template.to_string();
    let mut data_offset = 0usize;

    for i in 0..param_count {
        let entry_offset = params_offset + (i * PARAM_ENTRY_SIZE);
        if entry_offset + PARAM_ENTRY_SIZE > intent_data.len() {
            break;
        }
        let pt = intent_data[entry_offset + 12];

        let value_str = match pt {
            PARAM_TYPE_ADDRESS => {
                if data_offset + 32 <= params_data.len() {
                    let pk = Pubkey::from(<[u8; 32]>::try_from(&params_data[data_offset..data_offset + 32]).unwrap_or([0; 32]));
                    data_offset += 32;
                    pk.to_string()
                } else {
                    "???".to_string()
                }
            }
            PARAM_TYPE_U64 => {
                if data_offset + 8 <= params_data.len() {
                    let v = u64::from_le_bytes(params_data[data_offset..data_offset + 8].try_into().unwrap_or([0; 8]));
                    data_offset += 8;
                    v.to_string()
                } else {
                    "???".to_string()
                }
            }
            PARAM_TYPE_I64 => {
                if data_offset + 8 <= params_data.len() {
                    let v = i64::from_le_bytes(params_data[data_offset..data_offset + 8].try_into().unwrap_or([0; 8]));
                    data_offset += 8;
                    v.to_string()
                } else {
                    "???".to_string()
                }
            }
            PARAM_TYPE_STRING => {
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
            }
            PARAM_TYPE_BOOL => {
                if data_offset < params_data.len() {
                    let v = params_data[data_offset] != 0;
                    data_offset += 1;
                    v.to_string()
                } else {
                    "???".to_string()
                }
            }
            PARAM_TYPE_U8 => {
                if data_offset < params_data.len() {
                    let v = params_data[data_offset];
                    data_offset += 1;
                    v.to_string()
                } else {
                    "???".to_string()
                }
            }
            PARAM_TYPE_U16 => {
                if data_offset + 2 <= params_data.len() {
                    let v = u16::from_le_bytes([params_data[data_offset], params_data[data_offset + 1]]);
                    data_offset += 2;
                    v.to_string()
                } else {
                    "???".to_string()
                }
            }
            PARAM_TYPE_U32 => {
                if data_offset + 4 <= params_data.len() {
                    let v = u32::from_le_bytes(params_data[data_offset..data_offset + 4].try_into().unwrap_or([0; 4]));
                    data_offset += 4;
                    v.to_string()
                } else {
                    "???".to_string()
                }
            }
            PARAM_TYPE_U128 => {
                if data_offset + 16 <= params_data.len() {
                    let v = u128::from_le_bytes(params_data[data_offset..data_offset + 16].try_into().unwrap_or([0; 16]));
                    data_offset += 16;
                    v.to_string()
                } else {
                    "???".to_string()
                }
            }
            _ => "???".to_string(),
        };

        result = result.replace(&format!("{{{}}}", i), &value_str);
    }

    result
}
