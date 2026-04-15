use lucid_cli::types::*;

// ---------------------------------------------------------------------------
// param_type_size
// ---------------------------------------------------------------------------

#[test]
fn param_type_size_address() {
    assert_eq!(param_type_size(PARAM_TYPE_ADDRESS), 32);
}

#[test]
fn param_type_size_u64() {
    assert_eq!(param_type_size(PARAM_TYPE_U64), 8);
}

#[test]
fn param_type_size_i64() {
    assert_eq!(param_type_size(PARAM_TYPE_I64), 8);
}

#[test]
fn param_type_size_string() {
    assert_eq!(param_type_size(PARAM_TYPE_STRING), 0);
}

#[test]
fn param_type_size_bool() {
    assert_eq!(param_type_size(PARAM_TYPE_BOOL), 1);
}

#[test]
fn param_type_size_u8() {
    assert_eq!(param_type_size(PARAM_TYPE_U8), 1);
}

#[test]
fn param_type_size_u16() {
    assert_eq!(param_type_size(PARAM_TYPE_U16), 2);
}

#[test]
fn param_type_size_u32() {
    assert_eq!(param_type_size(PARAM_TYPE_U32), 4);
}

#[test]
fn param_type_size_u128() {
    assert_eq!(param_type_size(PARAM_TYPE_U128), 16);
}

// ---------------------------------------------------------------------------
// param_type_from_str
// ---------------------------------------------------------------------------

#[test]
fn param_type_from_str_address() {
    assert_eq!(param_type_from_str("address"), Some(PARAM_TYPE_ADDRESS)); // 0
}

#[test]
fn param_type_from_str_public_key_alias() {
    assert_eq!(param_type_from_str("publicKey"), Some(PARAM_TYPE_ADDRESS));
}

#[test]
fn param_type_from_str_u64() {
    assert_eq!(param_type_from_str("u64"), Some(PARAM_TYPE_U64)); // 1
}

#[test]
fn param_type_from_str_i64() {
    assert_eq!(param_type_from_str("i64"), Some(PARAM_TYPE_I64)); // 2
}

#[test]
fn param_type_from_str_string() {
    assert_eq!(param_type_from_str("string"), Some(PARAM_TYPE_STRING)); // 3
}

#[test]
fn param_type_from_str_bool() {
    assert_eq!(param_type_from_str("bool"), Some(PARAM_TYPE_BOOL)); // 4
}

#[test]
fn param_type_from_str_u8() {
    assert_eq!(param_type_from_str("u8"), Some(PARAM_TYPE_U8)); // 5
}

#[test]
fn param_type_from_str_u16() {
    assert_eq!(param_type_from_str("u16"), Some(PARAM_TYPE_U16)); // 6
}

#[test]
fn param_type_from_str_u32() {
    assert_eq!(param_type_from_str("u32"), Some(PARAM_TYPE_U32)); // 7
}

#[test]
fn param_type_from_str_u128() {
    assert_eq!(param_type_from_str("u128"), Some(PARAM_TYPE_U128)); // 8
}

#[test]
fn param_type_from_str_unknown_returns_none() {
    assert_eq!(param_type_from_str("banana"), None);
}

// ---------------------------------------------------------------------------
// param_type_to_str round-trips with param_type_from_str
// ---------------------------------------------------------------------------

#[test]
fn param_type_round_trip_all_types() {
    let names = ["address", "u64", "i64", "string", "bool", "u8", "u16", "u32", "u128"];
    for name in names {
        let numeric = param_type_from_str(name).unwrap();
        let back = param_type_to_str(numeric);
        assert_eq!(
            back, name,
            "round-trip failed for '{}': from_str={}, to_str='{}'",
            name, numeric, back
        );
    }
}

// ---------------------------------------------------------------------------
// status_to_str
// ---------------------------------------------------------------------------

#[test]
fn status_to_str_active() {
    assert_eq!(status_to_str(0), "Active");
}

#[test]
fn status_to_str_approved() {
    assert_eq!(status_to_str(1), "Approved");
}

#[test]
fn status_to_str_executed() {
    assert_eq!(status_to_str(2), "Executed");
}

#[test]
fn status_to_str_cancelled() {
    assert_eq!(status_to_str(3), "Cancelled");
}

#[test]
fn status_to_str_unknown() {
    assert_eq!(status_to_str(255), "Unknown");
}

// ---------------------------------------------------------------------------
// intent_type_to_str
// ---------------------------------------------------------------------------

#[test]
fn intent_type_to_str_add() {
    assert_eq!(intent_type_to_str(0), "Add");
}

#[test]
fn intent_type_to_str_remove() {
    assert_eq!(intent_type_to_str(1), "Remove");
}

#[test]
fn intent_type_to_str_update() {
    assert_eq!(intent_type_to_str(2), "Update");
}

#[test]
fn intent_type_to_str_custom() {
    assert_eq!(intent_type_to_str(3), "Custom");
}

#[test]
fn intent_type_to_str_unknown() {
    assert_eq!(intent_type_to_str(99), "Unknown");
}

// ---------------------------------------------------------------------------
// source_to_str
// ---------------------------------------------------------------------------

#[test]
fn source_to_str_static() {
    assert_eq!(source_to_str(0), "static");
}

#[test]
fn source_to_str_param() {
    assert_eq!(source_to_str(1), "param");
}

#[test]
fn source_to_str_vault() {
    assert_eq!(source_to_str(2), "vault");
}

#[test]
fn source_to_str_pda() {
    assert_eq!(source_to_str(3), "pda");
}

#[test]
fn source_to_str_unknown() {
    assert_eq!(source_to_str(200), "unknown");
}
