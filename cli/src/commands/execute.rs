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
    let w = intent_utils::deserialize_wallet(&wallet_data)?;

    // Find proposal by scanning intents
    let (intent_pda, proposal_pda, proposal_data) =
        intent_utils::find_proposal_for_wallet(&client, &wallet_pubkey, proposal_index, w.intent_count, &program_id)?;

    // Determine intent index from the PDA
    let mut found_intent_index = 0u8;
    for i in 0..w.intent_count {
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
    let ih = intent_utils::deserialize_intent_header(&intent_data)?;
    let intent_type = ih.intent_type;

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
                &client,
            )?;
            accounts.extend(remaining);
        }
        INTENT_TYPE_ADD => {
            // Meta-add: need new_intent PDA, payer, system_program
            let new_intent_index = w.intent_count; // current intent_count (will be the new index)
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
    client: &solana_client::rpc_client::RpcClient,
) -> Result<Vec<AccountMeta>> {
    let h = intent_utils::deserialize_intent_header(intent_data)?;
    let account_count = h.account_count as usize;
    let accounts_offset = intent_utils::accounts_entry_offset(&h);
    let bp_offset = intent_utils::byte_pool_offset(&h);
    let seeds_offset = intent_utils::seeds_offset(&h);

    let params_data_start = PREFIX_LEN + PROPOSAL_DATA_LEN;
    let pd = &proposal_data[PREFIX_LEN..];
    let params_data_len = u16::from_le_bytes([pd[160], pd[161]]) as usize;
    let params_data = &proposal_data[params_data_start..params_data_start + params_data_len];

    // Cache fetched account data so a single source account referenced by
    // multiple SEED_ACCOUNT_FIELD seeds (e.g. deposit reads pool twice)
    // doesn't trigger duplicate RPC round-trips.
    let mut account_data_cache: std::collections::HashMap<Pubkey, Vec<u8>> =
        std::collections::HashMap::new();

    let mut remaining: Vec<AccountMeta> = Vec::new();

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
                if bp_offset + pool_off + 32 > intent_data.len() {
                    continue;
                }
                Pubkey::from(<[u8; 32]>::try_from(
                    &intent_data[bp_offset + pool_off..bp_offset + pool_off + 32],
                )?)
            }
            SOURCE_PARAM => {
                let param_idx = source_data[0] as usize;
                read_param_address(intent_data, params_data, param_idx, &h)?
            }
            SOURCE_VAULT => *vault_pda,
            SOURCE_PDA => {
                let seed_start = source_data[0] as usize;
                let pda_seed_count = source_data[1] as usize;
                let prog_off = u16::from_le_bytes([source_data[2], source_data[3]]) as usize;

                if bp_offset + prog_off + 32 > intent_data.len() {
                    continue;
                }
                let prog_pubkey = Pubkey::from(<[u8; 32]>::try_from(
                    &intent_data[bp_offset + prog_off..bp_offset + prog_off + 32],
                )?);

                let mut seed_buffers: Vec<Vec<u8>> = Vec::with_capacity(pda_seed_count);
                for s in 0..pda_seed_count {
                    let seed_entry_off = seeds_offset + (seed_start + s) * SEED_ENTRY_SIZE;
                    if seed_entry_off + SEED_ENTRY_SIZE > intent_data.len() {
                        anyhow::bail!("Seed entry out of bounds");
                    }
                    let seed_type = intent_data[seed_entry_off];
                    let seed_data = &intent_data[seed_entry_off + 2..seed_entry_off + 6];

                    let seed_bytes: Vec<u8> = match seed_type {
                        SEED_LITERAL => {
                            let lit_off = u16::from_le_bytes([seed_data[0], seed_data[1]]) as usize;
                            let lit_len = u16::from_le_bytes([seed_data[2], seed_data[3]]) as usize;
                            if bp_offset + lit_off + lit_len > intent_data.len() {
                                anyhow::bail!("Seed literal out of bounds");
                            }
                            intent_data[bp_offset + lit_off..bp_offset + lit_off + lit_len].to_vec()
                        }
                        SEED_PARAM => {
                            let pi = seed_data[0] as usize;
                            read_param_bytes(intent_data, params_data, pi, &h)?
                        }
                        SEED_ACCOUNT => {
                            let ai = seed_data[0] as usize;
                            if ai >= remaining.len() {
                                anyhow::bail!("Seed account index {} out of range", ai);
                            }
                            remaining[ai].pubkey.to_bytes().to_vec()
                        }
                        SEED_ACCOUNT_FIELD => {
                            let ai = seed_data[0] as usize;
                            let plan_off = u16::from_le_bytes([seed_data[1], seed_data[2]]) as usize;
                            let target_len = seed_data[3] as usize;
                            if target_len == 0 || target_len > 32 {
                                anyhow::bail!("Seed account_field target_len must be 1..=32, got {}", target_len);
                            }
                            if ai >= remaining.len() {
                                anyhow::bail!("Seed account_field index {} out of range", ai);
                            }

                            // Read plan from intent's byte_pool.
                            if bp_offset + plan_off + 1 > intent_data.len() {
                                anyhow::bail!("plan_offset out of bounds");
                            }
                            let count = intent_data[bp_offset + plan_off] as usize;
                            let plan_bytes_off = bp_offset + plan_off + 1;
                            if plan_bytes_off + count * 3 > intent_data.len() {
                                anyhow::bail!("plan body out of bounds");
                            }
                            let plan_bytes = &intent_data[plan_bytes_off..plan_bytes_off + count * 3];

                            let src_pubkey = remaining[ai].pubkey;
                            if !account_data_cache.contains_key(&src_pubkey) {
                                let data = crate::rpc::fetch_account(client, &src_pubkey)
                                    .with_context(|| format!(
                                        "fetch account {} for SEED_ACCOUNT_FIELD",
                                        src_pubkey
                                    ))?;
                                account_data_cache.insert(src_pubkey, data);
                            }
                            let acct_data = &account_data_cache[&src_pubkey];

                            let mut o: usize = 8;
                            for i in 0..count {
                                let p = i * 3;
                                let op = plan_bytes[p];
                                let size = u16::from_le_bytes([plan_bytes[p + 1], plan_bytes[p + 2]]) as usize;
                                match op {
                                    FIELD_OP_SKIP_FIXED => {
                                        o = o.checked_add(size).ok_or_else(||
                                            anyhow::anyhow!("plan offset overflow"))?;
                                        if o > acct_data.len() {
                                            anyhow::bail!("plan SKIP_FIXED past end of data");
                                        }
                                    }
                                    FIELD_OP_SKIP_OPTION => {
                                        if o >= acct_data.len() {
                                            anyhow::bail!("plan SKIP_OPTION read past end");
                                        }
                                        let tag = acct_data[o];
                                        o += 1;
                                        if tag != 0 {
                                            o = o.checked_add(size).ok_or_else(||
                                                anyhow::anyhow!("plan offset overflow"))?;
                                            if o > acct_data.len() {
                                                anyhow::bail!("plan SKIP_OPTION Some past end");
                                            }
                                        }
                                    }
                                    _ => anyhow::bail!("unknown plan op {}", op),
                                }
                            }

                            if o + target_len > acct_data.len() {
                                anyhow::bail!(
                                    "SEED_ACCOUNT_FIELD slice [{}, {}) exceeds account data len {}",
                                    o, o + target_len, acct_data.len()
                                );
                            }
                            acct_data[o..o + target_len].to_vec()
                        }
                        _ => anyhow::bail!("Unknown seed type {}", seed_type),
                    };
                    seed_buffers.push(seed_bytes);
                }

                let seed_refs: Vec<&[u8]> = seed_buffers.iter().map(|s| s.as_slice()).collect();
                let (pda, _) = Pubkey::find_program_address(&seed_refs, &prog_pubkey);
                pda
            }
            SOURCE_HAS_ONE => {
                // HAS_ONE references another account's data — would require an extra RPC fetch.
                // Skip for now; if a real intent uses it, this path needs implementation.
                continue;
            }
            _ => continue,
        };

        // Vault, PDA, and HAS_ONE accounts cannot be signed by the outer transaction:
        // - VAULT and PDA sign via invoke_signed in the CPI
        // - HAS_ONE has no associated keypair on the client side
        let outer_signer = is_signer
            && source != SOURCE_VAULT
            && source != SOURCE_PDA
            && source != SOURCE_HAS_ONE;

        if writable {
            remaining.push(AccountMeta::new(address, outer_signer));
        } else {
            remaining.push(AccountMeta::new_readonly(address, outer_signer));
        }
    }

    Ok(remaining)
}

/// Walk params_data to extract the raw bytes for a given param index.
/// Mirrors on-chain `read_param_bytes`.
fn read_param_bytes(
    intent_data: &[u8],
    params_data: &[u8],
    param_idx: usize,
    h: &intent_utils::IntentHeaderInfo,
) -> Result<Vec<u8>> {
    let params_entry_offset = intent_utils::params_entry_offset(h);
    let param_count = h.param_count as usize;

    if param_idx >= param_count {
        anyhow::bail!("Param index {} out of range", param_idx);
    }

    let mut offset = 0usize;
    for i in 0..=param_idx {
        let entry_off = params_entry_offset + (i * PARAM_ENTRY_SIZE);
        if entry_off + PARAM_ENTRY_SIZE > intent_data.len() {
            anyhow::bail!("Param entry out of bounds");
        }
        let pt = intent_data[entry_off + 12];
        let size = param_type_size(pt);

        if i == param_idx {
            if size == 0 {
                if offset + 2 > params_data.len() {
                    anyhow::bail!("Params data too short");
                }
                let slen = u16::from_le_bytes([params_data[offset], params_data[offset + 1]]) as usize;
                if offset + 2 + slen > params_data.len() {
                    anyhow::bail!("String param out of bounds");
                }
                return Ok(params_data[offset..offset + 2 + slen].to_vec());
            } else {
                if offset + size > params_data.len() {
                    anyhow::bail!("Param value out of bounds");
                }
                return Ok(params_data[offset..offset + size].to_vec());
            }
        }

        if size == 0 {
            if offset + 2 > params_data.len() {
                anyhow::bail!("Params data too short");
            }
            let slen = u16::from_le_bytes([params_data[offset], params_data[offset + 1]]) as usize;
            offset += 2 + slen;
        } else {
            offset += size;
        }
    }

    unreachable!("Loop should always return for valid param_idx")
}

fn read_param_address(
    intent_data: &[u8],
    params_data: &[u8],
    param_idx: usize,
    h: &intent_utils::IntentHeaderInfo,
) -> Result<Pubkey> {
    let params_entry_offset = intent_utils::params_entry_offset(h);

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
