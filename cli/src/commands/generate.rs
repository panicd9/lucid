use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use std::path::Path;

use crate::types::*;

/// Anchor IDL structures (subset we care about)
#[derive(serde::Deserialize)]
struct AnchorIdl {
    name: String,
    instructions: Vec<AnchorInstruction>,
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
    #[serde(rename = "isMut")]
    is_mut: bool,
    #[serde(rename = "isSigner")]
    is_signer: bool,
    #[serde(default)]
    pda: Option<serde_json::Value>,
    #[serde(default)]
    address: Option<String>,
}

#[derive(serde::Deserialize)]
struct AnchorArg {
    name: String,
    #[serde(rename = "type")]
    arg_type: serde_json::Value,
}

pub fn generate(idl_path: &str, output_dir: &str) -> Result<()> {
    let idl_content = std::fs::read_to_string(idl_path)
        .with_context(|| format!("Failed to read IDL: {}", idl_path))?;
    let idl: AnchorIdl =
        serde_json::from_str(&idl_content).context("Failed to parse IDL JSON")?;

    std::fs::create_dir_all(output_dir)?;

    println!("Generating intents from IDL: {}", idl.name);

    for ix in &idl.instructions {
        let intent = generate_intent_from_instruction(ix, &idl.name)?;
        let filename = format!("{}.json", snake_case(&ix.name));
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
    ix: &AnchorInstruction,
    _program_name: &str,
) -> Result<IntentDefinition> {
    // Compute discriminator: SHA-256("global:{snake_case_name}")[..8]
    let disc_input = format!("global:{}", snake_case(&ix.name));
    let mut hasher = Sha256::new();
    hasher.update(disc_input.as_bytes());
    let hash = hasher.finalize();
    let discriminator: Vec<u8> = hash[..8].to_vec();

    // Map args to params
    let mut params: Vec<ParamDef> = Vec::new();
    for arg in &ix.args {
        let param_type = map_idl_type(&arg.arg_type);
        params.push(ParamDef {
            name: arg.name.clone(),
            param_type,
            constraint_type: "none".to_string(),
            constraint_value: 0,
        });
    }

    // Map accounts
    let mut accounts: Vec<AccountDef> = Vec::new();
    for acct in &ix.accounts {
        let (source, source_data) = infer_account_source(acct, &params);
        accounts.push(AccountDef {
            name: acct.name.clone(),
            source,
            writable: acct.is_mut,
            is_signer: acct.is_signer,
            source_data,
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
        program_id: String::new(), // User must fill in program_id
        instruction_name: ix.name.clone(),
        discriminator,
        params,
        accounts,
        data_segments,
        seeds: Vec::new(),
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

fn map_idl_type(ty: &serde_json::Value) -> String {
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
        if obj.contains_key("option") {
            if let Some(inner) = obj.get("option") {
                return map_idl_type(inner);
            }
        }
        "u64".to_string()
    } else {
        "u64".to_string()
    }
}

fn infer_account_source(
    acct: &AnchorAccount,
    params: &[ParamDef],
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

    // Default to param (user will need to fix)
    ("param".to_string(), None)
}

fn generate_template(ix_name: &str, args: &[AnchorArg]) -> String {
    let readable_name = snake_case(ix_name).replace('_', " ");

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
    args: &[AnchorArg],
    accounts: &[AnchorAccount],
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
