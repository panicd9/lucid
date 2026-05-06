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
    let w = intent_utils::deserialize_wallet(&wallet_data)?;
    let wallet_name = &w.name;
    let intent_count = w.intent_count;

    // Find proposal by scanning intents
    let (intent_pda, proposal_pda, proposal_data) =
        intent_utils::find_proposal_for_wallet(&client, &wallet_pubkey, proposal_index, intent_count, &program_id)?;

    let pd = &proposal_data[PREFIX_LEN..];
    let status = pd[108];
    if status != STATUS_ACTIVE {
        anyhow::bail!("Proposal is not active (status: {})", status_to_str(status));
    }

    let params_data_len = u16::from_le_bytes([pd[160], pd[161]]) as usize;
    let params_data = &proposal_data[PREFIX_LEN + PROPOSAL_DATA_LEN..PREFIX_LEN + PROPOSAL_DATA_LEN + params_data_len];

    // Fetch intent to render template
    let intent_data = rpc::fetch_account(&client, &intent_pda)?;
    let template = intent_utils::read_template_string(&intent_data).unwrap_or_default();
    let intent_type = intent_data[PREFIX_LEN + 74];
    let rendered = intent_utils::render_template_with_params(&template, &intent_data, params_data, intent_type);

    // Build expiry timestamp
    let expiry_str = intent_utils::format_expiry(expiry_secs);

    // Build the offchain message
    let body = format!(
        "approve {} | wallet: {} ({}); proposal: #{}; expires: {};",
        rendered, wallet_name, wallet_pubkey, proposal_index, expiry_str
    );

    let message = intent_utils::build_offchain_message(&payer.pubkey().to_bytes(), &body);

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
