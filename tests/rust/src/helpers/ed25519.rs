use ed25519_dalek::{Signer, SigningKey};
use solana_instruction::Instruction;

use super::OFFCHAIN_HEADER_PREFIX;

/// Build the offchain message bytes.
/// Format: \xffsolana offchain + version(0) + format(0=ASCII) + length(u16 LE) + body
pub fn build_offchain_message(
    expiry_str: &str,
    action: &str,
    rendered_template: &str,
    wallet_name: &str,
    proposal_index: u64,
) -> Vec<u8> {
    let body = format!(
        "expires {}: {} {} | wallet: {} proposal: {}",
        expiry_str, action, rendered_template, wallet_name, proposal_index
    );

    let body_bytes = body.as_bytes();
    let body_len = body_bytes.len() as u16;

    let mut msg = Vec::new();
    msg.extend_from_slice(OFFCHAIN_HEADER_PREFIX);
    msg.push(0); // version
    msg.push(0); // format (ASCII)
    msg.extend_from_slice(&body_len.to_le_bytes());
    msg.extend_from_slice(body_bytes);

    msg
}

/// Create an Ed25519 precompile instruction with a signed offchain message.
/// Must be placed at index 0 in the transaction.
pub fn create_ed25519_instruction(
    signing_key: &SigningKey,
    message: &[u8],
) -> Instruction {
    let signature = signing_key.sign(message);
    let pubkey_bytes = signing_key.verifying_key().to_bytes();
    let sig_bytes = signature.to_bytes();

    // Ed25519 instruction data layout:
    // [0]    num_signatures: u8 = 1
    // [1]    padding: u8 = 0
    // [2..4] signature_offset: u16 LE
    // [4..6] signature_instruction_index: u16 LE = 0xFFFF (same instruction)
    // [6..8] public_key_offset: u16 LE
    // [8..10] public_key_instruction_index: u16 LE = 0xFFFF
    // [10..12] message_data_offset: u16 LE
    // [12..14] message_data_size: u16 LE
    // [14..16] message_instruction_index: u16 LE = 0xFFFF
    // [16..48] public_key (32 bytes)
    // [48..112] signature (64 bytes)
    // [112..] message

    let pubkey_offset: u16 = 16;
    let signature_offset: u16 = 48;
    let message_offset: u16 = 112;
    let message_size: u16 = message.len() as u16;
    let same_ix: u16 = 0xFFFF;

    let mut data = Vec::with_capacity(112 + message.len());
    data.push(1); // num_signatures
    data.push(0); // padding
    data.extend_from_slice(&signature_offset.to_le_bytes());
    data.extend_from_slice(&same_ix.to_le_bytes());
    data.extend_from_slice(&pubkey_offset.to_le_bytes());
    data.extend_from_slice(&same_ix.to_le_bytes());
    data.extend_from_slice(&message_offset.to_le_bytes());
    data.extend_from_slice(&message_size.to_le_bytes());
    data.extend_from_slice(&same_ix.to_le_bytes());
    data.extend_from_slice(&pubkey_bytes);
    data.extend_from_slice(&sig_bytes);
    data.extend_from_slice(message);

    Instruction {
        program_id: solana_sdk_ids::ed25519_program::id(),
        accounts: vec![],
        data,
    }
}

/// Render a custom intent template with parameter substitution
pub fn render_custom_template(template: &str, params: &[String]) -> String {
    let mut result = template.to_string();
    for (i, param) in params.iter().enumerate() {
        result = result.replace(&format!("{{{}}}", i), param);
    }
    result
}

/// Build a future expiry timestamp string
pub fn future_expiry() -> String {
    "2030-01-01 00:00:00".to_string()
}

/// Build an expired timestamp string
pub fn past_expiry() -> String {
    "2020-01-01 00:00:00".to_string()
}

/// Convert a solana_keypair::Keypair to an ed25519_dalek::SigningKey
pub fn keypair_to_signing_key(keypair: &solana_keypair::Keypair) -> SigningKey {
    let bytes = keypair.to_bytes();
    SigningKey::from_bytes(&bytes[..32].try_into().unwrap())
}
