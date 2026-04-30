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

/// Shared: create wallet + add a custom intent with the given template (display_decimals=0)
fn wallet_with_template(
    svm: &mut litesvm::LiteSVM,
    name: &[u8],
    template: &[u8],
) -> (setup::WalletSetup, solana_address::Address) {
    wallet_with_template_decimals(svm, name, template, 0)
}

/// Shared: create wallet + add a custom intent with configurable display_decimals on the amount param
fn wallet_with_template_decimals(
    svm: &mut litesvm::LiteSVM,
    name: &[u8],
    template: &[u8],
    amount_display_decimals: u8,
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
        display_decimals: amount_display_decimals,
        decimals_param: 0,
        name: b"amount".to_vec(),
    });
    builder.params.push(helpers::intent::ParamDef {
        param_type: helpers::PARAM_TYPE_ADDRESS,
        constraint_type: 0,
        constraint_value: 0,
        display_decimals: 0,
        decimals_param: 0,
        name: b"destination".to_vec(),
    });

    let intent_data = builder.build();

    let ix = instructions::add_intent(&ws.wallet, 3, &intent_data, &ws.approvers[0].pubkey());
    let result = setup::send_tx(svm, &[ix], &ws.approvers[0], &[&ws.approvers[0]]);
    assert!(result.is_ok(), "AddIntent failed: {:?}", result.err());

    let pid = helpers::program_id();
    let (intent_pda, _) = pda::find_intent_pda(&ws.wallet, 3, &pid);

    (ws, intent_pda)
}

/// Create wallet + add intent with dynamic decimals_param (SPL-style).
/// Params: [0] amount (u64, decimals_param=2), [1] decimals (u8), [2] destination (address)
fn wallet_with_dynamic_decimals_intent(
    svm: &mut litesvm::LiteSVM,
    name: &[u8],
) -> (setup::WalletSetup, solana_address::Address) {
    let ws = setup::create_test_wallet(svm, name, 1, 2, 2, 1, 0);

    let mut builder = helpers::intent::IntentDataBuilder::new();
    builder.intent_type = helpers::INTENT_TYPE_CUSTOM;
    builder.approval_threshold = 2;
    builder.cancellation_threshold = 1;
    builder.timelock_seconds = 0;
    builder.template = b"transfer {amount} tokens to {destination}".to_vec();
    builder.proposers.push(ws.proposers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[0].pubkey().to_bytes());
    builder.approvers.push(ws.approvers[1].pubkey().to_bytes());

    // Param 0: amount (u64, decimals_param=2 → reads param[1] for decimals)
    builder.params.push(helpers::intent::ParamDef {
        param_type: helpers::PARAM_TYPE_U64,
        constraint_type: 0,
        constraint_value: 0,
        display_decimals: 0,
        decimals_param: 2, // 1-indexed → param[1]
        name: b"amount".to_vec(),
    });
    // Param 1: decimals (u8)
    builder.params.push(helpers::intent::ParamDef {
        param_type: helpers::PARAM_TYPE_U8,
        constraint_type: 0,
        constraint_value: 0,
        display_decimals: 0,
        decimals_param: 0,
        name: b"decimals".to_vec(),
    });
    // Param 2: destination (address)
    builder.params.push(helpers::intent::ParamDef {
        param_type: helpers::PARAM_TYPE_ADDRESS,
        constraint_type: 0,
        constraint_value: 0,
        display_decimals: 0,
        decimals_param: 0,
        name: b"destination".to_vec(),
    });

    let intent_data = builder.build();

    let ix = instructions::add_intent(&ws.wallet, 3, &intent_data, &ws.approvers[0].pubkey());
    let result = setup::send_tx(svm, &[ix], &ws.approvers[0], &[&ws.approvers[0]]);
    assert!(result.is_ok(), "AddIntent with decimals_param failed: {:?}", result.err());

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

/// Build the rendered template string for message verification (display_decimals=0)
fn render_transfer(amount: u64, destination: &[u8; 32]) -> String {
    let dest_b58 = bs58_encode(destination);
    format!("transfer {} SOL to {}", amount, dest_b58)
}

/// Build rendered template for display_decimals=9 (SOL-style).
/// Matches on-chain u64_to_decimal_scaled: 1_500_000_000 → "1.5", 1_000_000_000 → "1"
fn render_transfer_decimals(amount: u64, destination: &[u8; 32], decimals: u32) -> String {
    let dest_b58 = bs58_encode(destination);
    let divisor = 10u64.pow(decimals);
    let whole = amount / divisor;
    let frac = amount % divisor;
    if frac == 0 {
        format!("transfer {} SOL to {}", whole, dest_b58)
    } else {
        // Format with leading zeros, strip trailing zeros (matches on-chain)
        let frac_str = format!("{:0>width$}", frac, width = decimals as usize);
        let trimmed = frac_str.trim_end_matches('0');
        format!("transfer {}.{} SOL to {}", whole, trimmed, dest_b58)
    }
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
        &ws.proposers[0].pubkey().to_bytes(),
        &expiry, "propose", &rendered, wallet_name, &ws.wallet.to_string(), proposal_index,
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
    let msg = ed25519::build_offchain_message(&ws.proposers[0].pubkey().to_bytes(), &expiry, "propose", &rendered, wallet_name, &ws.wallet.to_string(), 0);
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
    let msg = ed25519::build_offchain_message(&ws.approvers[0].pubkey().to_bytes(), &expiry, "approve", &rendered, wallet_name, &ws.wallet.to_string(), 0);
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

    // Each signer needs their own envelope — the embedded pubkey must match the signer.
    let msg1 = ed25519::build_offchain_message(&ws.approvers[1].pubkey().to_bytes(), &expiry, "approve", &rendered, wallet_name, &ws.wallet.to_string(), 0);
    let sk1 = ed25519::keypair_to_signing_key(&ws.approvers[1]);
    let result = setup::send_tx(
        &mut svm,
        &[
            ed25519::create_ed25519_instruction(&sk1, &msg1),
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
    let msg = ed25519::build_offchain_message(&ws.proposers[0].pubkey().to_bytes(), &expiry, "propose", &rendered, wallet_name, &ws.wallet.to_string(), 0);
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
    let msg = ed25519::build_offchain_message(&ws.approvers[0].pubkey().to_bytes(), &expiry, "cancel", &rendered, wallet_name, &ws.wallet.to_string(), 0);
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
    let message = ed25519::build_offchain_message(&ws.proposers[0].pubkey().to_bytes(), &expiry, "propose", &rendered, wallet_name, &ws.wallet.to_string(), 0);

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
    let msg = ed25519::build_offchain_message(&ws.proposers[0].pubkey().to_bytes(), &expiry, "propose", &rendered, wallet_name, &ws.wallet.to_string(), 0);
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
    let msg = ed25519::build_offchain_message(&ws.approvers[0].pubkey().to_bytes(), &expiry, "approve", &rendered, wallet_name, &ws.wallet.to_string(), 0);
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
    let msg = ed25519::build_offchain_message(&ws.proposers[0].pubkey().to_bytes(), &expiry, "propose", &rendered, wallet_name, &ws.wallet.to_string(), 0);
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
    let msg = ed25519::build_offchain_message(&ws.approvers[0].pubkey().to_bytes(), &expiry, "cancel", &rendered, wallet_name, &ws.wallet.to_string(), 0);
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

// ────────────────────────────────────────────────────────────────────────
// display_decimals — message rendering must match on-chain formatting
// ────────────────────────────────────────────────────────────────────────

#[test]
fn test_propose_display_decimals_whole() {
    // 1_000_000_000 lamports with decimals=9 → "1" (no fractional part)
    let mut svm = setup::new_svm();
    let (ws, intent_pda) = wallet_with_template_decimals(
        &mut svm, b"dec-whole", b"transfer {0} SOL to {1}", 9,
    );

    let dest = [42u8; 32];
    let amount = 1_000_000_000u64;
    let params = build_transfer_params(amount, &dest);
    let rendered = render_transfer_decimals(amount, &dest, 9);
    assert_eq!(rendered, format!("transfer 1 SOL to {}", bs58_encode(&dest)));

    let wallet_name = std::str::from_utf8(&ws.name).unwrap();
    let expiry = ed25519::future_expiry();
    let message = ed25519::build_offchain_message(&ws.proposers[0].pubkey().to_bytes(), &expiry, "propose", &rendered, wallet_name, &ws.wallet.to_string(), 0);

    let signing_key = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let ed25519_ix = ed25519::create_ed25519_instruction(&signing_key, &message);
    let propose_ix = instructions::propose(&ws.wallet, &intent_pda, 0, &params, &ws.payer.pubkey());

    let result = setup::send_tx(&mut svm, &[ed25519_ix, propose_ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_ok(), "Propose with display_decimals=9 (whole) failed: {:?}", result.err());
}

#[test]
fn test_propose_display_decimals_fractional() {
    // 1_500_000_000 lamports with decimals=9 → "1.5"
    let mut svm = setup::new_svm();
    let (ws, intent_pda) = wallet_with_template_decimals(
        &mut svm, b"dec-frac", b"transfer {0} SOL to {1}", 9,
    );

    let dest = [99u8; 32];
    let amount = 1_500_000_000u64;
    let params = build_transfer_params(amount, &dest);
    let rendered = render_transfer_decimals(amount, &dest, 9);
    assert_eq!(rendered, format!("transfer 1.5 SOL to {}", bs58_encode(&dest)));

    let wallet_name = std::str::from_utf8(&ws.name).unwrap();
    let expiry = ed25519::future_expiry();
    let message = ed25519::build_offchain_message(&ws.proposers[0].pubkey().to_bytes(), &expiry, "propose", &rendered, wallet_name, &ws.wallet.to_string(), 0);

    let signing_key = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let ed25519_ix = ed25519::create_ed25519_instruction(&signing_key, &message);
    let propose_ix = instructions::propose(&ws.wallet, &intent_pda, 0, &params, &ws.payer.pubkey());

    let result = setup::send_tx(&mut svm, &[ed25519_ix, propose_ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_ok(), "Propose with display_decimals=9 (fractional) failed: {:?}", result.err());
}

#[test]
fn test_propose_display_decimals_small_amount() {
    // 100_000 lamports with decimals=9 → "0.0001"
    let mut svm = setup::new_svm();
    let (ws, intent_pda) = wallet_with_template_decimals(
        &mut svm, b"dec-small", b"transfer {0} SOL to {1}", 9,
    );

    let dest = [77u8; 32];
    let amount = 100_000u64;
    let params = build_transfer_params(amount, &dest);
    let rendered = render_transfer_decimals(amount, &dest, 9);
    assert_eq!(rendered, format!("transfer 0.0001 SOL to {}", bs58_encode(&dest)));

    let wallet_name = std::str::from_utf8(&ws.name).unwrap();
    let expiry = ed25519::future_expiry();
    let message = ed25519::build_offchain_message(&ws.proposers[0].pubkey().to_bytes(), &expiry, "propose", &rendered, wallet_name, &ws.wallet.to_string(), 0);

    let signing_key = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let ed25519_ix = ed25519::create_ed25519_instruction(&signing_key, &message);
    let propose_ix = instructions::propose(&ws.wallet, &intent_pda, 0, &params, &ws.payer.pubkey());

    let result = setup::send_tx(&mut svm, &[ed25519_ix, propose_ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_ok(), "Propose with display_decimals=9 (small amount) failed: {:?}", result.err());
}

// ────────────────────────────────────────────────────────────────────────
// Dynamic decimals_param
// ────────────────────────────────────────────────────────────────────────

/// Build params_data for dynamic decimals intent: u64 amount + u8 decimals + address destination
fn build_dynamic_decimals_params(amount: u64, decimals: u8, destination: &[u8; 32]) -> Vec<u8> {
    let mut params = Vec::new();
    params.extend_from_slice(&amount.to_le_bytes());
    params.push(decimals);
    params.extend_from_slice(destination);
    params
}

/// Render template for dynamic decimals: "transfer {amount} tokens to {destination}"
/// where amount is formatted using the given decimals value.
fn render_dynamic_decimals(amount: u64, decimals: u8, destination: &[u8; 32]) -> String {
    let dest_b58 = bs58_encode(destination);
    if decimals == 0 {
        format!("transfer {} tokens to {}", amount, dest_b58)
    } else {
        let divisor = 10u64.pow(decimals as u32);
        let whole = amount / divisor;
        let frac = amount % divisor;
        if frac == 0 {
            format!("transfer {} tokens to {}", whole, dest_b58)
        } else {
            let frac_str = format!("{:0>width$}", frac, width = decimals as usize);
            let trimmed = frac_str.trim_end_matches('0');
            format!("transfer {}.{} tokens to {}", whole, trimmed, dest_b58)
        }
    }
}

#[test]
fn test_propose_dynamic_decimals_6() {
    let mut svm = setup::new_svm();
    let (ws, intent_pda) = wallet_with_dynamic_decimals_intent(&mut svm, b"dyn-dec6");

    let dest = [55u8; 32];
    let amount = 1_500_000u64; // 1.5 with 6 decimals (USDC-style)
    let decimals = 6u8;
    let params = build_dynamic_decimals_params(amount, decimals, &dest);
    let rendered = render_dynamic_decimals(amount, decimals, &dest);
    assert_eq!(rendered, format!("transfer 1.5 tokens to {}", bs58_encode(&dest)));

    let wallet_name = std::str::from_utf8(&ws.name).unwrap();
    let expiry = ed25519::future_expiry();
    let message = ed25519::build_offchain_message(&ws.proposers[0].pubkey().to_bytes(), &expiry, "propose", &rendered, wallet_name, &ws.wallet.to_string(), 0);

    let signing_key = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let ed25519_ix = ed25519::create_ed25519_instruction(&signing_key, &message);
    let propose_ix = instructions::propose(&ws.wallet, &intent_pda, 0, &params, &ws.payer.pubkey());

    let result = setup::send_tx(&mut svm, &[ed25519_ix, propose_ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_ok(), "Propose with decimals_param (6 decimals) failed: {:?}", result.err());
}

#[test]
fn test_propose_dynamic_decimals_9() {
    let mut svm = setup::new_svm();
    let (ws, intent_pda) = wallet_with_dynamic_decimals_intent(&mut svm, b"dyn-dec9");

    let dest = [66u8; 32];
    let amount = 2_000_000_000u64; // 2.0 with 9 decimals (wrapped SOL-style)
    let decimals = 9u8;
    let params = build_dynamic_decimals_params(amount, decimals, &dest);
    let rendered = render_dynamic_decimals(amount, decimals, &dest);
    assert_eq!(rendered, format!("transfer 2 tokens to {}", bs58_encode(&dest)));

    let wallet_name = std::str::from_utf8(&ws.name).unwrap();
    let expiry = ed25519::future_expiry();
    let message = ed25519::build_offchain_message(&ws.proposers[0].pubkey().to_bytes(), &expiry, "propose", &rendered, wallet_name, &ws.wallet.to_string(), 0);

    let signing_key = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let ed25519_ix = ed25519::create_ed25519_instruction(&signing_key, &message);
    let propose_ix = instructions::propose(&ws.wallet, &intent_pda, 0, &params, &ws.payer.pubkey());

    let result = setup::send_tx(&mut svm, &[ed25519_ix, propose_ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_ok(), "Propose with decimals_param (9 decimals) failed: {:?}", result.err());
}

#[test]
fn test_propose_dynamic_decimals_0() {
    let mut svm = setup::new_svm();
    let (ws, intent_pda) = wallet_with_dynamic_decimals_intent(&mut svm, b"dyn-dec0");

    let dest = [88u8; 32];
    let amount = 42u64; // 42 with 0 decimals (no fractional, e.g. NFT count)
    let decimals = 0u8;
    let params = build_dynamic_decimals_params(amount, decimals, &dest);
    let rendered = render_dynamic_decimals(amount, decimals, &dest);
    assert_eq!(rendered, format!("transfer 42 tokens to {}", bs58_encode(&dest)));

    let wallet_name = std::str::from_utf8(&ws.name).unwrap();
    let expiry = ed25519::future_expiry();
    let message = ed25519::build_offchain_message(&ws.proposers[0].pubkey().to_bytes(), &expiry, "propose", &rendered, wallet_name, &ws.wallet.to_string(), 0);

    let signing_key = ed25519::keypair_to_signing_key(&ws.proposers[0]);
    let ed25519_ix = ed25519::create_ed25519_instruction(&signing_key, &message);
    let propose_ix = instructions::propose(&ws.wallet, &intent_pda, 0, &params, &ws.payer.pubkey());

    let result = setup::send_tx(&mut svm, &[ed25519_ix, propose_ix], &ws.payer, &[&ws.payer]);
    assert!(result.is_ok(), "Propose with decimals_param (0 decimals) failed: {:?}", result.err());
}
