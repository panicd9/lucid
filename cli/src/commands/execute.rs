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

pub fn execute(
    wallet_str: &str,
    proposal_index: u64,
    keypair_path: &str,
    url: &str,
) -> Result<()> {
    let client = rpc::create_client(url);
    let payer = rpc::load_keypair(keypair_path)?;
    let program_id = pda::PROGRAM_ID;

    let wallet_pubkey = Pubkey::from_str(wallet_str).context("Invalid wallet address")?;

    // Fetch wallet
    let wallet_data = rpc::fetch_account(&client, &wallet_pubkey)?;
    if wallet_data.len() < PREFIX_LEN + WALLET_DATA_LEN {
        anyhow::bail!("Invalid wallet account data");
    }
    let wd = &wallet_data[PREFIX_LEN..];
    let intent_count = wd[8];

    // Find proposal by scanning intents
    let (intent_pda, proposal_pda, proposal_data) =
        intent_utils::find_proposal_for_wallet(&client, &wallet_pubkey, proposal_index, intent_count, &program_id)?;

    // Determine intent index from the PDA
    let mut found_intent_index = 0u8;
    for i in 0..intent_count {
        let (ipda, _) = pda::find_intent_pda(&wallet_pubkey, i, &program_id);
        if ipda == intent_pda {
            found_intent_index = i;
            break;
        }
    }

    // Verify proposal is approved
    let pd = &proposal_data[PREFIX_LEN..];
    let status = pd[108];
    if status != STATUS_APPROVED {
        anyhow::bail!(
            "Proposal is not approved (status: {})",
            status_to_str(status)
        );
    }

    // Fetch intent to determine type and remaining accounts
    let intent_data = rpc::fetch_account(&client, &intent_pda)?;
    if intent_data.len() < PREFIX_LEN + INTENT_HEADER_LEN {
        anyhow::bail!("Invalid intent account data");
    }
    let ih = &intent_data[PREFIX_LEN..];
    let intent_type = ih[42];

    // Derive vault and event authority
    let (vault_pda, _) = pda::find_vault_pda(&wallet_pubkey, &program_id);
    let (event_authority, _) = pda::find_event_authority_pda(&program_id);

    // Build execute instruction: disc=20 (no additional data)
    let ix_data = vec![20u8];

    // Base accounts: [wallet, vault, intent, proposal, event_authority, program]
    let mut accounts = vec![
        AccountMeta::new(wallet_pubkey, false),
        AccountMeta::new(vault_pda, false),
        AccountMeta::new(intent_pda, false),
        AccountMeta::new(proposal_pda, false),
        AccountMeta::new_readonly(event_authority, false),
        AccountMeta::new_readonly(program_id, false),
    ];

    // Add remaining accounts based on intent type
    match intent_type {
        INTENT_TYPE_CUSTOM => {
            // For custom intents, we need to add the CPI accounts
            let remaining = build_remaining_accounts_for_custom(
                &intent_data,
                &proposal_data,
                &wallet_pubkey,
                &vault_pda,
                &program_id,
            )?;
            accounts.extend(remaining);
        }
        INTENT_TYPE_ADD => {
            // Meta-add: need new_intent PDA, payer, system_program
            let new_intent_index = wd[8]; // current intent_count (will be the new index)
            let (new_intent_pda, _) =
                pda::find_intent_pda(&wallet_pubkey, new_intent_index, &program_id);
            accounts.push(AccountMeta::new(new_intent_pda, false));
            accounts.push(AccountMeta::new(payer.pubkey(), true));
            accounts.push(AccountMeta::new_readonly(solana_sdk::system_program::ID, false));
        }
        INTENT_TYPE_REMOVE | INTENT_TYPE_UPDATE => {
            // Meta-remove/update: need target_intent account
            // The target index is in the first byte of params_data
            let params_data_len = u16::from_le_bytes([pd[160], pd[161]]) as usize;
            if params_data_len > 0 {
                let target_index = proposal_data[PREFIX_LEN + PROPOSAL_DATA_LEN];
                let (target_intent_pda, _) =
                    pda::find_intent_pda(&wallet_pubkey, target_index, &program_id);
                accounts.push(AccountMeta::new(target_intent_pda, false));
            }
        }
        _ => {}
    }

    let ix = Instruction::new_with_bytes(program_id, &ix_data, accounts);

    let recent_blockhash = client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );

    let sig = rpc::send_and_confirm(&client, &tx)?;

    println!("{}", "Proposal executed!".green().bold());
    println!("  Wallet:    {}", wallet_pubkey);
    println!("  Intent:    {} (index {})", intent_pda, found_intent_index);
    println!("  Proposal:  {} (index {})", proposal_pda, proposal_index);
    println!("  Signature: {}", sig);

    Ok(())
}

fn build_remaining_accounts_for_custom(
    intent_data: &[u8],
    proposal_data: &[u8],
    _wallet_pubkey: &Pubkey,
    vault_pda: &Pubkey,
    _program_id: &Pubkey,
) -> Result<Vec<AccountMeta>> {
    let ih = &intent_data[PREFIX_LEN..];
    let proposer_count = ih[46] as usize;
    let approver_count = ih[47] as usize;
    let param_count = ih[48] as usize;
    let account_count = ih[49] as usize;
    let instruction_count = ih[50] as usize;
    let data_segment_count = ih[51] as usize;
    let seed_count = ih[52] as usize;

    let accounts_offset = PREFIX_LEN + INTENT_HEADER_LEN
        + (proposer_count * 32)
        + (approver_count * 32)
        + (param_count * PARAM_ENTRY_SIZE);

    let params_data_start = PREFIX_LEN + PROPOSAL_DATA_LEN;
    let pd = &proposal_data[PREFIX_LEN..];
    let params_data_len = u16::from_le_bytes([pd[160], pd[161]]) as usize;
    let params_data = &proposal_data[params_data_start..params_data_start + params_data_len];

    // Build byte_pool offset for reading static addresses
    let bp_offset = PREFIX_LEN + INTENT_HEADER_LEN
        + (proposer_count * 32)
        + (approver_count * 32)
        + (param_count * PARAM_ENTRY_SIZE)
        + (account_count * ACCOUNT_ENTRY_SIZE)
        + (instruction_count * INSTRUCTION_ENTRY_SIZE)
        + (data_segment_count * DATA_SEGMENT_ENTRY_SIZE)
        + (seed_count * SEED_ENTRY_SIZE);

    let mut remaining = Vec::new();

    // Read instruction entry to find which accounts are needed
    let ix_offset = accounts_offset + (account_count * ACCOUNT_ENTRY_SIZE);
    if ix_offset + INSTRUCTION_ENTRY_SIZE > intent_data.len() {
        return Ok(remaining);
    }

    // Read all account entries and resolve addresses
    for a in 0..account_count {
        let entry_offset = accounts_offset + (a * ACCOUNT_ENTRY_SIZE);
        if entry_offset + ACCOUNT_ENTRY_SIZE > intent_data.len() {
            break;
        }

        let source = intent_data[entry_offset];
        let writable = intent_data[entry_offset + 1] == 1;
        let is_signer = intent_data[entry_offset + 2] == 1;
        let source_data = &intent_data[entry_offset + 4..entry_offset + 8];

        let address = match source {
            SOURCE_STATIC => {
                let pool_off = u16::from_le_bytes([source_data[0], source_data[1]]) as usize;
                if bp_offset + pool_off + 32 <= intent_data.len() {
                    Pubkey::from(<[u8; 32]>::try_from(
                        &intent_data[bp_offset + pool_off..bp_offset + pool_off + 32],
                    )?)
                } else {
                    continue;
                }
            }
            SOURCE_PARAM => {
                let param_idx = source_data[0] as usize;
                // Read the address from params_data at the right offset
                let addr = read_param_address(intent_data, params_data, param_idx, proposer_count, approver_count)?;
                addr
            }
            SOURCE_VAULT => *vault_pda,
            SOURCE_PDA => {
                // For PDA resolution, we'd need to resolve seeds.
                // For hackathon simplicity, skip complex PDA resolution in remaining accounts.
                // The user can add them manually if needed.
                continue;
            }
            _ => continue,
        };

        if writable {
            if is_signer {
                remaining.push(AccountMeta::new(address, true));
            } else {
                remaining.push(AccountMeta::new(address, false));
            }
        } else {
            if is_signer {
                remaining.push(AccountMeta::new_readonly(address, true));
            } else {
                remaining.push(AccountMeta::new_readonly(address, false));
            }
        }
    }

    Ok(remaining)
}

fn read_param_address(
    intent_data: &[u8],
    params_data: &[u8],
    param_idx: usize,
    proposer_count: usize,
    approver_count: usize,
) -> Result<Pubkey> {
    let params_entry_offset =
        PREFIX_LEN + INTENT_HEADER_LEN + (proposer_count * 32) + (approver_count * 32);

    // Walk through params_data to find the offset for param_idx
    let mut offset = 0usize;
    for i in 0..param_idx {
        let entry_off = params_entry_offset + (i * PARAM_ENTRY_SIZE);
        if entry_off + PARAM_ENTRY_SIZE > intent_data.len() {
            anyhow::bail!("Param entry out of bounds");
        }
        let pt = intent_data[entry_off + 12];
        let size = param_type_size(pt);
        if size == 0 {
            // String: u16 len + bytes
            if offset + 2 > params_data.len() {
                anyhow::bail!("Params data too short");
            }
            let slen =
                u16::from_le_bytes([params_data[offset], params_data[offset + 1]]) as usize;
            offset += 2 + slen;
        } else {
            offset += size;
        }
    }

    if offset + 32 > params_data.len() {
        anyhow::bail!("Address param out of bounds");
    }
    Ok(Pubkey::from(<[u8; 32]>::try_from(
        &params_data[offset..offset + 32],
    )?))
}
