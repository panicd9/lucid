use solana_keypair::Keypair;
use solana_signer::Signer;

use lucid_tests::helpers::{self, ed25519, instructions, pda, setup};

// ────────────────────────────────────────────────────────────────────────
// Setup-phase enforcement
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_add_intent_rejected_after_first_proposal() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"setup-only", 1, 1, 1, 1, 0);

    // Add a custom intent (succeeds during setup)
    let mut builder = helpers::intent::IntentDataBuilder::new();
    builder.intent_type = helpers::INTENT_TYPE_CUSTOM;
    builder.approval_threshold = 1;
    builder.cancellation_threshold = 1;
    builder.template = b"test action".to_vec();
    builder.proposers.push(ws.proposers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[0].pubkey().to_bytes());
    let intent_data = builder.build();

    let ix = instructions::add_intent(&ws.wallet, 3, &intent_data, &ws.payer.pubkey());
    let result = setup::send_tx(&mut svm, &[ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_ok());

    // Propose on intent 3 to move past setup phase
    let pid = helpers::program_id();
    let (intent_pda, _) = pda::find_intent_pda(&ws.wallet, 3, &pid);
    let wallet_name = std::str::from_utf8(&ws.name).unwrap();
    let expiry = ed25519::future_expiry();
    let rendered = "test action";
    let msg = ed25519::build_offchain_message(&expiry, "propose", rendered, wallet_name, 0);
    let sk = ed25519::keypair_to_signing_key(&ws.proposers[0]);

    let result = setup::send_tx(
        &mut svm,
        &[
            ed25519::create_ed25519_instruction(&sk, &msg),
            instructions::propose(&ws.wallet, &intent_pda, 0, &[], &ws.payer.pubkey()),
        ],
        &ws.payer,
        &[&ws.payer],
    );
    assert!(result.is_ok(), "Propose failed: {:?}", result.err());

    // Now wallet.proposal_index == 1, setup phase is over
    let state = setup::read_wallet_state(&svm, &ws.wallet);
    assert_eq!(state.proposal_index, 1);

    // Try to add another intent — should fail
    let mut builder2 = helpers::intent::IntentDataBuilder::new();
    builder2.intent_type = helpers::INTENT_TYPE_CUSTOM;
    builder2.approval_threshold = 1;
    builder2.cancellation_threshold = 1;
    builder2.template = b"blocked action".to_vec();
    builder2.proposers.push(ws.proposers[0].pubkey().to_bytes());
    builder2.approvers.push(ws.approvers[0].pubkey().to_bytes());

    let ix = instructions::add_intent(&ws.wallet, 4, &builder2.build(), &ws.payer.pubkey());
    let result = setup::send_tx(&mut svm, &[ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_err(), "AddIntent should fail after setup phase");
}

// ────────────────────────────────────────────────────────────────────────
// Frozen wallet enforcement
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_frozen_wallet_rejects_add_intent() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"frozen-add", 1, 1, 1, 1, 0);

    // Freeze the wallet
    let ix = instructions::freeze_wallet(
        &ws.wallet, &ws.intents[0], &ws.approvers[0].pubkey(),
    );
    let result = setup::send_tx(
        &mut svm, &[ix], &ws.payer, &[&ws.payer, &ws.approvers[0]],
    );
    assert!(result.is_ok());

    // Try to add intent — should fail (frozen + setup phase check)
    let mut builder = helpers::intent::IntentDataBuilder::new();
    builder.intent_type = helpers::INTENT_TYPE_CUSTOM;
    builder.template = b"blocked".to_vec();
    builder.proposers.push(ws.proposers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[0].pubkey().to_bytes());
    builder.approval_threshold = 1;
    builder.cancellation_threshold = 1;

    let ix = instructions::add_intent(&ws.wallet, 3, &builder.build(), &ws.payer.pubkey());
    let result = setup::send_tx(&mut svm, &[ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_err(), "Should fail: wallet is frozen");
}

// ────────────────────────────────────────────────────────────────────────
// Double freeze rejection
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_double_freeze_rejected() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"dbl-freeze", 1, 1, 1, 1, 0);

    let ix = instructions::freeze_wallet(
        &ws.wallet, &ws.intents[0], &ws.approvers[0].pubkey(),
    );
    let result = setup::send_tx(
        &mut svm, &[ix], &ws.payer, &[&ws.payer, &ws.approvers[0]],
    );
    assert!(result.is_ok());

    // Freeze again — should fail
    let ix = instructions::freeze_wallet(
        &ws.wallet, &ws.intents[0], &ws.approvers[0].pubkey(),
    );
    let result = setup::send_tx(
        &mut svm, &[ix], &ws.payer, &[&ws.payer, &ws.approvers[0]],
    );
    assert!(result.is_err(), "Double freeze should fail");
}

// ────────────────────────────────────────────────────────────────────────
// Unauthorized deactivate (non-approver signer)
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_deactivate_by_non_approver_rejected() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"unauth-deact", 1, 1, 1, 1, 0);

    // Add a custom intent
    let mut builder = helpers::intent::IntentDataBuilder::new();
    builder.intent_type = helpers::INTENT_TYPE_CUSTOM;
    builder.approval_threshold = 1;
    builder.cancellation_threshold = 1;
    builder.template = b"test".to_vec();
    builder.proposers.push(ws.proposers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[0].pubkey().to_bytes());

    let ix = instructions::add_intent(&ws.wallet, 3, &builder.build(), &ws.payer.pubkey());
    setup::send_tx(&mut svm, &[ix], &ws.payer, &[&ws.payer]).unwrap();

    let pid = helpers::program_id();
    let (intent_pda, _) = pda::find_intent_pda(&ws.wallet, 3, &pid);

    // Try deactivate with a random keypair (not an approver)
    let random_kp = Keypair::new();
    setup::airdrop(&mut svm, &random_kp.pubkey(), 1_000_000_000);

    let ix = instructions::deactivate_intent(
        &ws.wallet, &intent_pda, &random_kp.pubkey(), 3,
    );
    let result = setup::send_tx(
        &mut svm, &[ix], &random_kp, &[&random_kp],
    );
    assert!(result.is_err(), "Non-approver should not be able to deactivate");

    // Verify intent is still active
    assert_eq!(setup::read_intent_approved(&svm, &intent_pda), 1);
}

// ────────────────────────────────────────────────────────────────────────
// Unauthorized freeze (non-approver signer)
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_freeze_by_non_approver_rejected() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"unauth-frz", 1, 1, 1, 1, 0);

    let random_kp = Keypair::new();
    setup::airdrop(&mut svm, &random_kp.pubkey(), 1_000_000_000);

    let ix = instructions::freeze_wallet(
        &ws.wallet, &ws.intents[0], &random_kp.pubkey(),
    );
    let result = setup::send_tx(
        &mut svm, &[ix], &random_kp, &[&random_kp],
    );
    assert!(result.is_err(), "Non-approver should not be able to freeze");

    let state = setup::read_wallet_state(&svm, &ws.wallet);
    assert_eq!(state.frozen, 0);
}

// ────────────────────────────────────────────────────────────────────────
// Invalid wallet name
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_create_wallet_name_too_long() {
    let mut svm = setup::new_svm();
    let payer = Keypair::new();
    setup::airdrop(&mut svm, &payer.pubkey(), 100_000_000_000);

    // Use a valid 32-byte name for PDA derivation, but send 33-byte name in instruction data
    let valid_name = b"this-name-is-way-too-long-for-wa"; // 32 bytes (valid for PDA)
    let bad_name = b"this-name-is-way-too-long-for-wal"; // 33 bytes (too long)
    let proposer = Keypair::new().pubkey();
    let approver = Keypair::new().pubkey();

    let pid = helpers::program_id();
    let (wallet_pda, _) = pda::find_wallet_pda(valid_name, &pid);
    let (vault_pda, _) = pda::find_vault_pda(&wallet_pda, &pid);
    let (intent0, _) = pda::find_intent_pda(&wallet_pda, 0, &pid);
    let (intent1, _) = pda::find_intent_pda(&wallet_pda, 1, &pid);
    let (intent2, _) = pda::find_intent_pda(&wallet_pda, 2, &pid);

    // Build instruction data with the 33-byte name
    let mut data = vec![0u8]; // discriminator
    data.push(bad_name.len() as u8);
    data.extend_from_slice(bad_name);
    data.push(1u8); // proposer count
    data.extend_from_slice(proposer.as_ref());
    data.push(1u8); // approver count
    data.extend_from_slice(approver.as_ref());
    data.push(1u8); // approval_threshold
    data.push(1u8); // cancellation_threshold
    data.extend_from_slice(&0u32.to_le_bytes()); // timelock

    let ix = solana_instruction::Instruction {
        program_id: pid,
        accounts: vec![
            solana_instruction::AccountMeta::new(wallet_pda, false),
            solana_instruction::AccountMeta::new(vault_pda, false),
            solana_instruction::AccountMeta::new(intent0, false),
            solana_instruction::AccountMeta::new(intent1, false),
            solana_instruction::AccountMeta::new(intent2, false),
            solana_instruction::AccountMeta::new(payer.pubkey(), true),
            solana_instruction::AccountMeta::new_readonly(
                solana_address::Address::from_str_const("11111111111111111111111111111111"),
                false,
            ),
        ],
        data,
    };
    let result = setup::send_tx(&mut svm, &[ix], &payer, &[&payer]);
    assert!(result.is_err(), "Name > 32 bytes should fail");
}

#[test]
fn test_create_wallet_empty_name() {
    let mut svm = setup::new_svm();
    let payer = Keypair::new();
    setup::airdrop(&mut svm, &payer.pubkey(), 100_000_000_000);

    let name = b"";
    let proposers = vec![Keypair::new().pubkey()];
    let approvers = vec![Keypair::new().pubkey()];

    let ix = instructions::create_wallet(name, &proposers, &approvers, 1, 1, 0, &payer.pubkey());
    let result = setup::send_tx(&mut svm, &[ix], &payer, &[&payer]);
    assert!(result.is_err(), "Empty name should fail");
}

// ────────────────────────────────────────────────────────────────────────
// Invalid thresholds
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_create_wallet_threshold_exceeds_approvers() {
    let mut svm = setup::new_svm();
    let payer = Keypair::new();
    setup::airdrop(&mut svm, &payer.pubkey(), 100_000_000_000);

    let proposers = vec![Keypair::new().pubkey()];
    let approvers = vec![Keypair::new().pubkey()]; // 1 approver

    // Threshold 2 > 1 approver
    let ix = instructions::create_wallet(
        b"bad-threshold", &proposers, &approvers, 2, 1, 0, &payer.pubkey(),
    );
    let result = setup::send_tx(&mut svm, &[ix], &payer, &[&payer]);
    assert!(result.is_err(), "Threshold > approver count should fail");
}

#[test]
fn test_create_wallet_zero_threshold() {
    let mut svm = setup::new_svm();
    let payer = Keypair::new();
    setup::airdrop(&mut svm, &payer.pubkey(), 100_000_000_000);

    let proposers = vec![Keypair::new().pubkey()];
    let approvers = vec![Keypair::new().pubkey()];

    let ix = instructions::create_wallet(
        b"zero-thresh", &proposers, &approvers, 0, 1, 0, &payer.pubkey(),
    );
    let result = setup::send_tx(&mut svm, &[ix], &payer, &[&payer]);
    assert!(result.is_err(), "Zero threshold should fail");
}
