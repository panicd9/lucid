use lucid_cli::intent_utils::compute_template_hash;
use lucid_cli::types::*;

const FIXTURE_PATH: &str = "../demo/intents/spl_transfer.json";

fn load_fixture() -> IntentDefinition {
    let json = std::fs::read_to_string(FIXTURE_PATH)
        .unwrap_or_else(|e| panic!("read {}: {}", FIXTURE_PATH, e));
    serde_json::from_str(&json).expect("parse fixture as IntentDefinition")
}

#[test]
fn template_hash_is_32_bytes() {
    let h = compute_template_hash(&load_fixture());
    assert_eq!(h.len(), 32);
}

#[test]
fn template_hash_matches_locked_cross_language_hex() {
    // The TS side asserts the same hex against the same fixture file in
    // sdk/src/__tests__/template-hash.test.ts.
    let expected = "f3efda21305372c6ce2348fab91ba7ecbdbd155c7beea67ec8fcca321f523e32";
    let h = compute_template_hash(&load_fixture());
    assert_eq!(hex::encode(h), expected);
}

#[test]
fn template_hash_ignores_risk_level_and_timelock() {
    let mut a = load_fixture();
    let h_before = compute_template_hash(&a);
    a.risk_level = "MEDIUM".into();
    a.timelock_seconds = 7200;
    a.verification = Some(VerificationInfo {
        tier: 2,
        program_name: Some("foo".into()),
        verified: Some(true),
    });
    let h_after = compute_template_hash(&a);
    assert_eq!(h_before, h_after, "policy fields must not affect template hash");
}

#[test]
fn template_hash_changes_with_template_string() {
    let h_before = compute_template_hash(&load_fixture());
    let mut b = load_fixture();
    b.template = "send {amount} {mint} to {destination}".into();
    let h_after = compute_template_hash(&b);
    assert_ne!(h_before, h_after);
}

#[test]
fn template_hash_changes_with_discriminator() {
    let h_before = compute_template_hash(&load_fixture());
    let mut b = load_fixture();
    b.discriminator = vec![3];
    let h_after = compute_template_hash(&b);
    assert_ne!(h_before, h_after);
}

#[test]
fn template_hash_changes_with_non_ascii_template() {
    // Non-ASCII path catches encoding-mismatch bugs between Rust serde_json
    // and the TS canonicalStringify (UTF-8 vs surrogate-pair handling).
    let h_before = compute_template_hash(&load_fixture());
    let mut b = load_fixture();
    b.template = "transfer {amount} → {destination} 🚀".into();
    let h_after = compute_template_hash(&b);
    assert_ne!(h_before, h_after);
}
