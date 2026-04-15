use anyhow::{Context, Result};
use colored::Colorize;
use sha2::{Digest, Sha256};
use solana_sdk::pubkey::Pubkey;
use std::path::Path;
use std::str::FromStr;

use crate::intent_utils;
use crate::pda;
use crate::rpc;
use crate::types::*;

/// Audit on-chain intents against intent JSON files and/or IDL.
///
/// For each on-chain intent, computes SHA256 of the on-chain definition bytes
/// (after PREFIX_LEN, skipping program-filled fields). If intent JSON files
/// are provided, re-serializes them and compares byte-for-byte.
pub fn audit(
    wallet_str: &str,
    intents_dir: Option<&str>,
    idl_path: Option<&str>,
    url: &str,
) -> Result<()> {
    let client = rpc::create_client(url);
    let program_id = pda::PROGRAM_ID;

    let wallet_pubkey =
        Pubkey::from_str(wallet_str).context("Invalid wallet address")?;

    let data = rpc::fetch_account(&client, &wallet_pubkey)?;
    let w = intent_utils::deserialize_wallet(&data)?;

    println!(
        "{}",
        format!(
            "Auditing wallet '{}' ({}) — {} intents on-chain",
            w.name, wallet_pubkey, w.intent_count
        )
        .cyan()
        .bold()
    );
    println!();

    // Load intent JSON files if provided
    let json_intents = if let Some(dir) = intents_dir {
        load_intent_jsons(dir)?
    } else {
        Vec::new()
    };

    // Load IDL if provided
    let idl: Option<serde_json::Value> = if let Some(path) = idl_path {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read IDL: {}", path))?;
        Some(serde_json::from_str(&content).context("Failed to parse IDL")?)
    } else {
        None
    };

    let mut pass_count = 0;
    let mut fail_count = 0;
    let mut warn_count = 0;

    for i in 0..w.intent_count {
        let (intent_pda, _) = pda::find_intent_pda(&wallet_pubkey, i, &program_id);
        let idata = match rpc::fetch_account(&client, &intent_pda) {
            Ok(d) => d,
            Err(e) => {
                println!(
                    "  {} Intent [{}] — failed to fetch: {}",
                    "FAIL".red().bold(),
                    i,
                    e
                );
                fail_count += 1;
                continue;
            }
        };

        let header = match intent_utils::deserialize_intent_header(&idata) {
            Ok(h) => h,
            Err(e) => {
                println!(
                    "  {} Intent [{}] — invalid header: {}",
                    "FAIL".red().bold(),
                    i,
                    e
                );
                fail_count += 1;
                continue;
            }
        };

        let template = intent_utils::read_template_string(&idata)
            .unwrap_or_else(|| "<no template>".to_string());

        // Extract the definition bytes (everything after PREFIX_LEN)
        let onchain_bytes = &idata[PREFIX_LEN..];

        // Hash on-chain definition bytes (skipping program-filled fields)
        let canonical = canonicalize_onchain_bytes(onchain_bytes);
        let onchain_hash = Sha256::digest(&canonical);
        let onchain_hash_hex = format!("{:x}", onchain_hash);
        let hash_short = &onchain_hash_hex[..16];

        let mut issues: Vec<String> = Vec::new();
        let mut warnings: Vec<String> = Vec::new();

        // Match against JSON files by discriminator
        if !json_intents.is_empty() {
            match find_matching_json(&json_intents, onchain_bytes, &header) {
                Some((filename, json_def)) => {
                    // Re-serialize with the on-chain approvers/proposers/thresholds
                    let proposers = intent_utils::read_proposers(&idata, &header);
                    let approvers = intent_utils::read_approvers(&idata, &header);

                    let proposer_bytes: Vec<u8> =
                        proposers.iter().flat_map(|p| p.to_bytes()).collect();
                    let approver_bytes: Vec<u8> =
                        approvers.iter().flat_map(|p| p.to_bytes()).collect();

                    match super::wallet::build_intent_bytes(
                        &json_def,
                        header.approval_threshold,
                        header.cancellation_threshold,
                        &proposer_bytes,
                        &approver_bytes,
                    ) {
                        Ok(expected_bytes) => {
                            let expected_canonical =
                                canonicalize_built_bytes(&expected_bytes);
                            let actual_canonical = canonical.clone();

                            if expected_canonical == actual_canonical {
                                // Byte-perfect match
                            } else {
                                let diff = describe_diff(
                                    &actual_canonical,
                                    &expected_canonical,
                                    &header,
                                );
                                issues.push(format!(
                                    "On-chain bytes differ from {} — {}",
                                    filename, diff
                                ));
                            }
                        }
                        Err(e) => {
                            warnings.push(format!(
                                "Could not re-serialize {}: {}",
                                filename, e
                            ));
                        }
                    }
                }
                None => {
                    warnings.push("No matching intent JSON found".to_string());
                }
            }
        }

        // Verify against IDL if provided
        if let Some(ref idl_val) = idl {
            verify_onchain_against_idl(onchain_bytes, &header, idl_val, &mut issues, &mut warnings);
        }

        // Print result
        let type_str = intent_type_to_str(header.intent_type);
        if issues.is_empty() && warnings.is_empty() {
            println!(
                "  {} Intent [{}] {} — \"{}\" sha256:{}",
                "PASS".green().bold(),
                i,
                type_str.yellow(),
                template,
                hash_short.dimmed()
            );
            pass_count += 1;
        } else if issues.is_empty() {
            println!(
                "  {} Intent [{}] {} — \"{}\" sha256:{}",
                "WARN".yellow().bold(),
                i,
                type_str.yellow(),
                template,
                hash_short.dimmed()
            );
            for w in &warnings {
                println!("       {} {}", "!".yellow(), w);
            }
            warn_count += 1;
        } else {
            println!(
                "  {} Intent [{}] {} — \"{}\" sha256:{}",
                "FAIL".red().bold(),
                i,
                type_str.yellow(),
                template,
                hash_short.dimmed()
            );
            for issue in &issues {
                println!("       {} {}", "x".red(), issue);
            }
            for w in &warnings {
                println!("       {} {}", "!".yellow(), w);
            }
            fail_count += 1;
        }
    }

    println!();
    println!(
        "Results: {} passed, {} warnings, {} failed",
        pass_count.to_string().green(),
        warn_count.to_string().yellow(),
        fail_count.to_string().red()
    );

    if fail_count > 0 {
        std::process::exit(1);
    }

    Ok(())
}

/// Canonicalize on-chain bytes by zeroing out program-filled fields.
/// These fields are set by the on-chain program, not by the CLI:
///   - wallet pubkey (bytes 0..32)
///   - active_proposal_count (bytes 68..70)
///   - bump (byte 72)
///   - intent_index (byte 73)
///   - approved (byte 75)
pub fn canonicalize_onchain_bytes(bytes: &[u8]) -> Vec<u8> {
    let mut canonical = bytes.to_vec();
    if canonical.len() >= INTENT_HEADER_LEN {
        // Zero wallet pubkey
        canonical[0..32].fill(0);
        // Zero active_proposal_count
        canonical[68..70].fill(0);
        // Zero bump
        canonical[72] = 0;
        // Zero intent_index
        canonical[73] = 0;
        // Zero approved
        canonical[75] = 0;
    }
    canonical
}

/// Canonicalize built bytes the same way (they already have zeros for
/// program-filled fields, but this ensures consistency).
pub fn canonicalize_built_bytes(bytes: &[u8]) -> Vec<u8> {
    canonicalize_onchain_bytes(bytes)
}

/// Load all intent JSON files from a directory.
fn load_intent_jsons(dir: &str) -> Result<Vec<(String, IntentDefinition)>> {
    let path = Path::new(dir);
    if !path.is_dir() {
        anyhow::bail!("{} is not a directory", dir);
    }

    let mut results = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(path)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "json")
                .unwrap_or(false)
        })
        .collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let filepath = entry.path();
        let filename = filepath
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        // Skip tampered files
        if filename.contains("TAMPERED") {
            continue;
        }
        let content = std::fs::read_to_string(&filepath)?;
        match serde_json::from_str::<IntentDefinition>(&content) {
            Ok(def) => results.push((filename, def)),
            Err(_) => continue,
        }
    }

    Ok(results)
}

/// Find a JSON intent that matches an on-chain intent by discriminator.
/// Discriminator is embedded in the first literal data segment in the byte pool.
fn find_matching_json<'a>(
    jsons: &'a [(String, IntentDefinition)],
    onchain_bytes: &[u8],
    header: &intent_utils::IntentHeaderInfo,
) -> Option<(String, &'a IntentDefinition)> {
    // Extract discriminator from on-chain byte pool (first literal data segment)
    let onchain_disc = extract_onchain_discriminator(onchain_bytes, header)?;

    for (filename, def) in jsons {
        if def.discriminator == onchain_disc
            && def.program_id == header.target_program.to_string()
        {
            return Some((filename.clone(), def));
        }
    }
    None
}

/// Extract the discriminator bytes from on-chain intent data.
/// The discriminator is stored in the byte pool, referenced by the first
/// literal data segment entry.
pub fn extract_onchain_discriminator(
    bytes: &[u8],
    header: &intent_utils::IntentHeaderInfo,
) -> Option<Vec<u8>> {
    // Calculate data segment entries offset (no PREFIX_LEN since bytes already starts after it)
    let ds_offset = INTENT_HEADER_LEN
        + (header.proposer_count as usize * 32)
        + (header.approver_count as usize * 32)
        + (header.param_count as usize * PARAM_ENTRY_SIZE)
        + (header.account_count as usize * ACCOUNT_ENTRY_SIZE)
        + (header.instruction_count as usize * INSTRUCTION_ENTRY_SIZE);

    let bp_offset = ds_offset
        + (header.data_segment_count as usize * DATA_SEGMENT_ENTRY_SIZE)
        + (header.seed_count as usize * SEED_ENTRY_SIZE);

    // Find first literal data segment
    for s in 0..header.data_segment_count as usize {
        let off = ds_offset + s * DATA_SEGMENT_ENTRY_SIZE;
        if off + DATA_SEGMENT_ENTRY_SIZE > bytes.len() {
            break;
        }
        let seg_type = bytes[off];
        if seg_type == SEGMENT_LITERAL {
            let pool_off = u16::from_le_bytes([bytes[off + 2], bytes[off + 3]]) as usize;
            let pool_len = u16::from_le_bytes([bytes[off + 4], bytes[off + 5]]) as usize;
            let abs_start = bp_offset + pool_off;
            let abs_end = abs_start + pool_len;
            if abs_end <= bytes.len() {
                return Some(bytes[abs_start..abs_end].to_vec());
            }
        }
    }
    None
}

/// Describe the first difference between two byte slices.
fn describe_diff(
    actual: &[u8],
    expected: &[u8],
    header: &intent_utils::IntentHeaderInfo,
) -> String {
    if actual.len() != expected.len() {
        return format!(
            "length mismatch (on-chain: {} bytes, expected: {} bytes)",
            actual.len(),
            expected.len()
        );
    }

    let mut diff_start = None;
    let mut diff_count = 0;
    for (i, (a, e)) in actual.iter().zip(expected.iter()).enumerate() {
        if a != e {
            if diff_start.is_none() {
                diff_start = Some(i);
            }
            diff_count += 1;
        }
    }

    if let Some(start) = diff_start {
        let region = identify_region(start, header);
        format!(
            "{} byte(s) differ starting at offset {} ({})",
            diff_count, start, region
        )
    } else {
        "unknown difference".to_string()
    }
}

/// Identify which region of the intent data an offset falls in.
pub fn identify_region(offset: usize, header: &intent_utils::IntentHeaderInfo) -> String {
    if offset < 32 {
        return "wallet pubkey (program-filled)".to_string();
    }
    if offset < 64 {
        return "target_program".to_string();
    }
    if offset < 68 {
        return "timelock_seconds".to_string();
    }
    if offset < 70 {
        return "active_proposal_count".to_string();
    }
    if offset < 72 {
        return "byte_pool_len".to_string();
    }
    if offset < INTENT_HEADER_LEN {
        return "header flags".to_string();
    }

    let proposers_end = INTENT_HEADER_LEN + (header.proposer_count as usize * 32);
    if offset < proposers_end {
        return "proposers".to_string();
    }

    let approvers_end = proposers_end + (header.approver_count as usize * 32);
    if offset < approvers_end {
        return "approvers".to_string();
    }

    let params_end = approvers_end + (header.param_count as usize * PARAM_ENTRY_SIZE);
    if offset < params_end {
        return "params".to_string();
    }

    let accounts_end = params_end + (header.account_count as usize * ACCOUNT_ENTRY_SIZE);
    if offset < accounts_end {
        return "accounts".to_string();
    }

    "data segments / seeds / byte pool".to_string()
}

/// Verify on-chain intent against IDL: check discriminator and account flags.
fn verify_onchain_against_idl(
    onchain_bytes: &[u8],
    header: &intent_utils::IntentHeaderInfo,
    idl: &serde_json::Value,
    issues: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    // Only verify custom intents against IDL
    if header.intent_type != INTENT_TYPE_CUSTOM {
        return;
    }

    let idl_addr = idl
        .get("address")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let target = header.target_program.to_string();
    if idl_addr != target {
        warnings.push(format!(
            "IDL program ({}) doesn't match intent target ({})",
            idl_addr, target
        ));
        return;
    }

    let onchain_disc = match extract_onchain_discriminator(onchain_bytes, header) {
        Some(d) => d,
        None => {
            warnings.push("Could not extract discriminator from on-chain data".to_string());
            return;
        }
    };

    // Find matching IDL instruction by discriminator
    let instructions = match idl.get("instructions").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return,
    };

    let mut matched_name: Option<String> = None;
    for ix in instructions {
        let name = match ix.get("name").and_then(|v| v.as_str()) {
            Some(n) => n,
            None => continue,
        };
        let disc_input = format!("global:{}", intent_utils::snake_case(name));
        let hash = Sha256::digest(disc_input.as_bytes());
        let expected_disc: Vec<u8> = hash[..8].to_vec();

        if expected_disc == onchain_disc {
            matched_name = Some(name.to_string());
            break;
        }
    }

    match matched_name {
        Some(name) => {
            // Discriminator matches an IDL instruction
            let ix = instructions
                .iter()
                .find(|ix| ix.get("name").and_then(|v| v.as_str()) == Some(&name))
                .unwrap();

            // Check account count
            if let Some(accts) = ix.get("accounts").and_then(|v| v.as_array()) {
                if (header.account_count as usize) < accts.len() {
                    issues.push(format!(
                        "IDL '{}' requires {} accounts, on-chain has {}",
                        name,
                        accts.len(),
                        header.account_count
                    ));
                }
            }
        }
        None => {
            issues.push(format!(
                "On-chain discriminator {:?} not found in IDL",
                &onchain_disc[..onchain_disc.len().min(8)]
            ));
        }
    }
}
