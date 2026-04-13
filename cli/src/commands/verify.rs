use anyhow::{Context, Result};
use colored::Colorize;
use sha2::{Digest, Sha256};
use std::path::Path;

use crate::types::*;

/// Known program definitions for Tier 1 verification
struct KnownInstruction {
    name: &'static str,
    discriminator: Vec<u8>,
    min_accounts: usize,
}

struct KnownProgram {
    name: &'static str,
    address: &'static str,
    instructions: Vec<KnownInstruction>,
}

fn known_programs() -> Vec<KnownProgram> {
    vec![
        KnownProgram {
            name: "System Program",
            address: "11111111111111111111111111111111",
            instructions: vec![KnownInstruction {
                name: "Transfer",
                discriminator: vec![2, 0, 0, 0],
                min_accounts: 2,
            }],
        },
        KnownProgram {
            name: "SPL Token",
            address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            instructions: vec![
                KnownInstruction {
                    name: "Transfer",
                    discriminator: vec![3],
                    min_accounts: 3,
                },
                KnownInstruction {
                    name: "TransferChecked",
                    discriminator: vec![12],
                    min_accounts: 4,
                },
                KnownInstruction {
                    name: "SetAuthority",
                    discriminator: vec![6],
                    min_accounts: 2,
                },
            ],
        },
        KnownProgram {
            name: "BPF Loader Upgradeable",
            address: "BPFLoaderUpgradeab1e11111111111111111111111",
            instructions: vec![
                KnownInstruction {
                    name: "Upgrade",
                    discriminator: vec![3, 0, 0, 0],
                    min_accounts: 7,
                },
                KnownInstruction {
                    name: "SetAuthority",
                    discriminator: vec![4, 0, 0, 0],
                    min_accounts: 2,
                },
                KnownInstruction {
                    name: "Close",
                    discriminator: vec![5, 0, 0, 0],
                    min_accounts: 3,
                },
            ],
        },
    ]
}

/// Anchor IDL structures for Tier 2
#[derive(serde::Deserialize)]
struct AnchorIdl {
    #[serde(default)]
    address: Option<String>,
    #[serde(default)]
    metadata: Option<AnchorMetadata>,
    instructions: Vec<AnchorInstruction>,
}

#[derive(serde::Deserialize)]
struct AnchorMetadata {
    #[serde(default)]
    name: Option<String>,
}

impl AnchorIdl {
    fn program_address(&self) -> Option<&str> {
        self.address.as_deref()
    }
    fn program_name(&self) -> &str {
        self.metadata
            .as_ref()
            .and_then(|m| m.name.as_deref())
            .unwrap_or("unknown")
    }
}

#[derive(serde::Deserialize)]
struct AnchorInstruction {
    name: String,
    #[serde(default)]
    accounts: Vec<AnchorAccount>,
    #[serde(default)]
    args: Vec<AnchorArg>,
}

#[derive(serde::Deserialize)]
struct AnchorAccount {
    name: String,
    // Old Anchor IDL format (pre-0.30)
    #[serde(rename = "isMut", default)]
    is_mut_legacy: Option<bool>,
    #[serde(rename = "isSigner", default)]
    is_signer_legacy: Option<bool>,
    // New Anchor IDL format (0.30+)
    #[serde(default)]
    writable: Option<bool>,
    #[serde(default)]
    signer: Option<bool>,
}

impl AnchorAccount {
    fn is_mut(&self) -> bool {
        self.writable.or(self.is_mut_legacy).unwrap_or(false)
    }
    fn is_signer(&self) -> bool {
        self.signer.or(self.is_signer_legacy).unwrap_or(false)
    }
}

#[derive(serde::Deserialize)]
struct AnchorArg {
    name: String,
    #[serde(rename = "type")]
    arg_type: serde_json::Value,
}

pub fn verify(intents_dir: &str, idl_path: Option<&str>) -> Result<()> {
    let dir = Path::new(intents_dir);
    if !dir.is_dir() {
        anyhow::bail!("{} is not a directory", intents_dir);
    }

    let mut entries: Vec<_> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "json")
                .unwrap_or(false)
        })
        .collect();
    entries.sort_by_key(|e| e.file_name());

    if entries.is_empty() {
        anyhow::bail!("No JSON files found in {}", intents_dir);
    }

    let idl: Option<AnchorIdl> = if let Some(path) = idl_path {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read IDL: {}", path))?;
        Some(serde_json::from_str(&content).context("Failed to parse IDL")?)
    } else {
        None
    };

    let known = known_programs();
    let mut pass_count = 0;
    let mut fail_count = 0;
    let mut warn_count = 0;

    // Determine IDL program address for mixed-tier routing
    let idl_program_addr = idl.as_ref().and_then(|i| i.program_address()).map(|s| s.to_string());

    if let Some(ref idl_val) = idl {
        println!(
            "{}",
            format!(
                "Verifying {} intents against {} IDL + known programs",
                entries.len(),
                idl_val.program_name()
            )
            .cyan()
            .bold()
        );
    } else {
        println!(
            "{}",
            format!(
                "Verifying {} intents (Tier 1 — known programs)",
                entries.len()
            )
            .cyan()
            .bold()
        );
    }
    println!();

    for entry in &entries {
        let path = entry.path();
        let filename = path.file_name().unwrap_or_default().to_string_lossy();

        let content = std::fs::read_to_string(&path)?;
        let intent: IntentDefinition = match serde_json::from_str(&content) {
            Ok(i) => i,
            Err(e) => {
                println!("  {} {} - Parse error: {}", "FAIL".red().bold(), filename, e);
                fail_count += 1;
                continue;
            }
        };

        let mut issues: Vec<String> = Vec::new();
        let mut warnings: Vec<String> = Vec::new();

        // Basic structural checks
        if intent.discriminator.is_empty() {
            issues.push("Missing discriminator".to_string());
        }
        if intent.instruction_name.is_empty() {
            issues.push("Missing instruction name".to_string());
        }
        if intent.template.is_empty() {
            warnings.push("Empty template".to_string());
        }

        // Route to appropriate verification tier
        let is_known = known.iter().any(|p| p.address == intent.program_id);
        let matches_idl = idl_program_addr.as_deref() == Some(&intent.program_id);
        let tier_label;

        if let Some(ref idl_val) = idl {
            if matches_idl {
                // Tier 2: Intent matches IDL program
                verify_against_idl(&intent, idl_val, &mut issues, &mut warnings);
                tier_label = "Tier 2";
            } else if is_known {
                // Tier 1: Intent matches a known program
                verify_against_known(&intent, &known, &mut issues, &mut warnings);
                tier_label = "Tier 1";
            } else {
                // Unknown program, not in IDL or known list
                warnings.push(format!(
                    "Program {} not in IDL or known program list",
                    intent.program_id
                ));
                tier_label = "Tier 3";
            }
        } else {
            // No IDL provided — Tier 1 only
            verify_against_known(&intent, &known, &mut issues, &mut warnings);
            tier_label = "Tier 1";
        }

        if issues.is_empty() && warnings.is_empty() {
            println!(
                "  {} {} - {} [{}] ({})",
                "PASS".green().bold(),
                filename,
                intent.instruction_name,
                intent.risk_level,
                tier_label
            );
            pass_count += 1;
        } else if issues.is_empty() {
            println!(
                "  {} {} - {} [{}] ({})",
                "WARN".yellow().bold(),
                filename,
                intent.instruction_name,
                intent.risk_level,
                tier_label
            );
            for w in &warnings {
                println!("       {} {}", "!".yellow(), w);
            }
            warn_count += 1;
        } else {
            println!(
                "  {} {} - {} [{}] ({})",
                "FAIL".red().bold(),
                filename,
                intent.instruction_name,
                intent.risk_level,
                tier_label
            );
            for i in &issues {
                println!("       {} {}", "x".red(), i);
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

fn verify_against_known(
    intent: &IntentDefinition,
    known: &[KnownProgram],
    issues: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    if intent.program_id.is_empty() {
        warnings.push("No programId specified, cannot verify against known programs".to_string());
        return;
    }

    // Find matching known program
    let program = known.iter().find(|p| p.address == intent.program_id);
    if program.is_none() {
        warnings.push(format!(
            "Program {} not in known program list",
            intent.program_id
        ));
        return;
    }
    let program = program.unwrap();

    // Find matching instruction by discriminator
    let matching_ix = program.instructions.iter().find(|ix| {
        ix.discriminator == intent.discriminator
    });

    if let Some(ix) = matching_ix {
        // Verify name
        let ix_name_lower = ix.name.to_lowercase();
        let intent_name_lower = intent.instruction_name.to_lowercase();
        if !intent_name_lower.contains(&ix_name_lower) && !ix_name_lower.contains(&intent_name_lower) {
            warnings.push(format!(
                "Name mismatch: intent says '{}', known program has '{}'",
                intent.instruction_name, ix.name
            ));
        }

        // Verify minimum account count
        if intent.accounts.len() < ix.min_accounts {
            issues.push(format!(
                "Too few accounts: {} has, known {} requires at least {}",
                intent.accounts.len(),
                ix.name,
                ix.min_accounts
            ));
        }
    } else {
        warnings.push(format!(
            "Discriminator {:?} not found in known {} instructions",
            intent.discriminator, program.name
        ));
    }
}

fn verify_against_idl(
    intent: &IntentDefinition,
    idl: &AnchorIdl,
    issues: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    // Find instruction by discriminator
    let mut matched_ix: Option<&AnchorInstruction> = None;

    for ix in &idl.instructions {
        let disc_input = format!("global:{}", snake_case(&ix.name));
        let mut hasher = Sha256::new();
        hasher.update(disc_input.as_bytes());
        let hash = hasher.finalize();
        let expected_disc: Vec<u8> = hash[..8].to_vec();

        if expected_disc == intent.discriminator {
            matched_ix = Some(ix);
            break;
        }
    }

    if matched_ix.is_none() {
        // Try to find by name as fallback
        matched_ix = idl.instructions.iter().find(|ix| {
            snake_case(&ix.name) == snake_case(&intent.instruction_name)
        });
        if matched_ix.is_some() {
            issues.push("Discriminator does not match SHA-256(\"global:{name}\")[..8]".to_string());
        } else {
            issues.push(format!(
                "Instruction '{}' not found in IDL",
                intent.instruction_name
            ));
            return;
        }
    }

    let ix = matched_ix.unwrap();

    // Verify name match
    if snake_case(&ix.name) != snake_case(&intent.instruction_name) {
        warnings.push(format!(
            "Name mismatch: intent says '{}', IDL has '{}'",
            intent.instruction_name, ix.name
        ));
    }

    // Verify discriminator = SHA-256("global:{name}")[..8]
    let disc_input = format!("global:{}", snake_case(&ix.name));
    let mut hasher = Sha256::new();
    hasher.update(disc_input.as_bytes());
    let hash = hasher.finalize();
    let expected_disc: Vec<u8> = hash[..8].to_vec();
    if intent.discriminator != expected_disc {
        issues.push(format!(
            "Discriminator mismatch: intent has {:?}, expected {:?}",
            intent.discriminator, expected_disc
        ));
    }

    // Verify account count and flags
    if intent.accounts.len() != ix.accounts.len() {
        warnings.push(format!(
            "Account count: intent has {}, IDL has {}",
            intent.accounts.len(),
            ix.accounts.len()
        ));
    }
    let check_count = intent.accounts.len().min(ix.accounts.len());
    for i in 0..check_count {
        let intent_acct = &intent.accounts[i];
        let idl_acct = &ix.accounts[i];

        if intent_acct.writable != idl_acct.is_mut() {
            warnings.push(format!(
                "Account '{}' writable mismatch: intent={}, IDL={}",
                idl_acct.name, intent_acct.writable, idl_acct.is_mut()
            ));
        }
        if intent_acct.is_signer != idl_acct.is_signer() {
            warnings.push(format!(
                "Account '{}' signer mismatch: intent={}, IDL={}",
                idl_acct.name, intent_acct.is_signer, idl_acct.is_signer()
            ));
        }
    }

    // Verify arg types match param types
    if intent.params.len() != ix.args.len() {
        warnings.push(format!(
            "Param count: intent has {}, IDL has {} args",
            intent.params.len(),
            ix.args.len()
        ));
    }
    let param_check = intent.params.len().min(ix.args.len());
    for i in 0..param_check {
        let intent_param = &intent.params[i];
        let idl_arg = &ix.args[i];

        let expected_type = map_idl_type_to_param(&idl_arg.arg_type);
        if intent_param.param_type != expected_type {
            warnings.push(format!(
                "Param '{}' type mismatch: intent='{}', IDL expects '{}'",
                idl_arg.name, intent_param.param_type, expected_type
            ));
        }
    }

    // Verify data segments: should have discriminator literal + param segments
    let expected_segments = 1 + ix.args.len(); // disc + args
    if intent.data_segments.len() != expected_segments {
        warnings.push(format!(
            "Data segment count: intent has {}, expected {} (1 disc + {} args)",
            intent.data_segments.len(),
            expected_segments,
            ix.args.len()
        ));
    }
}

fn map_idl_type_to_param(ty: &serde_json::Value) -> String {
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
    } else {
        "u64".to_string()
    }
}

fn snake_case(s: &str) -> String {
    let mut result = String::new();
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() && i > 0 {
            result.push('_');
        }
        result.push(c.to_lowercase().next().unwrap_or(c));
    }
    result
}
