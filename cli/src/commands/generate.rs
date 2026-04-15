use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use std::path::Path;

use crate::types::*;
use crate::intent_utils;

/// Normalized instruction/account/arg types used by the generator.
struct NormalizedIdl {
    name: String,
    address: String,
    instructions: Vec<NormalizedInstruction>,
}

struct NormalizedInstruction {
    name: String,
    discriminator: Option<Vec<u8>>,
    accounts: Vec<NormalizedAccount>,
    args: Vec<NormalizedArg>,
}

struct NormalizedAccount {
    name: String,
    is_mut: bool,
    is_signer: bool,
    pda: Option<serde_json::Value>,
    address: Option<String>,
    relations: Vec<String>,
}

struct NormalizedArg {
    name: String,
    arg_type: serde_json::Value,
}

/// Parse IDL JSON, detecting old vs new Anchor format automatically.
fn parse_idl(content: &str) -> Result<NormalizedIdl> {
    let raw: serde_json::Value = serde_json::from_str(content).context("Failed to parse IDL JSON")?;

    // Detect format: new format has "metadata.name", old has "name" directly
    let is_new_format = raw.get("metadata").is_some();

    let name = if is_new_format {
        raw["metadata"]["name"].as_str().unwrap_or("unknown").to_string()
    } else {
        raw["name"].as_str().unwrap_or("unknown").to_string()
    };

    let address = raw["address"].as_str()
        .ok_or_else(|| anyhow::anyhow!("IDL missing 'address' field"))?
        .to_string();

    let instructions = raw["instructions"].as_array()
        .ok_or_else(|| anyhow::anyhow!("IDL missing 'instructions' array"))?;

    let mut normalized_ixs = Vec::new();
    for ix in instructions {
        let ix_name = ix["name"].as_str().unwrap_or("unknown").to_string();

        // Discriminator: new format has it pre-computed, old format we compute it
        let discriminator = ix.get("discriminator")
            .and_then(|d| d.as_array())
            .map(|arr| arr.iter().map(|v| v.as_u64().unwrap_or(0) as u8).collect());

        // Accounts
        let mut accounts = Vec::new();
        if let Some(accts) = ix["accounts"].as_array() {
            for acct in accts {
                let acct_name = acct["name"].as_str().unwrap_or("unknown").to_string();
                let (is_mut, is_signer) = if is_new_format {
                    (acct["writable"].as_bool().unwrap_or(false),
                     acct["signer"].as_bool().unwrap_or(false))
                } else {
                    (acct["isMut"].as_bool().unwrap_or(false),
                     acct["isSigner"].as_bool().unwrap_or(false))
                };
                let relations = acct.get("relations")
                    .and_then(|r| r.as_array())
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                accounts.push(NormalizedAccount {
                    name: acct_name,
                    is_mut,
                    is_signer,
                    pda: acct.get("pda").cloned(),
                    address: acct.get("address").and_then(|a| a.as_str()).map(|s| s.to_string()),
                    relations,
                });
            }
        }

        // Args: new format nests under "args[].type", old uses "args[].type" too
        let mut args = Vec::new();
        if let Some(ax) = ix["args"].as_array() {
            for arg in ax {
                args.push(NormalizedArg {
                    name: arg["name"].as_str().unwrap_or("unknown").to_string(),
                    arg_type: arg["type"].clone(),
                });
            }
        }

        normalized_ixs.push(NormalizedInstruction {
            name: ix_name,
            discriminator,
            accounts,
            args,
        });
    }

    Ok(NormalizedIdl { name, address, instructions: normalized_ixs })
}

pub fn generate(idl_path: &str, output_dir: &str) -> Result<()> {
    let idl_content = std::fs::read_to_string(idl_path)
        .with_context(|| format!("Failed to read IDL: {}", idl_path))?;
    let idl = parse_idl(&idl_content)?;

    // Parse types for has_one offset calculation
    let raw: serde_json::Value = serde_json::from_str(&idl_content)?;
    let idl_types = raw.get("types").cloned().unwrap_or(serde_json::Value::Array(vec![]));

    std::fs::create_dir_all(output_dir)?;

    println!("Generating intents from IDL: {}", idl.name);

    for ix in &idl.instructions {
        let intent = generate_intent_from_instruction(ix, &idl.address, &idl_types)?;
        let filename = format!("{}.json", intent_utils::snake_case(&ix.name));
        let filepath = Path::new(output_dir).join(&filename);
        let json = serde_json::to_string_pretty(&intent)?;
        std::fs::write(&filepath, json)?;
        println!(
            "  Generated: {} (risk: {}, timelock: {}s)",
            filename, intent.risk_level, intent.timelock_seconds
        );
    }

    println!(
        "Generated {} intent definitions in {}",
        idl.instructions.len(),
        output_dir
    );
    Ok(())
}

fn generate_intent_from_instruction(
    ix: &NormalizedInstruction,
    program_id: &str,
    idl_types: &serde_json::Value,
) -> Result<IntentDefinition> {
    // Use pre-computed discriminator if available, otherwise compute from name
    let discriminator = if let Some(disc) = &ix.discriminator {
        disc.clone()
    } else {
        let disc_input = format!("global:{}", intent_utils::snake_case(&ix.name));
        let mut hasher = Sha256::new();
        hasher.update(disc_input.as_bytes());
        let hash = hasher.finalize();
        hash[..8].to_vec()
    };

    // Map args to params
    let mut params: Vec<ParamDef> = Vec::new();
    for arg in &ix.args {
        let param_type = intent_utils::map_idl_type(&arg.arg_type);
        params.push(ParamDef {
            name: arg.name.clone(),
            param_type,
            constraint_type: "none".to_string(),
            constraint_value: 0,
            display_decimals: 0,
        });
    }

    // Map accounts and extract PDA seeds
    let mut accounts: Vec<AccountDef> = Vec::new();
    let mut all_seeds: Vec<SeedDef> = Vec::new();

    for acct in &ix.accounts {
        let (mut source, source_data) = infer_account_source(acct, &params, &ix.accounts, idl_types);

        // Unresolved accounts — create a synthetic address param so the
        // proposer supplies it explicitly and the source_data index is correct.
        let source_data = if source == "unresolved" {
            let param_idx = params.len();
            params.push(ParamDef {
                name: acct.name.clone(),
                param_type: "address".to_string(),
                constraint_type: "none".to_string(),
                constraint_value: 0,
                display_decimals: 0,
            });
            source = "param".to_string();
            Some(serde_json::Value::Number(serde_json::Number::from(param_idx)))
        } else {
            source_data
        };

        // Extract seeds for PDA accounts
        let final_source_data = if source == "pda" {
            if let Some(pda_seeds) = extract_pda_seeds(acct, &ix.accounts, &ix.args) {
                let seed_start = all_seeds.len();
                let seed_count = pda_seeds.seeds.len();
                all_seeds.extend(pda_seeds.seeds);

                let mut sd = serde_json::Map::new();
                sd.insert("seedStart".to_string(), serde_json::Value::Number(seed_start.into()));
                sd.insert("seedCount".to_string(), serde_json::Value::Number(seed_count.into()));
                if let Some(prog) = pda_seeds.program {
                    sd.insert("program".to_string(), serde_json::Value::String(prog));
                }
                Some(serde_json::Value::Object(sd))
            } else {
                source_data
            }
        } else {
            source_data
        };

        accounts.push(AccountDef {
            name: acct.name.clone(),
            source,
            writable: acct.is_mut,
            is_signer: acct.is_signer,
            source_data: final_source_data,
        });
    }

    // Build data segments: discriminator literal + args in order
    let mut data_segments: Vec<DataSegmentDef> = Vec::new();

    // Discriminator as literal
    data_segments.push(DataSegmentDef {
        segment_type: "literal".to_string(),
        data: Some(serde_json::Value::Array(
            discriminator.iter().map(|&b| serde_json::Value::Number(b.into())).collect(),
        )),
        param_index: None,
    });

    // Each arg as a param segment
    for (i, _arg) in ix.args.iter().enumerate() {
        data_segments.push(DataSegmentDef {
            segment_type: "param".to_string(),
            data: None,
            param_index: Some(i as u8),
        });
    }

    // Generate template
    let template = generate_template(&ix.name, &ix.args);

    // Classify risk
    let (risk_level, timelock) = classify_risk(&ix.name, &ix.args, &ix.accounts);

    Ok(IntentDefinition {
        version: 1,
        program_id: program_id.to_string(),
        instruction_name: ix.name.clone(),
        discriminator,
        params,
        accounts,
        data_segments,
        seeds: all_seeds,
        template,
        risk_level,
        timelock_seconds: timelock,
        verification: Some(VerificationInfo {
            tier: 2,
            program_name: None,
            verified: None,
        }),
    })
}

struct ExtractedSeeds {
    seeds: Vec<SeedDef>,
    program: Option<String>,
}

/// Extract PDA seeds from an account's IDL pda definition.
/// Returns None if the account has no pda field or no seeds.
fn extract_pda_seeds(
    acct: &NormalizedAccount,
    all_accounts: &[NormalizedAccount],
    args: &[NormalizedArg],
) -> Option<ExtractedSeeds> {
    let pda = acct.pda.as_ref()?;
    let pda_obj = pda.as_object()?;
    let seeds_arr = pda_obj.get("seeds")?.as_array()?;

    let mut seeds = Vec::new();

    for seed in seeds_arr {
        let kind = seed.get("kind")?.as_str()?;
        match kind {
            "const" => {
                // Literal bytes
                if let Some(val_arr) = seed.get("value").and_then(|v| v.as_array()) {
                    let bytes: Vec<u8> = val_arr.iter()
                        .filter_map(|v| v.as_u64().map(|n| n as u8))
                        .collect();
                    seeds.push(SeedDef {
                        seed_type: "literal".to_string(),
                        value: Some(serde_json::Value::Array(
                            bytes.iter().map(|&b| serde_json::Value::Number(b.into())).collect(),
                        )),
                        param_index: None,
                        account_index: None,
                    });
                }
            }
            "arg" => {
                // Instruction argument — find matching param index
                let path = seed.get("path").and_then(|p| p.as_str()).unwrap_or("");
                let param_idx = args.iter().position(|a| a.name == path);
                seeds.push(SeedDef {
                    seed_type: "param".to_string(),
                    value: None,
                    param_index: param_idx.map(|i| i as u8),
                    account_index: None,
                });
            }
            "account" => {
                // Account reference — find matching account index
                let path = seed.get("path").and_then(|p| p.as_str()).unwrap_or("");
                // For nested paths like "pool.deposit_mint", use the root account name
                let root_name = path.split('.').next().unwrap_or(path);
                let acct_idx = all_accounts.iter().position(|a| a.name == root_name);

                // If it's a nested path, store the full path in value for reference
                let value = if path.contains('.') {
                    Some(serde_json::Value::String(path.to_string()))
                } else {
                    None
                };

                seeds.push(SeedDef {
                    seed_type: "account".to_string(),
                    value,
                    param_index: None,
                    account_index: acct_idx.map(|i| i as u8),
                });
            }
            _ => {}
        }
    }

    // Extract PDA program override (e.g., Associated Token Program for ATAs)
    let program = pda_obj.get("program").and_then(|prog| {
        let prog_obj = prog.as_object()?;
        let prog_kind = prog_obj.get("kind")?.as_str()?;
        if prog_kind == "const" {
            let val_arr = prog_obj.get("value")?.as_array()?;
            let bytes: Vec<u8> = val_arr.iter()
                .filter_map(|v| v.as_u64().map(|n| n as u8))
                .collect();
            if bytes.len() == 32 {
                Some(bs58::encode(&bytes).into_string())
            } else {
                None
            }
        } else {
            None
        }
    });

    if seeds.is_empty() {
        None
    } else {
        Some(ExtractedSeeds { seeds, program })
    }
}

fn snake_to_pascal(s: &str) -> String {
    s.split('_').map(|w| {
        let mut c = w.chars();
        match c.next() {
            None => String::new(),
            Some(f) => f.to_uppercase().chain(c).collect(),
        }
    }).collect()
}

fn idl_type_size(ty: &serde_json::Value) -> Option<u16> {
    if let Some(s) = ty.as_str() {
        return match s {
            "bool" | "u8" | "i8" => Some(1),
            "u16" | "i16" => Some(2),
            "u32" | "i32" => Some(4),
            "u64" | "i64" => Some(8),
            "u128" | "i128" => Some(16),
            "pubkey" => Some(32),
            _ => None,
        };
    }
    if let Some(obj) = ty.as_object() {
        if let Some(inner) = obj.get("option") {
            return idl_type_size(inner).map(|s| 1 + s);
        }
    }
    None
}

fn idl_field_offset(types: &serde_json::Value, type_name: &str, field_name: &str) -> Option<u16> {
    let types_arr = types.as_array()?;
    let type_def = types_arr.iter().find(|t| t["name"].as_str() == Some(type_name))?;
    let fields = type_def["type"]["fields"].as_array()?;
    let mut offset: u16 = 8; // Anchor discriminator
    for field in fields {
        if field["name"].as_str() == Some(field_name) {
            return Some(offset);
        }
        offset += idl_type_size(&field["type"])?;
    }
    None
}

fn infer_account_source(
    acct: &NormalizedAccount,
    params: &[ParamDef],
    all_accounts: &[NormalizedAccount],
    idl_types: &serde_json::Value,
) -> (String, Option<serde_json::Value>) {
    let name_lower = acct.name.to_lowercase();

    // If it has a fixed address, it's static
    if let Some(addr) = &acct.address {
        return (
            "static".to_string(),
            Some(serde_json::Value::String(addr.clone())),
        );
    }

    // If it has PDA seeds, it's pda
    if acct.pda.is_some() {
        return ("pda".to_string(), None);
    }

    // If signer and admin-like name, it's vault
    let admin_names = [
        "admin",
        "authority",
        "owner",
        "signer",
        "payer",
        "multisig",
        "vault",
    ];
    if acct.is_signer
        && admin_names
            .iter()
            .any(|n| name_lower.contains(n))
    {
        return ("vault".to_string(), None);
    }

    // Check if there's a matching param with address type
    for (i, param) in params.iter().enumerate() {
        if param.param_type == "address" {
            let param_lower = param.name.to_lowercase();
            if name_lower.contains(&param_lower)
                || param_lower.contains(&name_lower)
                || name_lower == format!("{}Account", param.name)
            {
                return (
                    "param".to_string(),
                    Some(serde_json::Value::Number(serde_json::Number::from(i))),
                );
            }
        }
    }

    // If account has relations, try has_one
    if !acct.relations.is_empty() {
        let related_name = &acct.relations[0];
        if let Some(related_idx) = all_accounts.iter().position(|a| &a.name == related_name) {
            let type_name = snake_to_pascal(related_name);
            if let Some(offset) = idl_field_offset(idl_types, &type_name, &acct.name) {
                let mut sd = serde_json::Map::new();
                sd.insert("sourceAccountIndex".into(), related_idx.into());
                sd.insert("dataOffset".into(), serde_json::Value::Number(serde_json::Number::from(offset)));
                return ("has_one".to_string(), Some(serde_json::Value::Object(sd)));
            }
        }
    }

    // Unresolved — caller will create a synthetic param
    ("unresolved".to_string(), None)
}

fn generate_template(ix_name: &str, args: &[NormalizedArg]) -> String {
    let readable_name = intent_utils::snake_case(ix_name).replace('_', " ");

    // Special patterns
    let name_lower = ix_name.to_lowercase();
    if name_lower.contains("update_admin") || name_lower.contains("updateadmin") {
        if let Some(arg) = args.iter().find(|a| {
            let n = a.name.to_lowercase();
            n.contains("admin") || n.contains("authority") || n.contains("owner")
        }) {
            return format!("change admin authority to {{{}}}", arg.name);
        }
    }

    if name_lower.contains("transfer") {
        let amount_arg = args.iter().find(|a| a.name.to_lowercase().contains("amount"));
        let dest_arg = args.iter().find(|a| {
            let n = a.name.to_lowercase();
            n.contains("dest") || n.contains("to") || n.contains("recipient")
        });
        if let (Some(amt), Some(dest)) = (amount_arg, dest_arg) {
            return format!("transfer {{{}}} to {{{}}}", amt.name, dest.name);
        }
    }

    if name_lower.contains("set_authority") || name_lower.contains("setauthority") {
        if let Some(arg) = args.iter().find(|a| {
            let n = a.name.to_lowercase();
            n.contains("new") && (n.contains("authority") || n.contains("admin") || n.contains("owner"))
        }) {
            return format!("set authority to {{{}}}", arg.name);
        }
    }

    // Default: "instruction name: {arg1}, {arg2}, ..."
    if args.is_empty() {
        readable_name
    } else {
        let arg_parts: Vec<String> = args.iter().map(|a| format!("{{{}}}", a.name)).collect();
        format!("{}: {}", readable_name, arg_parts.join(", "))
    }
}

fn classify_risk(
    ix_name: &str,
    args: &[NormalizedArg],
    accounts: &[NormalizedAccount],
) -> (String, u32) {
    let name_lower = ix_name.to_lowercase();

    // Check for CRITICAL patterns
    let critical_names = [
        "admin",
        "authority",
        "owner",
        "upgrade",
        "freeze_program",
        "close_program",
    ];
    let critical_args = ["new_admin", "new_authority", "new_owner"];

    for pattern in &critical_names {
        if name_lower.contains(pattern) {
            return ("CRITICAL".to_string(), 86400);
        }
    }
    for arg in args {
        let arg_lower = arg.name.to_lowercase();
        for pattern in &critical_args {
            if arg_lower.contains(pattern) {
                return ("CRITICAL".to_string(), 86400);
            }
        }
    }

    // Check for HIGH patterns
    let high_names = ["withdraw", "transfer", "mint", "burn", "oracle", "fee"];
    for pattern in &high_names {
        if name_lower.contains(pattern) {
            return ("HIGH".to_string(), 3600);
        }
    }

    // Check for amount + vault/treasury account pattern
    let has_amount = args.iter().any(|a| a.name.to_lowercase().contains("amount"));
    let has_treasury = accounts.iter().any(|a| {
        let n = a.name.to_lowercase();
        n.contains("vault") || n.contains("treasury")
    });
    if has_amount && has_treasury {
        return ("HIGH".to_string(), 3600);
    }

    // Check for MEDIUM patterns
    let medium_names = ["add", "remove", "update", "set", "config"];
    for pattern in &medium_names {
        if name_lower.contains(pattern) {
            return ("MEDIUM".to_string(), 0);
        }
    }

    // Default: LOW
    ("LOW".to_string(), 0)
}
