use solana_sdk::pubkey::Pubkey;

/// Program ID - placeholder until deployed
pub const PROGRAM_ID: Pubkey = solana_sdk::pubkey!("LUC5TbUhLpT2dZuC2qA4vMZdxJXsbcsUVejTqLJBJWR");

pub const WALLET_SEED: &[u8] = b"wallet";
pub const VAULT_SEED: &[u8] = b"vault";
pub const INTENT_SEED: &[u8] = b"intent";
pub const PROPOSAL_SEED: &[u8] = b"proposal";
pub const EVENT_AUTHORITY_SEED: &[u8] = b"event_authority";

pub fn find_wallet_pda(create_key: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[WALLET_SEED, create_key.as_ref()], program_id)
}

pub fn find_vault_pda(wallet: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_SEED, wallet.as_ref()], program_id)
}

pub fn find_intent_pda(wallet: &Pubkey, index: u8, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[INTENT_SEED, wallet.as_ref(), &[index]], program_id)
}

pub fn find_proposal_pda(intent: &Pubkey, proposal_index: u64, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[PROPOSAL_SEED, intent.as_ref(), &proposal_index.to_le_bytes()],
        program_id,
    )
}

pub fn find_event_authority_pda(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[EVENT_AUTHORITY_SEED], program_id)
}
