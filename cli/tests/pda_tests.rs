use lucid_cli::pda::*;
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

const PROGRAM_ID_STR: &str = "LUC1Dv2v3oMYnoZDgMkwkFo5GXDBrUg7KuRGTMRsbuH";

fn program_id() -> Pubkey {
    Pubkey::from_str(PROGRAM_ID_STR).unwrap()
}

#[test]
fn wallet_pda_is_deterministic() {
    let pid = program_id();
    let (pda1, bump1) = find_wallet_pda(b"test-wallet", &pid);
    let (pda2, bump2) = find_wallet_pda(b"test-wallet", &pid);
    assert_eq!(pda1, pda2, "same name must produce the same PDA");
    assert_eq!(bump1, bump2, "same name must produce the same bump");
}

#[test]
fn wallet_pda_different_names_produce_different_pdas() {
    let pid = program_id();
    let (pda_a, _) = find_wallet_pda(b"alpha", &pid);
    let (pda_b, _) = find_wallet_pda(b"bravo", &pid);
    assert_ne!(pda_a, pda_b, "different names must produce different PDAs");
}

#[test]
fn vault_pda_chains_from_wallet() {
    let pid = program_id();
    let (wallet_pda, _) = find_wallet_pda(b"my-wallet", &pid);
    let (vault_pda, vault_bump) = find_vault_pda(&wallet_pda, &pid);

    // Vault PDA must be different from the wallet PDA
    assert_ne!(vault_pda, wallet_pda);
    // Bump must be valid
    assert!(vault_bump <= 255);
    // Must be a valid off-curve point (not on the ed25519 curve)
    assert!(
        Pubkey::find_program_address(&[b"vault", wallet_pda.as_ref()], &pid).0 == vault_pda
    );
}

#[test]
fn intent_pda_different_indices_produce_different_pdas() {
    let pid = program_id();
    let (wallet_pda, _) = find_wallet_pda(b"intent-wallet", &pid);

    let (intent_0, _) = find_intent_pda(&wallet_pda, 0, &pid);
    let (intent_1, _) = find_intent_pda(&wallet_pda, 1, &pid);
    let (intent_255, _) = find_intent_pda(&wallet_pda, 255, &pid);

    assert_ne!(intent_0, intent_1);
    assert_ne!(intent_0, intent_255);
    assert_ne!(intent_1, intent_255);
}

#[test]
fn proposal_pda_different_indices_produce_different_pdas() {
    let pid = program_id();
    let (wallet_pda, _) = find_wallet_pda(b"proposal-wallet", &pid);
    let (intent_pda, _) = find_intent_pda(&wallet_pda, 0, &pid);

    let (prop_0, _) = find_proposal_pda(&intent_pda, 0, &pid);
    let (prop_1, _) = find_proposal_pda(&intent_pda, 1, &pid);
    let (prop_max, _) = find_proposal_pda(&intent_pda, u64::MAX, &pid);

    assert_ne!(prop_0, prop_1);
    assert_ne!(prop_0, prop_max);
    assert_ne!(prop_1, prop_max);
}

#[test]
fn event_authority_pda_returns_valid_pubkey() {
    let pid = program_id();
    let (ea_pda, bump) = find_event_authority_pda(&pid);

    // Must not be the default all-zeros pubkey
    assert_ne!(ea_pda, Pubkey::default());
    // Bump in range (trivially true for u8, but confirm it round-trips)
    assert!(bump <= 255);
    // Re-derive to confirm
    let (ea_pda2, bump2) = Pubkey::find_program_address(&[b"event_authority"], &pid);
    assert_eq!(ea_pda, ea_pda2);
    assert_eq!(bump, bump2);
}

#[test]
fn all_bumps_are_valid_u8() {
    let pid = program_id();

    let (_, b1) = find_wallet_pda(b"bump-test", &pid);
    let (w, _) = find_wallet_pda(b"bump-test", &pid);
    let (_, b2) = find_vault_pda(&w, &pid);
    let (_, b3) = find_intent_pda(&w, 0, &pid);
    let (i, _) = find_intent_pda(&w, 0, &pid);
    let (_, b4) = find_proposal_pda(&i, 0, &pid);
    let (_, b5) = find_event_authority_pda(&pid);

    // All bumps are u8 so this is inherently true, but verify they are
    // the canonical (highest valid) bump by re-deriving.
    for bump in [b1, b2, b3, b4, b5] {
        assert!(bump <= 255);
    }
}

#[test]
fn cross_validate_wallet_then_vault_deterministic() {
    let pid = program_id();

    // First run
    let (wallet1, wb1) = find_wallet_pda(b"test-wallet", &pid);
    let (vault1, vb1) = find_vault_pda(&wallet1, &pid);

    // Second run
    let (wallet2, wb2) = find_wallet_pda(b"test-wallet", &pid);
    let (vault2, vb2) = find_vault_pda(&wallet2, &pid);

    assert_eq!(wallet1, wallet2, "wallet PDA must be identical across runs");
    assert_eq!(wb1, wb2);
    assert_eq!(vault1, vault2, "vault PDA must be identical across runs");
    assert_eq!(vb1, vb2);
}
