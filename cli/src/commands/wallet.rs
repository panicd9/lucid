use anyhow::{Context, Result};
use colored::Colorize;
use sha2::{Digest, Sha256};
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    transaction::Transaction,
};
use std::str::FromStr;

use crate::pda;
use crate::rpc;
use crate::types::*;
use crate::intent_utils;

pub fn create(
    name: &str,
    proposers_str: &str,
    approvers_str: &str,
    approval_threshold: u8,
    cancellation_threshold: u8,
    timelock: u32,
    create_key_str: Option<&str>,
    keypair_path: &str,
    url: &str,
) -> Result<()> {
    let client = rpc::create_client(url);
    let payer = rpc::load_keypair(keypair_path)?;
    let program_id = pda::PROGRAM_ID;

    let name_bytes = name.as_bytes();
    if name_bytes.len() > 32 || name_bytes.is_empty() {
        anyhow::bail!("Name must be 1-32 bytes");
    }

    let proposers: Vec<Pubkey> = proposers_str
        .split(',')
        .map(|s| Pubkey::from_str(s.trim()).context("Invalid proposer pubkey"))
        .collect::<Result<_>>()?;

    let approvers: Vec<Pubkey> = approvers_str
        .split(',')
        .map(|s| Pubkey::from_str(s.trim()).context("Invalid approver pubkey"))
        .collect::<Result<_>>()?;

    if proposers.is_empty() || proposers.len() > 16 {
        anyhow::bail!("Proposer count must be 1-16");
    }
    if approvers.is_empty() || approvers.len() > 16 {
        anyhow::bail!("Approver count must be 1-16");
    }

    // Use provided create_key or generate a random one
    let create_key = match create_key_str {
        Some(s) => Pubkey::from_str(s).context("Invalid create-key pubkey")?,
        None => Keypair::new().pubkey(),
    };

    // Build instruction data: [disc=0, create_key(32), name_len, name_bytes, proposer_count,
    //   proposer_pubkeys, approver_count, approver_pubkeys, approval_threshold,
    //   cancellation_threshold, timelock_seconds(u32 LE)]
    let mut data = Vec::new();
    data.push(0u8); // discriminator
    data.extend_from_slice(create_key.as_ref());
    data.push(name_bytes.len() as u8);
    data.extend_from_slice(name_bytes);
    data.push(proposers.len() as u8);
    for p in &proposers {
        data.extend_from_slice(p.as_ref());
    }
    data.push(approvers.len() as u8);
    for a in &approvers {
        data.extend_from_slice(a.as_ref());
    }
    data.push(approval_threshold);
    data.push(cancellation_threshold);
    data.extend_from_slice(&timelock.to_le_bytes());

    // Derive PDAs
    let (wallet_pda, _) = pda::find_wallet_pda(&create_key, &program_id);
    let (vault_pda, _) = pda::find_vault_pda(&wallet_pda, &program_id);
    let (intent0, _) = pda::find_intent_pda(&wallet_pda, 0, &program_id);
    let (intent1, _) = pda::find_intent_pda(&wallet_pda, 1, &program_id);
    let (intent2, _) = pda::find_intent_pda(&wallet_pda, 2, &program_id);

    let accounts = vec![
        AccountMeta::new(wallet_pda, false),
        AccountMeta::new(vault_pda, false),
        AccountMeta::new(intent0, false),
        AccountMeta::new(intent1, false),
        AccountMeta::new(intent2, false),
        AccountMeta::new(payer.pubkey(), true),
        AccountMeta::new_readonly(solana_sdk::system_program::ID, false),
    ];

    let ix = Instruction::new_with_bytes(program_id, &data, accounts);
    let recent_blockhash = client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );

    let sig = rpc::send_and_confirm(&client, &tx)?;

    println!("{}", "Wallet created successfully!".green().bold());
    println!("  Name:      {}", name);
    println!("  Wallet:    {}", wallet_pda);
    println!("  Vault:     {}", vault_pda);
    println!("  Signature: {}", sig);

    Ok(())
}

pub fn show(wallet_str: &str, url: &str) -> Result<()> {
    let client = rpc::create_client(url);
    let program_id = pda::PROGRAM_ID;

    let wallet_pubkey = Pubkey::from_str(wallet_str)
        .context("Wallet must be a base58 address (name-based lookup not supported — use the address from 'wallet create')")?;

    let data = rpc::fetch_account(&client, &wallet_pubkey)?;
    let w = intent_utils::deserialize_wallet(&data)?;

    let (vault_pda, _) = pda::find_vault_pda(&wallet_pubkey, &program_id);

    println!("{}", "=== Lucid Wallet ===".cyan().bold());
    println!("  Name:             {}", w.name.white().bold());
    println!("  Create Key:       {}", w.create_key);
    println!("  Address:          {}", wallet_pubkey);
    println!("  Vault:            {}", vault_pda);
    println!(
        "  Frozen:           {}",
        if w.frozen {
            "Yes".red().bold()
        } else {
            "No".green().bold()
        }
    );
    println!("  Proposal Index:   {}", w.proposal_index);
    println!("  Intent Count:     {}", w.intent_count);

    // Fetch and display intents
    println!("\n{}", "--- Intents ---".cyan());
    for i in 0..w.intent_count {
        let (intent_pda, _) = pda::find_intent_pda(&wallet_pubkey, i, &program_id);
        match rpc::fetch_account(&client, &intent_pda) {
            Ok(idata) => {
                let h = match intent_utils::deserialize_intent_header(&idata) {
                    Ok(h) => h,
                    Err(_) => { println!("  [{}] {} (data too small)", i, intent_pda); continue; }
                };

                let template = intent_utils::read_template_string(&idata);

                let status_str = if h.approved == 1 {
                    "Active".green()
                } else {
                    "Deactivated".red()
                };

                println!(
                    "  [{}] {} | type: {} | {} | timelock: {}s | threshold: {}/{} | proposers: {} | approvers: {}",
                    h.intent_index,
                    intent_pda.to_string().dimmed(),
                    intent_type_to_str(h.intent_type).yellow(),
                    status_str,
                    h.timelock_seconds,
                    h.approval_threshold,
                    h.cancellation_threshold,
                    h.proposer_count,
                    h.approver_count,
                );
                if let Some(tmpl) = template {
                    println!("       Template: {}", tmpl.white());
                }

                for (p, pk) in intent_utils::read_proposers(&idata, &h).iter().enumerate() {
                    println!("       Proposer {}: {}", p, pk);
                }
                for (a, pk) in intent_utils::read_approvers(&idata, &h).iter().enumerate() {
                    println!("       Approver {}: {}", a, pk);
                }
            }
            Err(e) => {
                println!("  [{}] Failed to fetch: {}", i, e);
            }
        }
    }

    Ok(())
}

pub fn freeze(wallet_str: &str, keypair_path: &str, url: &str) -> Result<()> {
    let client = rpc::create_client(url);
    let payer = rpc::load_keypair(keypair_path)?;
    let program_id = pda::PROGRAM_ID;

    let wallet_pubkey = Pubkey::from_str(wallet_str).context("Invalid wallet address")?;

    // Instruction data: [disc=4]
    let data = vec![4u8];

    // Derive meta_intent (intent index 0) - required by on-chain freeze_wallet
    let (meta_intent, _) = pda::find_intent_pda(&wallet_pubkey, 0, &program_id);

    let accounts = vec![
        AccountMeta::new(wallet_pubkey, false),
        AccountMeta::new_readonly(meta_intent, false),
        AccountMeta::new(payer.pubkey(), true),
    ];

    let ix = Instruction::new_with_bytes(program_id, &data, accounts);
    let recent_blockhash = client.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[&payer],
        recent_blockhash,
    );

    let sig = rpc::send_and_confirm(&client, &tx)?;

    println!("{}", "Wallet frozen!".red().bold());
    println!("  Wallet:    {}", wallet_pubkey);
    println!("  Signature: {}", sig);

    Ok(())
}

pub fn add_intents(
    wallet_str: &str,
    intents_path: &str,
    proposers_str: Option<&str>,
    approvers_str: Option<&str>,
    approval_threshold: Option<u8>,
    cancellation_threshold: Option<u8>,
    keypair_path: &str,
    url: &str,
) -> Result<()> {
    let client = rpc::create_client(url);
    let payer = rpc::load_keypair(keypair_path)?;
    let program_id = pda::PROGRAM_ID;

    let wallet_pubkey = Pubkey::from_str(wallet_str)
        .context("Wallet must be a base58 address")?;

    // Collect intent file paths — single file or directory
    let path = std::path::Path::new(intents_path);
    let file_paths: Vec<std::path::PathBuf> = if path.is_file() {
        vec![path.to_path_buf()]
    } else {
        let mut entries: Vec<_> = std::fs::read_dir(intents_path)?
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "json")
                    .unwrap_or(false)
            })
            .map(|e| e.path())
            .collect();
        entries.sort();
        entries
    };

    if file_paths.is_empty() {
        anyhow::bail!("No JSON files found in {}", intents_path);
    }

    // Fetch current wallet to get intent_count
    let wallet_data = rpc::fetch_account(&client, &wallet_pubkey)?;
    let w = intent_utils::deserialize_wallet(&wallet_data)?;
    let mut current_intent_count = w.intent_count;

    // Fetch meta-intent[0] (Add) as fallback for proposer/approver lists
    let (meta_intent_pda, _) = pda::find_intent_pda(&wallet_pubkey, 0, &program_id);
    let meta_data = rpc::fetch_account(&client, &meta_intent_pda)
        .context("Failed to fetch meta-intent[0] — wallet may not be initialized")?;
    let mh = intent_utils::deserialize_intent_header(&meta_data)?;
    let default_proposers: Vec<u8> = intent_utils::read_proposers(&meta_data, &mh)
        .iter().flat_map(|pk| pk.to_bytes()).collect();
    let default_approvers: Vec<u8> = intent_utils::read_approvers(&meta_data, &mh)
        .iter().flat_map(|pk| pk.to_bytes()).collect();

    // CLI overrides take priority, then fall back to wallet meta-intent defaults
    let final_proposer_bytes = if let Some(ps) = proposers_str {
        let mut bytes = Vec::new();
        for p in ps.split(',') {
            let pk = Pubkey::from_str(p.trim()).context("Invalid proposer address")?;
            bytes.extend_from_slice(pk.as_ref());
        }
        bytes
    } else {
        default_proposers
    };

    let final_approver_bytes = if let Some(aps) = approvers_str {
        let mut bytes = Vec::new();
        for a in aps.split(',') {
            let pk = Pubkey::from_str(a.trim()).context("Invalid approver address")?;
            bytes.extend_from_slice(pk.as_ref());
        }
        bytes
    } else {
        default_approvers
    };

    let final_approval_threshold = approval_threshold.unwrap_or(mh.approval_threshold);
    let final_cancellation_threshold = cancellation_threshold.unwrap_or(mh.cancellation_threshold);

    println!(
        "Adding {} intent(s) to wallet {} (current count: {})",
        file_paths.len(),
        wallet_pubkey,
        current_intent_count
    );

    for path in &file_paths {
        let content = std::fs::read_to_string(path)?;

        let intent_def: IntentDefinition =
            serde_json::from_str(&content).with_context(|| format!("Failed to parse {}", path.display()))?;

        let intent_bytes = build_intent_bytes(
            &intent_def,
            final_approval_threshold,
            final_cancellation_threshold,
            &final_proposer_bytes,
            &final_approver_bytes,
        )?;

        // Hash the serialized byte definition (what goes on-chain), not the JSON source
        let mut hasher = Sha256::new();
        hasher.update(&intent_bytes);
        let hash = hasher.finalize();
        let hash_hex = format!("{:x}", hash);
        let hash_short = &hash_hex[..16];

        let (intent_pda, _) =
            pda::find_intent_pda(&wallet_pubkey, current_intent_count, &program_id);
        // The ADD meta-intent (index 0) is the on-chain authority anchor for
        // setup-phase intent additions; the program reads its approver list
        // to verify the signer is allowed to add intents.
        let (add_meta_pda, _) = pda::find_intent_pda(&wallet_pubkey, 0, &program_id);

        // Build AddIntent instruction: [disc=1, intent_data...]
        let mut data = Vec::new();
        data.push(1u8); // AddIntent discriminator
        data.extend_from_slice(&intent_bytes);

        let accounts = vec![
            AccountMeta::new(wallet_pubkey, false),
            AccountMeta::new(intent_pda, false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(solana_sdk::system_program::ID, false),
            AccountMeta::new_readonly(add_meta_pda, false),
        ];

        let ix = Instruction::new_with_bytes(program_id, &data, accounts);
        let recent_blockhash = client.get_latest_blockhash()?;
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&payer.pubkey()),
            &[&payer],
            recent_blockhash,
        );

        let sig = rpc::send_and_confirm(&client, &tx)?;
        println!(
            "  {} Added intent [{}] {} (sha256:{}) - {}",
            "OK".green(),
            current_intent_count,
            intent_def.instruction_name,
            hash_short,
            sig
        );

        current_intent_count += 1;
    }

    println!(
        "{}",
        format!("Successfully added {} intent(s)", file_paths.len())
            .green()
            .bold()
    );
    Ok(())
}

/// Build the on-chain byte representation of an intent (everything after the 2-byte prefix)
pub fn build_intent_bytes(
    def: &IntentDefinition,
    approval_threshold: u8,
    cancellation_threshold: u8,
    proposer_bytes: &[u8],
    approver_bytes: &[u8],
) -> Result<Vec<u8>> {
    let program_id_bytes = bs58::decode(&def.program_id)
        .into_vec()
        .context("Invalid programId")?;
    if program_id_bytes.len() != 32 {
        anyhow::bail!("programId must be 32 bytes");
    }

    // Build byte pool
    let mut byte_pool = Vec::new();
    let _pool_entries: Vec<(usize, usize)> = Vec::new(); // (offset, len) for each literal

    // Template goes first in byte pool: [template_offset:u16, template_len:u16, ...template_bytes...]
    let template_bytes = def.template.as_bytes();

    // Collect all static addresses and literals that need to go into byte_pool
    let mut static_addresses: Vec<(usize, Vec<u8>)> = Vec::new(); // (account_index, address_bytes)

    // First collect all literal data segments and static account addresses
    let mut literal_segments: Vec<Vec<u8>> = Vec::new();
    for seg in &def.data_segments {
        if seg.segment_type == "literal" {
            if let Some(data) = &seg.data {
                let bytes: Vec<u8> = if let Some(arr) = data.as_array() {
                    arr.iter()
                        .map(|v| v.as_u64().unwrap_or(0) as u8)
                        .collect()
                } else if let Some(s) = data.as_str() {
                    hex::decode(s).unwrap_or_default()
                } else {
                    Vec::new()
                };
                literal_segments.push(bytes);
            } else {
                literal_segments.push(Vec::new());
            }
        }
    }

    // Collect static account addresses
    for (i, acct) in def.accounts.iter().enumerate() {
        if acct.source == "static" {
            if let Some(sd) = &acct.source_data {
                if let Some(addr_str) = sd.as_str() {
                    let addr_bytes = bs58::decode(addr_str).into_vec().unwrap_or_default();
                    if addr_bytes.len() == 32 {
                        static_addresses.push((i, addr_bytes));
                    }
                }
            }
        }
    }

    // Collect PDA program addresses
    let mut pda_program_addresses: Vec<(usize, Vec<u8>)> = Vec::new();
    for (i, acct) in def.accounts.iter().enumerate() {
        if acct.source == "pda" {
            if let Some(sd) = &acct.source_data {
                if let Some(obj) = sd.as_object() {
                    if let Some(prog) = obj.get("program") {
                        if let Some(prog_str) = prog.as_str() {
                            let prog_bytes = bs58::decode(prog_str).into_vec().unwrap_or_default();
                            if prog_bytes.len() == 32 {
                                pda_program_addresses.push((i, prog_bytes));
                            }
                        }
                    }
                }
            }
        }
    }

    // Seed literals
    let mut seed_literals: Vec<Vec<u8>> = Vec::new();
    for seed in &def.seeds {
        if seed.seed_type == "literal" {
            if let Some(val) = &seed.value {
                if let Some(s) = val.as_str() {
                    seed_literals.push(s.as_bytes().to_vec());
                } else if let Some(arr) = val.as_array() {
                    seed_literals.push(arr.iter().map(|v| v.as_u64().unwrap_or(0) as u8).collect());
                } else {
                    seed_literals.push(Vec::new());
                }
            } else {
                seed_literals.push(Vec::new());
            }
        }
    }

    // Build byte pool:
    // [template_offset:u16=0, template_len:u16, template_bytes, ...other literals...]
    // Template at offset 0
    byte_pool.extend_from_slice(&0u16.to_le_bytes()); // template_offset
    byte_pool.extend_from_slice(&(template_bytes.len() as u16).to_le_bytes()); // template_len
    byte_pool.extend_from_slice(template_bytes);

    // Track pool entries for static addresses
    let mut static_pool_offsets: std::collections::HashMap<usize, u16> = std::collections::HashMap::new();
    for (acct_idx, addr_bytes) in &static_addresses {
        let _offset = byte_pool.len() as u16 - 4;
        let _pool_offset = byte_pool.len() - 4;
        // Wait -- looking at the on-chain code: read_pubkey_from_byte_pool uses pool_offset directly
        // from the byte_pool start (after the header fields in the intent).
        // The byte_pool itself starts at bp_offset in the account data, and pool_offset is relative to that.
        // So offset 0 in the pool = first byte of byte_pool.
        // But we put template header (4 bytes) + template at the start.
        // pool_offset for address = 4 + template.len() + ...
        let pool_off = byte_pool.len() as u16;
        static_pool_offsets.insert(*acct_idx, pool_off);
        byte_pool.extend_from_slice(addr_bytes);
    }

    // Target program (CPI program ID) pool offset — always stored for resolve_address
    let target_prog_pool_off = byte_pool.len() as u16;
    byte_pool.extend_from_slice(&program_id_bytes);

    // PDA program address pool offsets
    let mut pda_prog_pool_offsets: std::collections::HashMap<usize, u16> = std::collections::HashMap::new();
    for (acct_idx, prog_bytes) in &pda_program_addresses {
        let pool_off = byte_pool.len() as u16;
        pda_prog_pool_offsets.insert(*acct_idx, pool_off);
        byte_pool.extend_from_slice(prog_bytes);
    }

    // Literal data segment pool offsets
    let mut literal_seg_pool_offsets: Vec<(u16, u16)> = Vec::new();
    for lit_bytes in &literal_segments {
        let pool_off = byte_pool.len() as u16;
        byte_pool.extend_from_slice(lit_bytes);
        literal_seg_pool_offsets.push((pool_off, lit_bytes.len() as u16));
    }

    // Seed literal pool offsets
    let mut seed_lit_pool_offsets: Vec<(u16, u16)> = Vec::new();
    for lit_bytes in &seed_literals {
        let pool_off = byte_pool.len() as u16;
        byte_pool.extend_from_slice(lit_bytes);
        seed_lit_pool_offsets.push((pool_off, lit_bytes.len() as u16));
    }

    // Per-seed walk-plan offsets. Plan layout in byte_pool:
    // [count:u8, [op:u8, size:u16 LE] * count]. None for non-account_field seeds.
    let mut field_plan_pool_offsets: Vec<Option<u16>> = Vec::with_capacity(def.seeds.len());
    for (i, seed) in def.seeds.iter().enumerate() {
        if seed.seed_type != "account_field" {
            field_plan_pool_offsets.push(None);
            continue;
        }
        let path = seed.field_path.as_ref().ok_or_else(|| {
            anyhow::anyhow!("account_field seed at index {} requires fieldPath", i)
        })?;
        if path.len() > u8::MAX as usize {
            anyhow::bail!("account_field seed fieldPath has too many ops ({})", path.len());
        }
        let pool_off = byte_pool.len() as u16;
        field_plan_pool_offsets.push(Some(pool_off));
        byte_pool.push(path.len() as u8);
        for op in path {
            let code: u8 = match op.op.as_str() {
                "skip_fixed" => FIELD_OP_SKIP_FIXED,
                "skip_option" => FIELD_OP_SKIP_OPTION,
                other => anyhow::bail!("Unknown fieldPath op '{}'", other),
            };
            byte_pool.push(code);
            byte_pool.extend_from_slice(&op.size.to_le_bytes());
        }
    }

    // Param name pool offsets
    let mut param_name_offsets: Vec<(u16, u16)> = Vec::new();
    for param in &def.params {
        let pool_off = byte_pool.len() as u16;
        let name_bytes = param.name.as_bytes();
        byte_pool.extend_from_slice(name_bytes);
        param_name_offsets.push((pool_off, name_bytes.len() as u16));
    }

    // Now build the full intent header + arrays + byte_pool

    // IntentHeader fields (56 bytes):
    // wallet: [u8; 32] - filled by program
    // timelock_seconds: u32
    // active_proposal_count: u16 - filled by program
    // byte_pool_len: u16
    // bump: u8 - filled by program
    // intent_index: u8 - filled by program
    // intent_type: u8
    // approved: u8 - filled by program
    // approval_threshold: u8 - from wallet
    // cancellation_threshold: u8 - from wallet
    // proposer_count: u8 - from wallet
    // approver_count: u8 - from wallet
    // param_count: u8
    // account_count: u8
    // instruction_count: u8
    // data_segment_count: u8
    // seed_count: u8
    // _reserved: [u8; 3]

    let mut result = Vec::new();

    // wallet: 32 bytes (zeroed, filled by program)
    result.extend_from_slice(&[0u8; 32]);
    // target_program: 32 bytes
    result.extend_from_slice(&program_id_bytes);
    // timelock_seconds: u32
    result.extend_from_slice(&def.timelock_seconds.to_le_bytes());
    // active_proposal_count: u16 (zero)
    result.extend_from_slice(&0u16.to_le_bytes());
    // byte_pool_len: u16
    result.extend_from_slice(&(byte_pool.len() as u16).to_le_bytes());
    // bump: u8 (zero, filled by program)
    result.push(0);
    // intent_index: u8 (zero, filled by program)
    result.push(0);
    // intent_type: u8
    result.push(INTENT_TYPE_CUSTOM);
    // approved: u8 (zero, filled by program)
    result.push(0);
    // approval_threshold: u8
    result.push(approval_threshold);
    // cancellation_threshold: u8
    result.push(cancellation_threshold);
    // proposer_count: u8
    result.push((proposer_bytes.len() / 32) as u8);
    // approver_count: u8
    result.push((approver_bytes.len() / 32) as u8);
    // param_count: u8
    result.push(def.params.len() as u8);
    // account_count: u8 (+1 for the target program entry)
    result.push((def.accounts.len() + 1) as u8);
    // instruction_count: u8 (1 for single CPI)
    result.push(1);
    // data_segment_count: u8
    result.push(def.data_segments.len() as u8);
    // seed_count: u8
    result.push(def.seeds.len() as u8);
    // template_hash: 32 bytes
    result.extend_from_slice(&intent_utils::compute_template_hash(def));
    // reserved: 3 bytes
    result.extend_from_slice(&[0u8; 3]);

    assert_eq!(result.len(), INTENT_HEADER_LEN, "IntentHeader size mismatch");

    // Proposer and approver arrays (copied from wallet's meta-intent)
    result.extend_from_slice(proposer_bytes);
    result.extend_from_slice(approver_bytes);

    // Param entries
    let _lit_seg_idx = 0;
    for (i, param) in def.params.iter().enumerate() {
        let pt = param_type_from_str(&param.param_type)
            .ok_or_else(|| anyhow::anyhow!("Unknown param type '{}' for param '{}'", param.param_type, param.name))?;
        let (name_off, name_len) = if i < param_name_offsets.len() {
            param_name_offsets[i]
        } else {
            (0, 0)
        };
        // ParamEntry: constraint_value:u64, name_offset:u16, name_len:u16, param_type:u8, constraint_type:u8, display_decimals:u8, decimals_param:u8
        result.extend_from_slice(&param.constraint_value.to_le_bytes()); // 8
        result.extend_from_slice(&name_off.to_le_bytes()); // 2
        result.extend_from_slice(&name_len.to_le_bytes()); // 2
        result.push(pt); // 1
        let ct = match param.constraint_type.as_str() {
            "less_than" => 1u8,
            "greater_than" => 2u8,
            _ => 0u8,
        };
        result.push(ct); // 1
        result.push(param.display_decimals); // 1
        result.push(param.decimals_param);  // 1
    }

    // Account entries
    let _seed_lit_idx = 0;
    for (i, acct) in def.accounts.iter().enumerate() {
        let source = match acct.source.as_str() {
            "static" => SOURCE_STATIC,
            "param" => SOURCE_PARAM,
            "vault" => SOURCE_VAULT,
            "pda" => SOURCE_PDA,
            "has_one" => SOURCE_HAS_ONE,
            other => anyhow::bail!("Unknown account source '{}' for account '{}'", other, acct.name),
        };
        // AccountEntry: source:u8, writable:u8, is_signer:u8, pad:u8, source_data:[u8;4]
        result.push(source);
        result.push(if acct.writable { 1 } else { 0 });
        result.push(if acct.is_signer { 1 } else { 0 });
        result.push(0); // pad

        match source {
            SOURCE_STATIC => {
                if let Some(&off) = static_pool_offsets.get(&i) {
                    result.extend_from_slice(&off.to_le_bytes()); // 2 bytes
                    result.extend_from_slice(&[0u8; 2]); // 2 bytes padding
                } else {
                    result.extend_from_slice(&[0u8; 4]);
                }
            }
            SOURCE_PARAM => {
                if let Some(sd) = &acct.source_data {
                    let pi = sd.as_u64().unwrap_or(0) as u8;
                    result.push(pi);
                    result.extend_from_slice(&[0u8; 3]);
                } else {
                    result.extend_from_slice(&[0u8; 4]);
                }
            }
            SOURCE_VAULT => {
                result.extend_from_slice(&[0u8; 4]);
            }
            SOURCE_PDA => {
                if let Some(sd) = &acct.source_data {
                    if let Some(obj) = sd.as_object() {
                        let seed_start = obj.get("seedStart").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                        let seed_count = obj.get("seedCount").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                        let prog_off = pda_prog_pool_offsets.get(&i).copied().unwrap_or(target_prog_pool_off);
                        result.push(seed_start);
                        result.push(seed_count);
                        result.extend_from_slice(&prog_off.to_le_bytes());
                    } else {
                        result.extend_from_slice(&[0u8; 4]);
                    }
                } else {
                    result.extend_from_slice(&[0u8; 4]);
                }
            }
            SOURCE_HAS_ONE => {
                if let Some(sd) = &acct.source_data {
                    if let Some(obj) = sd.as_object() {
                        let src_idx = obj.get("sourceAccountIndex").and_then(|v| v.as_u64()).unwrap_or(0) as u8;
                        let data_off = obj.get("dataOffset").and_then(|v| v.as_u64()).unwrap_or(0) as u16;
                        result.push(src_idx);
                        result.extend_from_slice(&data_off.to_le_bytes());
                        result.push(0); // unused byte
                    } else {
                        result.extend_from_slice(&[0u8; 4]);
                    }
                } else {
                    result.extend_from_slice(&[0u8; 4]);
                }
            }
            _ => {
                result.extend_from_slice(&[0u8; 4]);
            }
        }
    }

    // Append target program as a dedicated account entry (SOURCE_STATIC, readonly, non-signer).
    // This is the CPI target program — program_account_index points here.
    let prog_acct_idx = def.accounts.len() as u8;
    result.push(SOURCE_STATIC);       // source
    result.push(0);                    // writable = false
    result.push(0);                    // is_signer = false
    result.push(0);                    // pad
    result.extend_from_slice(&target_prog_pool_off.to_le_bytes()); // pool offset (2 bytes)
    result.extend_from_slice(&[0u8; 2]);                           // padding (2 bytes)

    // Instruction entries (single CPI)
    let cpi_account_start = 0u8;
    let cpi_account_count = def.accounts.len() as u8;

    result.push(prog_acct_idx); // program_account_index
    result.push(cpi_account_start); // account_start_index
    result.push(cpi_account_count); // account_count
    result.push(0); // data_segment_start_index
    result.push(def.data_segments.len() as u8); // data_segment_count
    result.extend_from_slice(&[0u8; 3]); // pad

    // Data segment entries
    let mut lit_idx = 0;
    for seg in &def.data_segments {
        match seg.segment_type.as_str() {
            "literal" => {
                result.push(SEGMENT_LITERAL);
                result.push(0); // pad
                if lit_idx < literal_seg_pool_offsets.len() {
                    let (off, len) = literal_seg_pool_offsets[lit_idx];
                    result.extend_from_slice(&off.to_le_bytes());
                    result.extend_from_slice(&len.to_le_bytes());
                    lit_idx += 1;
                } else {
                    result.extend_from_slice(&[0u8; 4]);
                }
            }
            "param" => {
                result.push(SEGMENT_PARAM);
                result.push(0); // pad
                let pi = seg.param_index.unwrap_or(0);
                result.push(pi);
                result.extend_from_slice(&[0u8; 3]);
            }
            other => anyhow::bail!("Unknown data segment type '{}'", other),
        }
    }

    // Seed entries
    let mut seed_l_idx = 0;
    for (seed_i, seed) in def.seeds.iter().enumerate() {
        match seed.seed_type.as_str() {
            "literal" => {
                result.push(SEED_LITERAL);
                result.push(0); // pad
                if seed_l_idx < seed_lit_pool_offsets.len() {
                    let (off, len) = seed_lit_pool_offsets[seed_l_idx];
                    result.extend_from_slice(&off.to_le_bytes());
                    result.extend_from_slice(&len.to_le_bytes());
                    seed_l_idx += 1;
                } else {
                    result.extend_from_slice(&[0u8; 4]);
                }
            }
            "param" => {
                result.push(SEED_PARAM);
                result.push(0); // pad
                let pi = seed.param_index.unwrap_or(0);
                result.push(pi);
                result.extend_from_slice(&[0u8; 3]);
            }
            "account" => {
                result.push(SEED_ACCOUNT);
                result.push(0); // pad
                let ai = seed.account_index.unwrap_or(0);
                result.push(ai);
                result.extend_from_slice(&[0u8; 3]);
            }
            "account_field" => {
                let ai = seed.account_index
                    .ok_or_else(|| anyhow::anyhow!("account_field seed requires accountIndex"))?;
                let len = seed.field_len
                    .ok_or_else(|| anyhow::anyhow!("account_field seed requires fieldLen"))?;
                if len == 0 || len > 32 {
                    anyhow::bail!("account_field seed fieldLen must be 1..=32, got {}", len);
                }
                let plan_off = field_plan_pool_offsets[seed_i]
                    .ok_or_else(|| anyhow::anyhow!("account_field seed at {} missing plan offset", seed_i))?;
                result.push(SEED_ACCOUNT_FIELD);
                result.push(0); // pad
                result.push(ai);
                result.extend_from_slice(&plan_off.to_le_bytes());
                result.push(len);
            }
            other => anyhow::bail!("Unknown seed type '{}'", other),
        }
    }

    // Byte pool
    result.extend_from_slice(&byte_pool);

    Ok(result)
}
