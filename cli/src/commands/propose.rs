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
use crate::intent_utils;

pub fn propose(
    wallet_str: &str,
    intent_index: u8,
    params_str: Option<&str>,
    expiry_secs: u64,
    keypair_path: &str,
    url: &str,
) -> Result<()> {
    let client = rpc::create_client(url);
    let payer = rpc::load_keypair(keypair_path)?;
    let program_id = pda::PROGRAM_ID;

    let wallet_pubkey = Pubkey::from_str(wallet_str).context("Invalid wallet address")?;

    // Fetch wallet to get proposal_index and name
    let wallet_data = rpc::fetch_account(&client, &wallet_pubkey)?;
    let w = intent_utils::deserialize_wallet(&wallet_data)?;
    let proposal_index = w.proposal_index;
    let wallet_name = &w.name;

    // Derive intent PDA
    let (intent_pda, _) = pda::find_intent_pda(&wallet_pubkey, intent_index, &program_id);

    // Parse params into bytes
    let params_data = if let Some(ps) = params_str {
        parse_params_to_bytes(ps, &client, &intent_pda)?
    } else {
        Vec::new()
    };

    // Build expiry timestamp
    let expiry_str = intent_utils::format_expiry(expiry_secs);

    // Fetch intent to read template for message rendering
    let intent_data = rpc::fetch_account(&client, &intent_pda)?;
    let h = intent_utils::deserialize_intent_header(&intent_data)?;
    let template = intent_utils::read_template_string(&intent_data);

    // Render template with params matching on-chain format (display_decimals, base58, etc.)
    let rendered = intent_utils::render_template_with_params(
        &template.unwrap_or_default(),
        &intent_data,
        &params_data,
        h.intent_type,
    );

    // Build the offchain message
    let body = format!(
        "propose {} | wallet: {}; proposal: #{}; expires: {}",
        rendered, wallet_name, proposal_index, expiry_str
    );

    let message = intent_utils::build_offchain_message(&payer.pubkey().to_bytes(), &body);

    // Build Ed25519 precompile instruction
    let ed25519_ix = crate::rpc::build_ed25519_instruction(&payer, &message)?;

    // Derive proposal PDA
    let (proposal_pda, _) = pda::find_proposal_pda(&intent_pda, proposal_index, &program_id);

    // Build Lucid propose instruction
    // disc=10 + proposal_index(u64 LE) + params_data
    let mut ix_data = Vec::new();
    ix_data.push(10u8); // Propose discriminator
    ix_data.extend_from_slice(&proposal_index.to_le_bytes());
    ix_data.extend_from_slice(&params_data);

    let instructions_sysvar = solana_sdk::sysvar::instructions::id();

    let accounts = vec![
        AccountMeta::new(wallet_pubkey, false),
        AccountMeta::new(intent_pda, false),
        AccountMeta::new(proposal_pda, false),
        AccountMeta::new_readonly(instructions_sysvar, false),
        AccountMeta::new(payer.pubkey(), true),
        AccountMeta::new_readonly(solana_sdk::system_program::ID, false),
    ];

    let propose_ix = Instruction::new_with_bytes(program_id, &ix_data, accounts);

    let recent_blockhash = client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ed25519_ix, propose_ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );

    let sig = rpc::send_and_confirm(&client, &tx)?;

    println!("{}", "Proposal created!".green().bold());
    println!("  Wallet:    {}", wallet_pubkey);
    println!("  Intent:    {} (index {})", intent_pda, intent_index);
    println!("  Proposal:  {} (index {})", proposal_pda, proposal_index);
    println!("  Message:   {}", body);
    println!("  Expires:   {}", expiry_str);
    println!("  Signature: {}", sig);

    Ok(())
}

fn parse_params_to_bytes(
    params_str: &str,
    client: &solana_client::rpc_client::RpcClient,
    intent_pda: &Pubkey,
) -> Result<Vec<u8>> {
    // Fetch intent to understand param types
    let intent_data = rpc::fetch_account(client, intent_pda)?;
    let h = intent_utils::deserialize_intent_header(&intent_data)?;
    let param_count = h.param_count as usize;

    // Read param entries to get their types
    let params_offset = intent_utils::params_entry_offset(&h);
    let mut param_types = Vec::new();
    for i in 0..param_count {
        let entry_offset = params_offset + (i * PARAM_ENTRY_SIZE);
        if entry_offset + PARAM_ENTRY_SIZE <= intent_data.len() {
            let pt = intent_data[entry_offset + 12]; // param_type offset in ParamEntry
            param_types.push(pt);
        }
    }

    // Parse key=value pairs
    let pairs: Vec<&str> = params_str.split(',').collect();
    let mut result = Vec::new();

    for (i, pair) in pairs.iter().enumerate() {
        let value = if let Some((_k, v)) = pair.split_once('=') {
            v.trim()
        } else {
            pair.trim()
        };

        let pt = if i < param_types.len() {
            param_types[i]
        } else {
            PARAM_TYPE_U64
        };

        match pt {
            PARAM_TYPE_ADDRESS => {
                let pk = Pubkey::from_str(value).context("Invalid address param")?;
                result.extend_from_slice(pk.as_ref());
            }
            PARAM_TYPE_U64 => {
                let v: u64 = value.parse().context("Invalid u64 param")?;
                result.extend_from_slice(&v.to_le_bytes());
            }
            PARAM_TYPE_I64 => {
                let v: i64 = value.parse().context("Invalid i64 param")?;
                result.extend_from_slice(&v.to_le_bytes());
            }
            PARAM_TYPE_STRING => {
                let bytes = value.as_bytes();
                result.extend_from_slice(&(bytes.len() as u16).to_le_bytes());
                result.extend_from_slice(bytes);
            }
            PARAM_TYPE_BOOL => {
                let v: bool = value.parse().context("Invalid bool param")?;
                result.push(if v { 1 } else { 0 });
            }
            PARAM_TYPE_U8 => {
                let v: u8 = value.parse().context("Invalid u8 param")?;
                result.push(v);
            }
            PARAM_TYPE_U16 => {
                let v: u16 = value.parse().context("Invalid u16 param")?;
                result.extend_from_slice(&v.to_le_bytes());
            }
            PARAM_TYPE_U32 => {
                let v: u32 = value.parse().context("Invalid u32 param")?;
                result.extend_from_slice(&v.to_le_bytes());
            }
            PARAM_TYPE_U128 => {
                let v: u128 = value.parse().context("Invalid u128 param")?;
                result.extend_from_slice(&v.to_le_bytes());
            }
            other => {
                anyhow::bail!("Unknown param type {} at index {}", other, i);
            }
        }
    }

    Ok(result)
}

