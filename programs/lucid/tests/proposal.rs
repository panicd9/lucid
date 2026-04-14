use solana_signer::Signer;

mod helpers;
use helpers::{ed25519, instructions, pda, setup};

/// Helper: create wallet + add a custom intent with numeric placeholders {0}, {1}
fn wallet_with_custom_intent(
    svm: &mut litesvm::LiteSVM,
    name: &[u8],
) -> (setup::WalletSetup, solana_address::Address) {
    wallet_with_template(svm, name, b"transfer {0} SOL to {1}")
}

/// Helper: create wallet + add a custom intent with named placeholders {amount}, {destination}
fn wallet_with_named_template_intent(
    svm: &mut litesvm::LiteSVM,
    name: &[u8],
) -> (setup::WalletSetup, solana_address::Address) {
    wallet_with_template(svm, name, b"transfer {amount} SOL to {destination}")
}

/// Shared: create wallet + add a custom intent with the given template
fn wallet_with_template(
    svm: &mut litesvm::LiteSVM,
    name: &[u8],
    template: &[u8],
) -> (setup::WalletSetup, solana_address::Address) {
    let ws = setup::create_test_wallet(svm, name, 1, 2, 2, 1, 0);

    let mut builder = helpers::intent::IntentDataBuilder::new();
    builder.intent_type = helpers::INTENT_TYPE_CUSTOM;
    builder.approval_threshold = 2;
    builder.cancellation_threshold = 1;
    builder.timelock_seconds = 0;
    builder.template = template.to_vec();
    builder.proposers.push(ws.proposers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[1].pubkey().to_bytes());

    // u64 param and address param
    builder.params.push(helpers::intent::ParamDef {
        param_type: helpers::PARAM_TYPE_U64,
        constraint_type: 0,
        constraint_value: 0,
        display_decimals: 0,
        name: b"amount".to_vec(),
    });
    builder.params.push(helpers::intent::ParamDef {
        param_type: helpers::PARAM_TYPE_ADDRESS,
        constraint_type: 0,
        constraint_value: 0,
        display_decimals: 0,
        name: b"destination".to_vec(),
    });

    let intent_data = builder.build();

    let ix = instructions::add_intent(&ws.wallet, 3, &intent_data, &ws.payer.pubkey());
    let result = setup::send_tx(svm, &[ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_ok(), "AddIntent failed: {:?}", result.err());

    let pid = helpers::program_id();
    let (intent_pda, _) = pda::find_intent_pda(&ws.wallet, 3, &pid);

    (ws, intent_pda)
}

/// Build params_data for a transfer intent: u64 amount + address destination
fn build_transfer_params(amount: u64, destination: &[u8; 32]) -> Vec<u8> {
    let mut params = Vec::new();
    params.extend_from_slice(&amount.to_le_bytes());
    params.extend_from_slice(destination);
    params
}

/// Build the rendered template string for message verification
fn render_transfer(amount: u64, destination: &[u8; 32]) -> String {
    let dest_b58 = bs58_encode(destination);
    format!("transfer {} SOL to {}", amount, dest_b58)
}

fn bs58_encode(bytes: &[u8]) -> String {
    // Minimal base58 for tests
    const ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let mut leading_zeros = 0;
    for &b in bytes {
        if b != 0 { break; }
        leading_zeros += 1;
    }
    let mut temp: Vec<u8> = Vec::new();
    for &byte in bytes {
        let mut carry = byte as u32;
        for j in 0..temp.len() {
            carry += (temp[j] as u32) * 256;
            temp[j] = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            temp.push((carry % 58) as u8);
            carry /= 58;
        }
    }
    let mut result = String::new();
    for _ in 0..leading_zeros {
        result.push('1');
    }
    for &b in temp.iter().rev() {
        result.push(ALPHABET[b as usize] as char);
    }
    result
}

// ────────────────────────────────────────────────────────────────────────
// Propose
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_propose() {
    let mut svm = setup::new_svm();
    let (ws, intent_pda) = wallet_with_custom_intent(&mut svm, b"propose-test");

    let dest = [42u8; 32];
    let params = build_transfer_params(1_000_000_000, &dest);
    let rendered = render_transfer(1_000_000_000, &dest);
    let wallet_name = std::str::from_utf8(&ws.name).unwrap();
    let proposal_index = 0u64;

    let expiry = ed25519::future_expiry();
    let message = ed25519::build_offchain_message(
        &expiry, "propose", &rendered, wallet_name, proposal_index,
    );

    let signing_key = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let ed25519_ix = ed25519::create_ed25519_instruction(&signing_key, &message);

    let propose_ix = instructions::propose(
        &ws.wallet, &intent_pda, proposal_index, &params, &ws.payer.pubkey(),
    );

    let result = setup::send_tx(
        &mut svm,
        &[ed25519_ix, propose_ix],
        &ws.payer,
        &[&ws.payer],
    );
    assert!(result.is_ok(), "Propose failed: {:?}", result.err());

    // Verify wallet proposal_index incremented
    let wallet = setup::read_wallet_state(&svm, &ws.wallet);
    assert_eq!(wallet.proposal_index, 1);

    // Verify proposal exists and is active
    let pid = helpers::program_id();
    let (proposal_pda, _) = pda::find_proposal_pda(&intent_pda, 0, &pid);
    assert_eq!(setup::read_proposal(&svm, &proposal_pda).status, helpers::STATUS_ACTIVE);
}

// ────────────────────────────────────────────────────────────────────────
// Approve
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_approve_reaches_threshold() {
    let mut svm = setup::new_svm();
    let (ws, intent_pda) = wallet_with_custom_intent(&mut svm, b"approve-test");

    let dest = [99u8; 32];
    let params = build_transfer_params(500, &dest);
    let rendered = render_transfer(500, &dest);
    let wallet_name = std::str::from_utf8(&ws.name).unwrap();

    // Propose
    let expiry = ed25519::future_expiry();
    let msg = ed25519::build_offchain_message(&expiry, "propose", &rendered, wallet_name, 0);
    let sk = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let result = setup::send_tx(
        &mut svm,
        &[
            ed25519::create_ed25519_instruction(&sk, &msg),
            instructions::propose(&ws.wallet, &intent_pda, 0, &params, &ws.payer.pubkey()),
        ],
        &ws.payer,
        &[&ws.payer],
    );
    assert!(result.is_ok(), "Propose failed: {:?}", result.err());

    let pid = helpers::program_id();
    let (proposal_pda, _) = pda::find_proposal_pda(&intent_pda, 0, &pid);

    // Approve with approver 0
    let msg = ed25519::build_offchain_message(&expiry, "approve", &rendered, wallet_name, 0);
    let sk0 = ed25519::keypair_to_signing_key(&ws.approvers[0]);
    let result = setup::send_tx(
        &mut svm,
        &[
            ed25519::create_ed25519_instruction(&sk0, &msg),
            instructions::approve(&ws.wallet, &intent_pda, &proposal_pda),
        ],
        &ws.payer,
        &[&ws.payer],
    );
    assert!(result.is_ok(), "Approve 0 failed: {:?}", result.err());

    // Still active (threshold is 2)
    let prop = setup::read_proposal(&svm, &proposal_pda);
    assert_eq!(prop.status, helpers::STATUS_ACTIVE);
    assert_eq!(prop.approval_bitmap, 1); // bit 0 set

    // Approve with approver 1
    let sk1 = ed25519::keypair_to_signing_key(&ws.approvers[1]);
    let result = setup::send_tx(
        &mut svm,
        &[
            ed25519::create_ed25519_instruction(&sk1, &msg),
            instructions::approve(&ws.wallet, &intent_pda, &proposal_pda),
        ],
        &ws.payer,
        &[&ws.payer],
    );
    assert!(result.is_ok(), "Approve 1 failed: {:?}", result.err());

    // Now approved (threshold reached)
    let prop = setup::read_proposal(&svm, &proposal_pda);
    assert_eq!(prop.status, helpers::STATUS_APPROVED);
    assert_eq!(prop.approval_bitmap, 3); // bits 0,1 set
}

// ────────────────────────────────────────────────────────────────────────
// Cancel
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_cancel_proposal() {
    let mut svm = setup::new_svm();
    // 1 proposer, 2 approvers, approval_threshold=2, cancellation_threshold=1
    let (ws, intent_pda) = wallet_with_custom_intent(&mut svm, b"cancel-test");

    let dest = [77u8; 32];
    let params = build_transfer_params(100, &dest);
    let rendered = render_transfer(100, &dest);
    let wallet_name = std::str::from_utf8(&ws.name).unwrap();

    // Propose
    let expiry = ed25519::future_expiry();
    let msg = ed25519::build_offchain_message(&expiry, "propose", &rendered, wallet_name, 0);
    let sk = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let result = setup::send_tx(
        &mut svm,
        &[
            ed25519::create_ed25519_instruction(&sk, &msg),
            instructions::propose(&ws.wallet, &intent_pda, 0, &params, &ws.payer.pubkey()),
        ],
        &ws.payer,
        &[&ws.payer],
    );
    assert!(result.is_ok(), "Propose failed: {:?}", result.err());

    let pid = helpers::program_id();
    let (proposal_pda, _) = pda::find_proposal_pda(&intent_pda, 0, &pid);

    // Cancel with approver 0 (cancellation_threshold=1, so one cancel is enough)
    let msg = ed25519::build_offchain_message(&expiry, "cancel", &rendered, wallet_name, 0);
    let sk0 = ed25519::keypair_to_signing_key(&ws.approvers[0]);
    let result = setup::send_tx(
        &mut svm,
        &[
            ed25519::create_ed25519_instruction(&sk0, &msg),
            instructions::cancel(&ws.wallet, &intent_pda, &proposal_pda),
        ],
        &ws.payer,
        &[&ws.payer],
    );
    assert!(result.is_ok(), "Cancel failed: {:?}", result.err());

    assert_eq!(setup::read_proposal(&svm, &proposal_pda).status, helpers::STATUS_CANCELLED);
}

// ────────────────────────────────────────────────────────────────────────
// Named-template placeholders ({amount}, {destination} instead of {0}, {1})
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_propose_with_named_template() {
    let mut svm = setup::new_svm();
    let (ws, intent_pda) = wallet_with_named_template_intent(&mut svm, b"named-propose");

    let dest = [42u8; 32];
    let params = build_transfer_params(1_000_000_000, &dest);
    // The rendered message is the same regardless of placeholder style
    let rendered = render_transfer(1_000_000_000, &dest);
    let wallet_name = std::str::from_utf8(&ws.name).unwrap();

    let expiry = ed25519::future_expiry();
    let message = ed25519::build_offchain_message(&expiry, "propose", &rendered, wallet_name, 0);

    let signing_key = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let ed25519_ix = ed25519::create_ed25519_instruction(&signing_key, &message);

    let propose_ix = instructions::propose(
        &ws.wallet, &intent_pda, 0, &params, &ws.payer.pubkey(),
    );

    let result = setup::send_tx(&mut svm, &[ed25519_ix, propose_ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_ok(), "Propose with named template failed: {:?}", result.err());

    let wallet = setup::read_wallet_state(&svm, &ws.wallet);
    assert_eq!(wallet.proposal_index, 1);
}

#[test]
fn test_approve_with_named_template() {
    let mut svm = setup::new_svm();
    let (ws, intent_pda) = wallet_with_named_template_intent(&mut svm, b"named-approve");

    let dest = [99u8; 32];
    let params = build_transfer_params(500, &dest);
    let rendered = render_transfer(500, &dest);
    let wallet_name = std::str::from_utf8(&ws.name).unwrap();
    let expiry = ed25519::future_expiry();

    // Propose
    let msg = ed25519::build_offchain_message(&expiry, "propose", &rendered, wallet_name, 0);
    let sk = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let result = setup::send_tx(
        &mut svm,
        &[
            ed25519::create_ed25519_instruction(&sk, &msg),
            instructions::propose(&ws.wallet, &intent_pda, 0, &params, &ws.payer.pubkey()),
        ],
        &ws.payer,
        &[&ws.payer],
    );
    assert!(result.is_ok(), "Propose failed: {:?}", result.err());

    let pid = helpers::program_id();
    let (proposal_pda, _) = pda::find_proposal_pda(&intent_pda, 0, &pid);

    // Approve with approver 0
    let msg = ed25519::build_offchain_message(&expiry, "approve", &rendered, wallet_name, 0);
    let sk0 = ed25519::keypair_to_signing_key(&ws.approvers[0]);
    let result = setup::send_tx(
        &mut svm,
        &[
            ed25519::create_ed25519_instruction(&sk0, &msg),
            instructions::approve(&ws.wallet, &intent_pda, &proposal_pda),
        ],
        &ws.payer,
        &[&ws.payer],
    );
    assert!(result.is_ok(), "Approve with named template failed: {:?}", result.err());
}

#[test]
fn test_cancel_with_named_template() {
    let mut svm = setup::new_svm();
    let (ws, intent_pda) = wallet_with_named_template_intent(&mut svm, b"named-cancel");

    let dest = [77u8; 32];
    let params = build_transfer_params(100, &dest);
    let rendered = render_transfer(100, &dest);
    let wallet_name = std::str::from_utf8(&ws.name).unwrap();
    let expiry = ed25519::future_expiry();

    // Propose
    let msg = ed25519::build_offchain_message(&expiry, "propose", &rendered, wallet_name, 0);
    let sk = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let result = setup::send_tx(
        &mut svm,
        &[
            ed25519::create_ed25519_instruction(&sk, &msg),
            instructions::propose(&ws.wallet, &intent_pda, 0, &params, &ws.payer.pubkey()),
        ],
        &ws.payer,
        &[&ws.payer],
    );
    assert!(result.is_ok(), "Propose failed: {:?}", result.err());

    let pid = helpers::program_id();
    let (proposal_pda, _) = pda::find_proposal_pda(&intent_pda, 0, &pid);

    // Cancel with approver 0 (cancellation_threshold=1)
    let msg = ed25519::build_offchain_message(&expiry, "cancel", &rendered, wallet_name, 0);
    let sk0 = ed25519::keypair_to_signing_key(&ws.approvers[0]);
    let result = setup::send_tx(
        &mut svm,
        &[
            ed25519::create_ed25519_instruction(&sk0, &msg),
            instructions::cancel(&ws.wallet, &intent_pda, &proposal_pda),
        ],
        &ws.payer,
        &[&ws.payer],
    );
    assert!(result.is_ok(), "Cancel with named template failed: {:?}", result.err());

    assert_eq!(setup::read_proposal(&svm, &proposal_pda).status, helpers::STATUS_CANCELLED);
}
