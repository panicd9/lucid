use ed25519_dalek::{Signer, SigningKey};
use lucid::state::constants::V0_APP_DOMAIN;
use solana_instruction::Instruction;

use super::{OFFCHAIN_HEADER_PREFIX, OFFCHAIN_HEADER_LEN_V1};

fn build_body(
    expiry_str: &str,
    action: &str,
    rendered_template: &str,
    wallet_name: &str,
    wallet_pda_b58: &str,
    proposal_index: u64,
) -> String {
    format!(
        "{} {} | wallet: {} ({}); proposal: #{}; expires: {};",
        action, rendered_template, wallet_name, wallet_pda_b58, proposal_index, expiry_str
    )
}

/// Build a sRFC 38 v1 single-signer offchain message envelope:
///   prefix(16) + version(1) + numSigners(1) + signerPubkey(32) + body
///
/// `wallet_pda_b58` in the body prevents cross-wallet signature replay
/// between wallets sharing a name; the embedded signer pubkey adds a
/// complementary envelope-level binding to the signer's identity.
pub fn build_offchain_message(
    signer_pubkey: &[u8; 32],
    expiry_str: &str,
    action: &str,
    rendered_template: &str,
    wallet_name: &str,
    wallet_pda_b58: &str,
    proposal_index: u64,
) -> Vec<u8> {
    let body = build_body(expiry_str, action, rendered_template, wallet_name, wallet_pda_b58, proposal_index);
    let body_bytes = body.as_bytes();

    let mut msg = Vec::with_capacity(OFFCHAIN_HEADER_LEN_V1 + body_bytes.len());
    msg.extend_from_slice(OFFCHAIN_HEADER_PREFIX);
    msg.push(0x01); // version
    msg.push(0x01); // numSigners
    msg.extend_from_slice(signer_pubkey);
    msg.extend_from_slice(body_bytes);
    msg
}

/// Build a V0 offchain message envelope (the format the released Ledger
/// Solana app emits). Guards the on-chain `parse_v0` path from silent
/// breakage:
///   prefix(16) + version(0) + appDomain(32) + format(1) + numSigners(1)
///   + signerPubkey(32) + bodyLen(u16 LE) + body
pub fn build_offchain_message_v0(
    signer_pubkey: &[u8; 32],
    expiry_str: &str,
    action: &str,
    rendered_template: &str,
    wallet_name: &str,
    wallet_pda_b58: &str,
    proposal_index: u64,
) -> Vec<u8> {
    let body = build_body(expiry_str, action, rendered_template, wallet_name, wallet_pda_b58, proposal_index);
    let body_bytes = body.as_bytes();
    let body_len = body_bytes.len() as u16;

    let mut msg = Vec::with_capacity(85 + body_bytes.len());
    msg.extend_from_slice(OFFCHAIN_HEADER_PREFIX);
    msg.push(0x00); // version
    msg.extend_from_slice(&V0_APP_DOMAIN);
    msg.push(0x00); // format = ASCII
    msg.push(0x01); // numSigners
    msg.extend_from_slice(signer_pubkey);
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

/// Build a future expiry timestamp string (DD Mon YYYY HH:MM:SS UTC)
pub fn future_expiry() -> String {
    "01 Jan 2030 00:00:00 UTC".to_string()
}

/// Build an expired timestamp string (DD Mon YYYY HH:MM:SS UTC)
pub fn past_expiry() -> String {
    "01 Jan 2020 00:00:00 UTC".to_string()
}

/// Convert a solana_keypair::Keypair to an ed25519_dalek::SigningKey
pub fn keypair_to_signing_key(keypair: &solana_keypair::Keypair) -> SigningKey {
    let bytes = keypair.to_bytes();
    SigningKey::from_bytes(&bytes[..32].try_into().unwrap())
}

/// Canonical message format — single source of truth is tests/vectors/message_format.json.
///
/// If the format changes, update the golden file and all three producers:
///   1. programs/lucid/src/state/message.rs  (on-chain build_message)
///   2. tests/rust/src/helpers/ed25519.rs     (test helper build_offchain_message)
///   3. sdk/src/signer.ts                     (SDK IntentSigner.buildMessage)
#[cfg(test)]
mod tests {
    use super::*;

    #[derive(serde::Deserialize)]
    struct MessageVector {
        description: String,
        action: String,
        rendered_template: String,
        wallet_name: String,
        wallet_pda_b58: String,
        proposal_index: u64,
        expiry: String,
        expected_body: String,
    }

    fn load_vectors() -> Vec<MessageVector> {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/vectors/message_format.json");
        let content = std::fs::read_to_string(path)
            .expect("Failed to read tests/vectors/message_format.json — golden file missing");
        serde_json::from_str(&content).expect("Failed to parse message_format.json")
    }

    #[test]
    fn message_body_matches_golden_vectors() {
        let vectors = load_vectors();
        assert!(!vectors.is_empty(), "Golden file must contain at least one vector");

        // Pubkey is fixed; the test asserts on body content only.
        let signer_pubkey = [0xABu8; 32];

        for v in &vectors {
            let msg = build_offchain_message(
                &signer_pubkey,
                &v.expiry,
                &v.action,
                &v.rendered_template,
                &v.wallet_name,
                &v.wallet_pda_b58,
                v.proposal_index,
            );

            let body = std::str::from_utf8(&msg[OFFCHAIN_HEADER_LEN_V1..]).unwrap();

            assert_eq!(
                body, v.expected_body,
                "Vector '{}' failed.\n  Got:      {}\n  Expected: {}",
                v.description, body, v.expected_body
            );
        }
    }
}
