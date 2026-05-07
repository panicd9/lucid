//! Cross-language byte fixture for `build_intent_bytes`.
//!
//! The TS side asserts the same hex against the same fixture files in
//! `dashboard/src/lib/__tests__/intentBytesCrossLang.test.ts`. If the on-chain
//! intent byte format ever changes, both this test and the TS one must be
//! updated together — drift between them silently produces incompatible
//! intents on the same wallet.
use lucid_cli::commands::wallet::build_intent_bytes;
use lucid_cli::types::IntentDefinition;

const SOL_FIXTURE: &str = "../demo/intents/sol_transfer.json";
const SPL_FIXTURE: &str = "../demo/intents/spl_transfer.json";

// Deterministic test inputs. Both producers use these exact bytes.
const PROPOSER: [u8; 32] = [0x11; 32];
const APPROVER: [u8; 32] = [0x22; 32];
const APPROVAL_THRESHOLD: u8 = 1;
const CANCELLATION_THRESHOLD: u8 = 1;

fn load(path: &str) -> IntentDefinition {
    let json = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("read {}: {}", path, e));
    serde_json::from_str(&json).expect("parse fixture as IntentDefinition")
}

fn serialize(path: &str) -> String {
    let def = load(path);
    let bytes = build_intent_bytes(
        &def,
        APPROVAL_THRESHOLD,
        CANCELLATION_THRESHOLD,
        &PROPOSER,
        &APPROVER,
    )
    .expect("build_intent_bytes");
    hex::encode(bytes)
}

#[test]
fn sol_transfer_bytes_match_locked_cross_language_hex() {
    // Locked. If you change the on-chain format, regenerate by replacing this
    // string with the printed `actual` from a failing run, AND mirror it in
    // dashboard/src/lib/__tests__/intentBytesCrossLang.test.ts.
    let expected = "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004d00000003000101010102030102005d3d3d5133d9e58d6775e75f65c9d4e0e51e67f92d4bc37edd34974f3a108f84000000111111111111111111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222222222222222220000000000000000450006000100090000000000000000004b00020000000000020101000000000001010000010000000000000021000000020002000200000000004100040001000000000000001d007472616e73666572207b616d6f756e747d20534f4c20746f207b746f7d000000000000000000000000000000000000000000000000000000000000000002000000616d6f756e74746f";
    let actual = serialize(SOL_FIXTURE);
    assert_eq!(actual, expected, "sol_transfer byte format drift\nactual: {}", actual);
}

#[test]
fn spl_transfer_bytes_match_locked_cross_language_hex() {
    // Locked. See note in sol_transfer test above for regeneration policy.
    //
    // CAVEAT: The current spl_transfer.json has a 1-byte literal seed `[6]`
    // for the SPL Token Program ID position in the ATA derivation, which is
    // only the first byte of the actual program ID (Tokenkeg... = 06 dd f6
    // e1 ...). The intent registers fine and these bytes are stable, but a
    // proposed transfer would derive the wrong source ATA at execute time.
    // Locking these bytes catches drift; fixing the seed is a separate task.
    let expected = "000000000000000000000000000000000000000000000000000000000000000006ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9100e000000008c0000000300010101010405010303f3efda21305372c6ce2348fab91ba7ecbdbd155c7beea67ec8fcca321f523e320000001111111111111111111111111111111111111111111111111111111111111111222222222222222222222222222222222222222222222222222222222222222200000000000000006f000600010000020000000000000000750008000500000000000000000000007d00040000000000000000000000000081000b00000000000301000000034d00010000000200000001010000030000000200010000000000000000002d000000040004000300000000006d00010001000000000001000100000002000300000000006e000100020001000000000029007472616e73666572207b616d6f756e747d207b6d696e747d20746f207b64657374696e6174696f6e7d06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a98c97258f4e2489f1bb3d1029148e0d830b5a1399daff1084048e7bd8dbe9f8590c06616d6f756e74646563696d616c736d696e7464657374696e6174696f6e";
    let actual = serialize(SPL_FIXTURE);
    assert_eq!(actual, expected, "spl_transfer byte format drift\nactual: {}", actual);
}

#[test]
fn build_intent_bytes_is_deterministic() {
    let a = serialize(SOL_FIXTURE);
    let b = serialize(SOL_FIXTURE);
    assert_eq!(a, b, "build_intent_bytes must produce identical output across calls");
}
