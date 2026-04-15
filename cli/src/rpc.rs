use anyhow::{Context, Result};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signature},
    signer::Signer,
    transaction::Transaction,
};

pub fn create_client(url: &str) -> RpcClient {
    RpcClient::new_with_commitment(url.to_string(), CommitmentConfig::confirmed())
}

pub fn fetch_account(client: &RpcClient, address: &Pubkey) -> Result<Vec<u8>> {
    let account = client
        .get_account(address)
        .with_context(|| format!("Failed to fetch account {}", address))?;
    Ok(account.data)
}

pub fn send_and_confirm(
    client: &RpcClient,
    transaction: &Transaction,
) -> Result<Signature> {
    let sig = client
        .send_and_confirm_transaction(transaction)
        .map_err(|e| {
            let msg = e.to_string();
            // Try to extract "custom program error: 0xNN" and decode it
            if let Some(hex_start) = msg.find("custom program error: 0x") {
                let hex_str = &msg[hex_start + 24..];
                let hex_end = hex_str.find(|c: char| !c.is_ascii_hexdigit()).unwrap_or(hex_str.len());
                if let Ok(code) = u32::from_str_radix(&hex_str[..hex_end], 16) {
                    if let Some(name) = decode_program_error(code) {
                        return anyhow::anyhow!("{} (error {}/0x{:x})\n\nRaw: {}", name, code, code, msg);
                    }
                }
            }
            anyhow::anyhow!("Failed to send and confirm transaction: {}", msg)
        })?;
    Ok(sig)
}

fn decode_program_error(code: u32) -> Option<&'static str> {
    match code {
        100 => Some("Intent is deactivated"),
        101 => Some("Wallet is frozen"),
        102 => Some("Proposal index mismatch"),
        103 => Some("Proposal is not active"),
        104 => Some("Already approved by this signer"),
        105 => Some("Already cancelled by this signer"),
        106 => Some("Proposal is not approved"),
        107 => Some("Timelock not reached — proposal was approved too recently"),
        108 => Some("Signing message mismatch — CLI and on-chain rendered different messages"),
        109 => Some("Signer not found in intent's proposer/approver list"),
        110 => Some("Account mismatch — resolved account doesn't match expected"),
        111 => Some("Parameter constraint violated"),
        112 => Some("Invalid Ed25519 instruction"),
        113 => Some("Proposal has expired"),
        114 => Some("Wallet name too long"),
        115 => Some("No signers provided"),
        116 => Some("Invalid threshold"),
        117 => Some("Wallet is not frozen"),
        118 => Some("Active proposals exist — cannot modify"),
        119 => Some("Wallet is already frozen"),
        120 => Some("Batch too large"),
        121 => Some("Intent is already active"),
        122 => Some("Invalid intent type"),
        123 => Some("Proposal has expired"),
        124 => Some("Invalid offchain message header"),
        125 => Some("Arithmetic overflow"),
        126 => Some("Operation only allowed during setup phase"),
        127 => Some("Recursion depth exceeded"),
        128 => Some("Program ID mismatch"),
        129 => Some("Too many signers"),
        _ => None,
    }
}

/// Build an Ed25519 precompile instruction using the solana keypair
pub fn build_ed25519_instruction(keypair: &Keypair, message: &[u8]) -> Result<Instruction> {
    // Sign the message
    let signature = keypair.sign_message(message);
    let sig_bytes: [u8; 64] = signature.into();
    let pubkey_bytes: [u8; 32] = keypair.pubkey().to_bytes();

    #[allow(deprecated)]
    Ok(solana_sdk::ed25519_instruction::new_ed25519_instruction_with_signature(
        message,
        &sig_bytes,
        &pubkey_bytes,
    ))
}

pub fn load_keypair(path: &str) -> Result<Keypair> {
    let expanded = shellexpand::tilde(path).to_string();
    let data = std::fs::read_to_string(&expanded)
        .with_context(|| format!("Failed to read keypair file: {}", expanded))?;
    let bytes: Vec<u8> = serde_json::from_str(&data)
        .with_context(|| "Failed to parse keypair JSON")?;
    Keypair::try_from(bytes.as_slice())
        .map_err(|e| anyhow::anyhow!("Invalid keypair: {}", e))
}
