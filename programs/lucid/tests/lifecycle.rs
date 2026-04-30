use solana_signer::Signer;

mod helpers;
use helpers::{ed25519, instructions, pda, setup};

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
        &ws.wallet, 3, &intent_data, &ws.approvers[0].pubkey(),
    );

    let result = setup::send_tx(&mut svm, &[ix], &ws.approvers[0], &[&ws.approvers[0]]);
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
        &ws.wallet, 3, &intents, &ws.approvers[0].pubkey(),
    );

    let result = setup::send_tx(&mut svm, &[ix], &ws.approvers[0], &[&ws.approvers[0]]);
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
        &ws.wallet, 3, &builder.build(), &ws.approvers[0].pubkey(),
    );
    let result = setup::send_tx(&mut svm, &[ix], &ws.approvers[0], &[&ws.approvers[0]]);
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

// ────────────────────────────────────────────────────────────────────────
// Raw byte offset round-trip (catches CLI/dashboard offset bugs)
// ────────────────────────────────────────────────────────────────────────

/// Verify that reading on-chain account data at the exact byte offsets
/// used by the CLI and dashboard matches the typed struct fields.
/// This is the test that would have caught the off-by-32 bug.
#[test]
fn test_wallet_raw_byte_offsets() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"offset-test", 1, 2, 2, 1, 60);

    let data = setup::get_account_data(&svm, &ws.wallet).unwrap();
    let wd = &data[helpers::PREFIX_LEN..];

    // Wallet layout: proposal_index(8) + intent_count(1) + frozen(1) + bump(1) + name_len(1) + reserved(4) + create_key(32) + name(32)
    let proposal_index = u64::from_le_bytes(wd[0..8].try_into().unwrap());
    let intent_count = wd[8];
    let frozen = wd[9];
    let name_len = wd[11] as usize;
    let name_bytes = &wd[48..48 + name_len];

    assert_eq!(proposal_index, 0);
    assert_eq!(intent_count, 3); // 3 meta-intents
    assert_eq!(frozen, 0);
    assert_eq!(name_bytes, b"offset-test");
}

#[test]
fn test_intent_header_raw_byte_offsets() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"offsets", 1, 2, 2, 1, 120);

    // Add a custom intent so we control the fields
    let mut builder = helpers::intent::IntentDataBuilder::new();
    builder.intent_type = helpers::INTENT_TYPE_CUSTOM;
    builder.approval_threshold = 2;
    builder.cancellation_threshold = 1;
    builder.timelock_seconds = 120;
    builder.template = b"transfer {0} to {1}".to_vec();
    builder.proposers.push(ws.proposers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[1].pubkey().to_bytes());

    let intent_data = builder.build();
    let ix = instructions::add_intent(&ws.wallet, 3, &intent_data, &ws.approvers[0].pubkey());
    let result = setup::send_tx(&mut svm, &[ix], &ws.approvers[0], &[&ws.approvers[0]]);
    assert!(result.is_ok(), "AddIntent failed: {:?}", result.err());

    let pid = helpers::program_id();
    let (intent_pda, _) = pda::find_intent_pda(&ws.wallet, 3, &pid);
    let data = setup::get_account_data(&svm, &intent_pda).unwrap();
    let ih = &data[helpers::PREFIX_LEN..];

    // IntentHeader layout (88 bytes):
    //   0-31:  wallet (32)
    //  32-63:  target_program (32)
    //  64-67:  timelock_seconds (u32)
    //  68-69:  active_proposal_count (u16)
    //  70-71:  byte_pool_len (u16)
    //  72:     bump
    //  73:     intent_index
    //  74:     intent_type
    //  75:     approved
    //  76:     approval_threshold
    //  77:     cancellation_threshold
    //  78:     proposer_count
    //  79:     approver_count
    //  80:     param_count
    //  81:     account_count
    //  82:     instruction_count
    //  83:     data_segment_count
    //  84:     seed_count
    //  85-87:  reserved

    // Verify wallet pubkey stored correctly
    assert_eq!(&ih[0..32], ws.wallet.as_ref());

    // Verify field offsets match typed struct
    let typed = setup::read_intent_header(&svm, &intent_pda);

    let timelock = u32::from_le_bytes(ih[64..68].try_into().unwrap());
    assert_eq!(timelock, typed.timelock_seconds, "timelock_seconds offset wrong");
    assert_eq!(timelock, 120);

    let byte_pool_len = u16::from_le_bytes(ih[70..72].try_into().unwrap());
    assert_eq!(byte_pool_len, typed.byte_pool_len, "byte_pool_len offset wrong");

    assert_eq!(ih[73], typed.intent_index, "intent_index offset wrong");
    assert_eq!(ih[73], 3); // 4th intent (0,1,2 are meta)

    assert_eq!(ih[74], typed.intent_type, "intent_type offset wrong");
    assert_eq!(ih[74], helpers::INTENT_TYPE_CUSTOM);

    assert_eq!(ih[75], typed.approved, "approved offset wrong");
    assert_eq!(ih[75], 1); // active

    assert_eq!(ih[76], typed.approval_threshold, "approval_threshold offset wrong");
    assert_eq!(ih[76], 2);

    assert_eq!(ih[77], typed.cancellation_threshold, "cancellation_threshold offset wrong");
    assert_eq!(ih[77], 1);

    assert_eq!(ih[78], typed.proposer_count, "proposer_count offset wrong");
    assert_eq!(ih[78], 1);

    assert_eq!(ih[79], typed.approver_count, "approver_count offset wrong");
    assert_eq!(ih[79], 2);

    assert_eq!(ih[80], typed.param_count, "param_count offset wrong");
    assert_eq!(ih[81], typed.account_count, "account_count offset wrong");

    // Verify proposer/approver arrays start at offset 88
    let proposers_start = 88;
    assert_eq!(
        &ih[proposers_start..proposers_start + 32],
        ws.proposers[0].pubkey().as_ref(),
        "proposer[0] at wrong offset"
    );

    let approvers_start = proposers_start + (1 * 32); // 1 proposer
    assert_eq!(
        &ih[approvers_start..approvers_start + 32],
        ws.approvers[0].pubkey().as_ref(),
        "approver[0] at wrong offset"
    );
    assert_eq!(
        &ih[approvers_start + 32..approvers_start + 64],
        ws.approvers[1].pubkey().as_ref(),
        "approver[1] at wrong offset"
    );

    // Verify byte pool: template header (4 bytes) + template
    let bp_start = 88 + (1 * 32) + (2 * 32); // header + proposers + approvers
    let tmpl_offset = u16::from_le_bytes([ih[bp_start], ih[bp_start + 1]]) as usize;
    let tmpl_len = u16::from_le_bytes([ih[bp_start + 2], ih[bp_start + 3]]) as usize;
    assert_eq!(tmpl_offset, 0);
    assert_eq!(tmpl_len, b"transfer {0} to {1}".len());
    let tmpl_bytes = &ih[bp_start + 4..bp_start + 4 + tmpl_len];
    assert_eq!(tmpl_bytes, b"transfer {0} to {1}");
}

#[test]
fn test_proposal_raw_byte_offsets() {
    let mut svm = setup::new_svm();
    let ws = setup::create_test_wallet(&mut svm, b"prop-off", 1, 2, 2, 1, 0);

    // Add a custom intent and propose
    let mut builder = helpers::intent::IntentDataBuilder::new();
    builder.intent_type = helpers::INTENT_TYPE_CUSTOM;
    builder.approval_threshold = 2;
    builder.cancellation_threshold = 1;
    builder.timelock_seconds = 0;
    builder.template = b"test".to_vec();
    builder.proposers.push(ws.proposers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[1].pubkey().to_bytes());

    let intent_data = builder.build();
    let ix = instructions::add_intent(&ws.wallet, 3, &intent_data, &ws.approvers[0].pubkey());
    setup::send_tx(&mut svm, &[ix], &ws.approvers[0], &[&ws.approvers[0]]).unwrap();

    let pid = helpers::program_id();
    let (intent_pda, _) = pda::find_intent_pda(&ws.wallet, 3, &pid);
    let (proposal_pda, _) = helpers::pda::find_proposal_pda(&intent_pda, 0, &pid);

    // Build propose transaction (ed25519 precompile + propose ix)
    let params_data = vec![42u8; 8];
    let expiry = ed25519::future_expiry();
    let message = ed25519::build_offchain_message(&expiry, "propose", "test", "prop-off", &ws.wallet.to_string(), 0);
    let signing_key = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let ed25519_ix = ed25519::create_ed25519_instruction(&signing_key, &message);
    let propose_ix = instructions::propose(
        &ws.wallet, &intent_pda, 0, &params_data, &ws.payer.pubkey(),
    );
    setup::send_tx(&mut svm, &[ed25519_ix, propose_ix], &ws.payer, &[&ws.payer]).unwrap();

    let data = setup::get_account_data(&svm, &proposal_pda).unwrap();
    let pd = &data[helpers::PREFIX_LEN..];

    // Proposal layout (168 bytes):
    //   0-31:   wallet (32)
    //  32-63:   intent (32)
    //  64-71:   proposal_index (u64)
    //  72-103:  proposer (32)
    // 104-105:  approval_bitmap (u16)
    // 106-107:  cancellation_bitmap (u16)
    // 108:      status
    // 109:      bump
    // 110-111:  pad (2)
    // 112-119:  proposed_at (i64)
    // 120-127:  approved_at (i64)
    // 128-159:  rent_refund (32)
    // 160-161:  params_data_len (u16)
    // 162-167:  reserved (6)

    let typed = setup::read_proposal(&svm, &proposal_pda);

    assert_eq!(&pd[0..32], ws.wallet.as_ref(), "wallet pubkey offset wrong");
    assert_eq!(&pd[32..64], intent_pda.as_ref(), "intent pubkey offset wrong");

    let proposal_index = u64::from_le_bytes(pd[64..72].try_into().unwrap());
    assert_eq!(proposal_index, typed.proposal_index, "proposal_index offset wrong");
    assert_eq!(proposal_index, 0);

    assert_eq!(&pd[72..104], ws.proposers[0].pubkey().as_ref(), "proposer offset wrong");

    assert_eq!(pd[108], typed.status, "status offset wrong");
    assert_eq!(pd[108], helpers::STATUS_ACTIVE);

    let proposed_at = i64::from_le_bytes(pd[112..120].try_into().unwrap());
    assert_eq!(proposed_at, typed.proposed_at, "proposed_at offset wrong");

    let params_len = u16::from_le_bytes(pd[160..162].try_into().unwrap());
    assert_eq!(params_len, typed.params_data_len, "params_data_len offset wrong");
    assert_eq!(params_len as usize, params_data.len());
}
