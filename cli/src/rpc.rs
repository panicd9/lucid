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
        .with_context(|| "Failed to send and confirm transaction")?;
    Ok(sig)
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
    Keypair::from_bytes(&bytes)
        .map_err(|e| anyhow::anyhow!("Invalid keypair: {}", e))
}
