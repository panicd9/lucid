use solana_signer::Signer;

use lucid_tests::helpers::{self, instructions, pda, setup};

// ─────────────────────��────────────────────────────���─────────────────────
// CreateWallet
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_create_wallet_basic() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"test-wallet", 1, 2, 1, 1, 0);

    let wallet = setup::read_wallet_state(&svm, &ws.wallet);
    assert_eq!(wallet.proposal_index, 0);
    assert_eq!(wallet.intent_count, 3);
    assert_eq!(wallet.frozen, 0);
    assert_eq!(wallet.name_len, 11);
}

#[test]
fn test_create_wallet_with_max_name() {
    let mut svm = setup::new_svm();
    let name = b"abcdefghijklmnopqrstuvwxyz012345"; // 32 bytes
    let ws = setup::create_test_wallet(&mut svm, name, 1, 1, 1, 1, 3600);

    let wallet = setup::read_wallet_state(&svm, &ws.wallet);
    assert_eq!(wallet.name_len, 32);
}

#[test]
fn test_create_wallet_multiple_signers() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"multi", 3, 5, 3, 2, 86400);

    let wallet = setup::read_wallet_state(&svm, &ws.wallet);
    assert_eq!(wallet.intent_count, 3);
    assert_eq!(wallet.frozen, 0);

    // Verify meta-intents exist
    for i in 0..3 {
        let data = setup::get_account_data(&svm, &ws.intents[i]);
        assert!(data.is_some(), "meta-intent {} not found", i);
        let data = data.unwrap();
        assert_eq!(data[0], helpers::DISC_INTENT);
        assert_eq!(data[1], helpers::ACCOUNT_VERSION);
    }
}

#[test]
fn test_create_wallet_vault_exists() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"vtest", 1, 1, 1, 1, 0);

    let data = setup::get_account_data(&svm, &ws.vault);
    assert!(data.is_some(), "vault not found");
    let data = data.unwrap();
    assert_eq!(data[0], helpers::DISC_VAULT);
    assert_eq!(data[1], helpers::ACCOUNT_VERSION);
}

// ──────────────────────────────────────────────────���─────────────────────
// AddIntent
// ──────────────────────────────────────────────────────��─────────────────

#[test]
fn test_add_intent_during_setup() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"add-test", 1, 1, 1, 1, 0);

    let mut builder = helpers::intent::IntentDataBuilder::new();
    builder.intent_type = helpers::INTENT_TYPE_CUSTOM;
    builder.approval_threshold = 1;
    builder.cancellation_threshold = 1;
    builder.timelock_seconds = 0;
    builder.template = b"hello world".to_vec();
    builder.proposers.push(ws.proposers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[0].pubkey().to_bytes());

    let intent_data = builder.build();

    let ix = instructions::add_intent(
        &ws.wallet, 3, &intent_data, &ws.payer.pubkey(),
    );

    let result = setup::send_tx(&mut svm, &[ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_ok(), "AddIntent failed: {:?}", result.err());

    let wallet = setup::read_wallet_state(&svm, &ws.wallet);
    assert_eq!(wallet.intent_count, 4);

    let pid = helpers::program_id();
    let (intent_pda, _) = pda::find_intent_pda(&ws.wallet, 3, &pid);
    let data = setup::get_account_data(&svm, &intent_pda);
    assert!(data.is_some(), "intent account not found");
}

#[test]
fn test_add_intents_batch() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"batch-test", 1, 1, 1, 1, 0);

    let mut intents = Vec::new();
    for i in 0..3 {
        let mut builder = helpers::intent::IntentDataBuilder::new();
        builder.intent_type = helpers::INTENT_TYPE_CUSTOM;
        builder.approval_threshold = 1;
        builder.cancellation_threshold = 1;
        builder.template = format!("action {}", i).into_bytes();
        builder.proposers.push(ws.proposers[0].pubkey().to_bytes());
        builder.approvers.push(ws.approvers[0].pubkey().to_bytes());
        intents.push(builder.build());
    }

    let ix = instructions::add_intents_batch(
        &ws.wallet, 3, &intents, &ws.payer.pubkey(),
    );

    let result = setup::send_tx(&mut svm, &[ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_ok(), "AddIntentsBatch failed: {:?}", result.err());

    let wallet = setup::read_wallet_state(&svm, &ws.wallet);
    assert_eq!(wallet.intent_count, 6);
}

// ────────────────────────────────────────────────────────────────────────
// DeactivateIntent
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_deactivate_intent() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"deact-test", 1, 1, 1, 1, 0);

    // Add a custom intent first
    let mut builder = helpers::intent::IntentDataBuilder::new();
    builder.intent_type = helpers::INTENT_TYPE_CUSTOM;
    builder.approval_threshold = 1;
    builder.cancellation_threshold = 1;
    builder.template = b"test deactivate".to_vec();
    builder.proposers.push(ws.proposers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[0].pubkey().to_bytes());

    let ix = instructions::add_intent(
        &ws.wallet, 3, &builder.build(), &ws.payer.pubkey(),
    );
    let result = setup::send_tx(&mut svm, &[ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_ok());

    // Deactivate intent 3
    let pid = helpers::program_id();
    let (intent_pda, _) = pda::find_intent_pda(&ws.wallet, 3, &pid);

    let ix = instructions::deactivate_intent(
        &ws.wallet, &intent_pda, &ws.approvers[0].pubkey(), 3,
    );

    let result = setup::send_tx(
        &mut svm, &[ix], &ws.payer, &[&ws.payer, &ws.approvers[0]],
    );
    assert!(result.is_ok(), "DeactivateIntent failed: {:?}", result.err());

    assert_eq!(setup::read_intent_header(&svm, &intent_pda).approved, 0);
}

// ──────────────────────────────────────────��─────────────────────────────
// FreezeWallet
// ────────────────────────────────────────────��───────────────────────────

#[test]
fn test_freeze_wallet() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"freeze-test", 1, 1, 1, 1, 0);

    let ix = instructions::freeze_wallet(
        &ws.wallet, &ws.intents[0], &ws.approvers[0].pubkey(),
    );

    let result = setup::send_tx(
        &mut svm, &[ix], &ws.payer, &[&ws.payer, &ws.approvers[0]],
    );
    assert!(result.is_ok(), "FreezeWallet failed: {:?}", result.err());

    let wallet = setup::read_wallet_state(&svm, &ws.wallet);
    assert_eq!(wallet.frozen, 1);
}
