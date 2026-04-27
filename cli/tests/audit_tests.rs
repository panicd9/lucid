/// Tests for the audit module's pure functions:
/// - canonicalize_onchain_bytes: zeros program-filled fields
/// - extract_onchain_discriminator: reads discriminator from on-chain byte layout
/// - identify_region: maps byte offsets to human-readable region names
/// - build_intent_bytes + canonicalize round-trip

use lucid_cli::commands::audit::{
    canonicalize_built_bytes, canonicalize_onchain_bytes, extract_onchain_discriminator,
    identify_region,
};
use lucid_cli::intent_utils::IntentHeaderInfo;
use lucid_cli::types::*;

/// Build a minimal intent header info for tests.
fn test_header(
    proposer_count: u8,
    approver_count: u8,
    param_count: u8,
    account_count: u8,
    data_segment_count: u8,
    seed_count: u8,
) -> IntentHeaderInfo {
    IntentHeaderInfo {
        wallet: solana_sdk::pubkey::Pubkey::default(),
        target_program: solana_sdk::pubkey::Pubkey::default(),
        timelock_seconds: 0,
        active_proposal_count: 0,
        byte_pool_len: 0,
        bump: 0,
        intent_index: 0,
        intent_type: INTENT_TYPE_CUSTOM,
        approved: 0,
        approval_threshold: 1,
        cancellation_threshold: 1,
        proposer_count,
        approver_count,
        param_count,
        account_count,
        instruction_count: 1,
        data_segment_count,
        seed_count,
    }
}

/// Build a synthetic on-chain intent byte buffer (without PREFIX_LEN).
/// Fills in header fields and a single literal data segment pointing to
/// a discriminator in the byte pool.
fn build_synthetic_intent(disc: &[u8]) -> (Vec<u8>, IntentHeaderInfo) {
    let header = test_header(0, 0, 0, 0, 1, 0);

    let mut buf = vec![0u8; INTENT_HEADER_LEN];

    // target_program at offset 32..64
    buf[32..64].copy_from_slice(&[42u8; 32]);
    // timelock at 64..68
    buf[64..68].copy_from_slice(&3600u32.to_le_bytes());
    // active_proposal_count at 68..70 (program-filled)
    buf[68..70].copy_from_slice(&5u16.to_le_bytes());
    // byte_pool_len at 70..72 — will be set below
    // bump at 72 (program-filled)
    buf[72] = 255;
    // intent_index at 73 (program-filled)
    buf[73] = 7;
    // intent_type at 74
    buf[74] = INTENT_TYPE_CUSTOM;
    // approved at 75 (program-filled)
    buf[75] = 1;
    // approval_threshold at 76
    buf[76] = 1;
    // cancellation_threshold at 77
    buf[77] = 1;
    // proposer_count at 78
    buf[78] = 0;
    // approver_count at 79
    buf[79] = 0;
    // param_count at 80
    buf[80] = 0;
    // account_count at 81
    buf[81] = 0;
    // instruction_count at 82
    buf[82] = 1;
    // data_segment_count at 83
    buf[83] = 1;
    // seed_count at 84
    buf[84] = 0;

    // Instruction entry (8 bytes): not needed for disc extraction but must be present
    buf.extend_from_slice(&[0u8; INSTRUCTION_ENTRY_SIZE]);

    // Data segment entry (6 bytes): literal, pad, pool_offset(u16), pool_len(u16)
    buf.push(SEGMENT_LITERAL); // type
    buf.push(0); // pad
    // Template header is 4 bytes at start of byte pool, disc comes after template
    let template = b"test template";
    let disc_pool_offset = 4 + template.len() as u16; // after template header + template bytes
    buf.extend_from_slice(&disc_pool_offset.to_le_bytes()); // pool offset
    buf.extend_from_slice(&(disc.len() as u16).to_le_bytes()); // pool len

    // Byte pool: [template_offset(u16), template_len(u16), template_bytes, disc_bytes]
    let byte_pool_start = buf.len();
    buf.extend_from_slice(&0u16.to_le_bytes()); // template offset = 0
    buf.extend_from_slice(&(template.len() as u16).to_le_bytes());
    buf.extend_from_slice(template);
    buf.extend_from_slice(disc);

    let byte_pool_len = buf.len() - byte_pool_start;
    // Patch byte_pool_len in header
    buf[70..72].copy_from_slice(&(byte_pool_len as u16).to_le_bytes());

    (buf, header)
}

// ── canonicalize tests ──────────────────────────────────────────────

#[test]
fn canonicalize_zeros_wallet_pubkey() {
    let mut bytes = vec![0u8; INTENT_HEADER_LEN + 10];
    // Fill wallet pubkey with non-zero
    bytes[0..32].fill(0xAA);
    let canonical = canonicalize_onchain_bytes(&bytes);
    assert!(canonical[0..32].iter().all(|&b| b == 0));
}

#[test]
fn canonicalize_zeros_active_proposal_count() {
    let mut bytes = vec![0u8; INTENT_HEADER_LEN + 10];
    bytes[68..70].copy_from_slice(&99u16.to_le_bytes());
    let canonical = canonicalize_onchain_bytes(&bytes);
    assert_eq!(&canonical[68..70], &[0, 0]);
}

#[test]
fn canonicalize_zeros_bump() {
    let mut bytes = vec![0u8; INTENT_HEADER_LEN + 10];
    bytes[72] = 255;
    let canonical = canonicalize_onchain_bytes(&bytes);
    assert_eq!(canonical[72], 0);
}

#[test]
fn canonicalize_zeros_intent_index() {
    let mut bytes = vec![0u8; INTENT_HEADER_LEN + 10];
    bytes[73] = 42;
    let canonical = canonicalize_onchain_bytes(&bytes);
    assert_eq!(canonical[73], 0);
}

#[test]
fn canonicalize_zeros_approved_flag() {
    let mut bytes = vec![0u8; INTENT_HEADER_LEN + 10];
    bytes[75] = 1;
    let canonical = canonicalize_onchain_bytes(&bytes);
    assert_eq!(canonical[75], 0);
}

#[test]
fn canonicalize_preserves_non_program_fields() {
    let mut bytes = vec![0u8; INTENT_HEADER_LEN + 10];
    // target_program
    bytes[32..64].fill(0xBB);
    // timelock
    bytes[64..68].copy_from_slice(&3600u32.to_le_bytes());
    // approval_threshold
    bytes[76] = 2;
    // intent_type
    bytes[74] = INTENT_TYPE_CUSTOM;

    let canonical = canonicalize_onchain_bytes(&bytes);
    assert!(canonical[32..64].iter().all(|&b| b == 0xBB));
    assert_eq!(
        u32::from_le_bytes(canonical[64..68].try_into().unwrap()),
        3600
    );
    assert_eq!(canonical[76], 2);
    assert_eq!(canonical[74], INTENT_TYPE_CUSTOM);
}

#[test]
fn canonicalize_built_same_as_onchain() {
    // Two identical buffers with different program-filled fields
    // should canonicalize to the same result
    let mut onchain = vec![0u8; INTENT_HEADER_LEN + 20];
    let mut built = vec![0u8; INTENT_HEADER_LEN + 20];

    // Same user data
    onchain[32..64].fill(0xCC);
    built[32..64].fill(0xCC);
    onchain[64..68].copy_from_slice(&100u32.to_le_bytes());
    built[64..68].copy_from_slice(&100u32.to_le_bytes());

    // Different program-filled fields
    onchain[0..32].fill(0xFF); // wallet
    built[0..32].fill(0x00);
    onchain[72] = 250; // bump
    built[72] = 0;
    onchain[73] = 3; // intent_index
    built[73] = 0;
    onchain[75] = 1; // approved
    built[75] = 0;

    assert_eq!(
        canonicalize_onchain_bytes(&onchain),
        canonicalize_built_bytes(&built)
    );
}

// ── discriminator extraction tests ──────────────────────────────────

#[test]
fn extract_discriminator_from_synthetic_intent() {
    let disc = vec![1, 2, 3, 4, 5, 6, 7, 8];
    let (buf, header) = build_synthetic_intent(&disc);
    let extracted = extract_onchain_discriminator(&buf, &header);
    assert_eq!(extracted, Some(disc));
}

#[test]
fn extract_discriminator_different_values() {
    let disc = vec![0xAA, 0xBB, 0xCC, 0xDD, 0x11, 0x22, 0x33, 0x44];
    let (buf, header) = build_synthetic_intent(&disc);
    let extracted = extract_onchain_discriminator(&buf, &header);
    assert_eq!(extracted, Some(disc));
}

#[test]
fn extract_discriminator_no_data_segments() {
    let header = test_header(0, 0, 0, 0, 0, 0); // no data segments
    let buf = vec![0u8; INTENT_HEADER_LEN + INSTRUCTION_ENTRY_SIZE + 20];
    let extracted = extract_onchain_discriminator(&buf, &header);
    assert_eq!(extracted, None);
}

// ── identify_region tests ───────────────────────────────────────────

#[test]
fn identify_region_wallet_pubkey() {
    let header = test_header(0, 0, 0, 0, 0, 0);
    assert!(identify_region(0, &header).contains("wallet"));
    assert!(identify_region(31, &header).contains("wallet"));
}

#[test]
fn identify_region_target_program() {
    let header = test_header(0, 0, 0, 0, 0, 0);
    assert!(identify_region(32, &header).contains("target_program"));
    assert!(identify_region(63, &header).contains("target_program"));
}

#[test]
fn identify_region_timelock() {
    let header = test_header(0, 0, 0, 0, 0, 0);
    assert!(identify_region(64, &header).contains("timelock"));
    assert!(identify_region(67, &header).contains("timelock"));
}

#[test]
fn identify_region_header_flags() {
    let header = test_header(0, 0, 0, 0, 0, 0);
    assert!(identify_region(76, &header).contains("header flags"));
}

#[test]
fn identify_region_proposers() {
    let header = test_header(2, 3, 0, 0, 0, 0);
    // Proposers start at INTENT_HEADER_LEN (88), 2 * 32 = 64 bytes
    assert!(identify_region(INTENT_HEADER_LEN, &header).contains("proposers"));
    assert!(identify_region(INTENT_HEADER_LEN + 63, &header).contains("proposers"));
}

#[test]
fn identify_region_approvers() {
    let header = test_header(1, 2, 0, 0, 0, 0);
    // Approvers start after proposers: 88 + 1*32 = 120
    let approver_start = INTENT_HEADER_LEN + 32;
    assert!(identify_region(approver_start, &header).contains("approvers"));
}

#[test]
fn identify_region_params() {
    let header = test_header(0, 0, 2, 0, 0, 0);
    assert!(identify_region(INTENT_HEADER_LEN, &header).contains("params"));
}

#[test]
fn identify_region_accounts() {
    let header = test_header(0, 0, 0, 2, 0, 0);
    assert!(identify_region(INTENT_HEADER_LEN, &header).contains("accounts"));
}

// ── build + canonicalize round-trip ─────────────────────────────────

#[test]
fn build_intent_bytes_produces_correct_header_size() {
    let def = IntentDefinition {
        version: 1,
        program_id: "11111111111111111111111111111111".to_string(),
        instruction_name: "test".to_string(),
        discriminator: vec![1, 2, 3, 4, 5, 6, 7, 8],
        params: vec![],
        accounts: vec![],
        data_segments: vec![DataSegmentDef {
            segment_type: "literal".to_string(),
            data: Some(serde_json::json!([1, 2, 3, 4, 5, 6, 7, 8])),
            param_index: None,
        }],
        seeds: vec![],
        template: "test intent".to_string(),
        risk_level: "LOW".to_string(),
        timelock_seconds: 0,
        verification: None,
    };

    let bytes =
        lucid_cli::commands::wallet::build_intent_bytes(&def, 1, 1, &[], &[]).unwrap();

    // Should start with INTENT_HEADER_LEN bytes of header
    assert!(bytes.len() >= INTENT_HEADER_LEN);
    // intent_type should be CUSTOM
    assert_eq!(bytes[74], INTENT_TYPE_CUSTOM);
}

#[test]
fn build_and_canonicalize_is_idempotent() {
    let def = IntentDefinition {
        version: 1,
        program_id: "11111111111111111111111111111111".to_string(),
        instruction_name: "test".to_string(),
        discriminator: vec![1, 2, 3, 4, 5, 6, 7, 8],
        params: vec![],
        accounts: vec![],
        data_segments: vec![DataSegmentDef {
            segment_type: "literal".to_string(),
            data: Some(serde_json::json!([1, 2, 3, 4, 5, 6, 7, 8])),
            param_index: None,
        }],
        seeds: vec![],
        template: "test intent".to_string(),
        risk_level: "LOW".to_string(),
        timelock_seconds: 0,
        verification: None,
    };

    let bytes =
        lucid_cli::commands::wallet::build_intent_bytes(&def, 2, 1, &[], &[]).unwrap();
    let c1 = canonicalize_built_bytes(&bytes);
    let c2 = canonicalize_built_bytes(&c1);
    assert_eq!(c1, c2);
}

/// Regression: a `pda` account whose `sourceData` omits `program` must default
/// the byte-pool program offset to the target program (not 0). Offset 0 is the
/// template header, so reading 32 bytes there yields garbage and produces a
/// wrong PDA at execute time — which manifests as Anchor's AccountNotInitialized
/// (0xbc4) rather than a seeds error, since the wrong PDA points to a system
/// account that fails type-loading before constraint checks run.
#[test]
fn pda_account_without_program_field_uses_target_program() {
    use lucid_cli::types::{INTENT_HEADER_LEN, ACCOUNT_ENTRY_SIZE, SOURCE_PDA};

    let target_program_b58 = "Ab1nTbMuFjcfoRJWWAdxPAVotYz2kzPxS18Yzie2iiQt";
    let target_program_bytes = bs58::decode(target_program_b58).into_vec().unwrap();

    // Mirrors demo/intents/accept_admin.json: a single PDA account with seedCount/seedStart
    // but no `program` field in sourceData.
    let def = IntentDefinition {
        version: 1,
        program_id: target_program_b58.to_string(),
        instruction_name: "accept_admin".to_string(),
        discriminator: vec![112, 42, 45, 90, 116, 181, 13, 170],
        params: vec![],
        accounts: vec![AccountDef {
            name: "global_config".to_string(),
            source: "pda".to_string(),
            writable: true,
            is_signer: false,
            source_data: Some(serde_json::json!({
                "seedCount": 1,
                "seedStart": 0,
            })),
        }],
        data_segments: vec![DataSegmentDef {
            segment_type: "literal".to_string(),
            data: Some(serde_json::json!([112, 42, 45, 90, 116, 181, 13, 170])),
            param_index: None,
        }],
        seeds: vec![SeedDef {
            seed_type: "literal".to_string(),
            value: Some(serde_json::json!("global-config")),
            param_index: None,
            account_index: None,
            field_offset: None,
            field_len: None,
        }],
        template: "accept admin".to_string(),
        risk_level: "CRITICAL".to_string(),
        timelock_seconds: 0,
        verification: None,
    };

    let bytes =
        lucid_cli::commands::wallet::build_intent_bytes(&def, 1, 1, &[], &[]).unwrap();

    // build_intent_bytes returns data without PREFIX_LEN. The accounts table
    // sits immediately after the 88-byte header (no proposers/approvers/params).
    let pda_entry_offset = INTENT_HEADER_LEN;
    assert_eq!(bytes[pda_entry_offset], SOURCE_PDA, "first account should be SOURCE_PDA");
    let prog_off =
        u16::from_le_bytes([bytes[pda_entry_offset + 6], bytes[pda_entry_offset + 7]]) as usize;
    assert_ne!(
        prog_off, 0,
        "prog_off must not be 0 — that would point at the template header in the byte pool"
    );

    // byte_pool starts after: header + accounts(2 entries: PDA + target-program) + 1 instruction + 1 data segment + 1 seed.
    let bp_offset = INTENT_HEADER_LEN
        + 2 * ACCOUNT_ENTRY_SIZE
        + INSTRUCTION_ENTRY_SIZE
        + DATA_SEGMENT_ENTRY_SIZE
        + SEED_ENTRY_SIZE;

    let prog_bytes_in_pool = &bytes[bp_offset + prog_off..bp_offset + prog_off + 32];
    assert_eq!(
        prog_bytes_in_pool,
        target_program_bytes.as_slice(),
        "PDA prog_off must point to the target program bytes in the byte pool"
    );
}

/// SEED_ACCOUNT_FIELD encodes the account index, byte offset (u16 LE), and
/// byte length into the 4-byte seed_data slot. The encoder must reject
/// fieldLen == 0 or > 32, and the wire bytes must be readable as the same
/// values the resolver expects.
#[test]
fn seed_account_field_encodes_account_index_offset_len() {
    use lucid_cli::types::{INTENT_HEADER_LEN, ACCOUNT_ENTRY_SIZE, SEED_ACCOUNT_FIELD};

    // Single PDA account whose seeds include one SEED_ACCOUNT_FIELD entry.
    // No proposers/approvers/params, 1 account (+ 1 target-program entry),
    // 1 instruction, 1 data segment, 1 seed.
    let def = IntentDefinition {
        version: 1,
        program_id: "11111111111111111111111111111111".to_string(),
        instruction_name: "test".to_string(),
        discriminator: vec![1, 2, 3, 4, 5, 6, 7, 8],
        params: vec![],
        accounts: vec![AccountDef {
            name: "child".to_string(),
            source: "pda".to_string(),
            writable: true,
            is_signer: false,
            source_data: Some(serde_json::json!({
                "seedCount": 1,
                "seedStart": 0,
            })),
        }],
        data_segments: vec![DataSegmentDef {
            segment_type: "literal".to_string(),
            data: Some(serde_json::json!([1, 2, 3, 4, 5, 6, 7, 8])),
            param_index: None,
        }],
        seeds: vec![SeedDef {
            seed_type: "account_field".to_string(),
            value: Some(serde_json::json!("pool.deposit_mint")),
            param_index: None,
            account_index: Some(1),
            field_offset: Some(48),
            field_len: Some(32),
        }],
        template: "test".to_string(),
        risk_level: "LOW".to_string(),
        timelock_seconds: 0,
        verification: None,
    };

    let bytes = lucid_cli::commands::wallet::build_intent_bytes(&def, 1, 1, &[], &[]).unwrap();

    // seeds table sits after: header + 2 accounts (PDA + target program) + 1 instruction + 1 data segment.
    let seeds_offset = INTENT_HEADER_LEN
        + 2 * ACCOUNT_ENTRY_SIZE
        + INSTRUCTION_ENTRY_SIZE
        + DATA_SEGMENT_ENTRY_SIZE;

    // SeedEntry layout: [type:u8, pad:u8, data:[u8;4]]
    assert_eq!(bytes[seeds_offset], SEED_ACCOUNT_FIELD, "seed type tag");
    assert_eq!(bytes[seeds_offset + 1], 0, "padding byte");
    assert_eq!(bytes[seeds_offset + 2], 1, "account index");
    let off = u16::from_le_bytes([bytes[seeds_offset + 3], bytes[seeds_offset + 4]]);
    assert_eq!(off, 48, "field offset");
    assert_eq!(bytes[seeds_offset + 5], 32, "field length");
}

/// fieldLen of 0 or > 32 should be rejected by the encoder. 32 is the max
/// supported seed buffer width on-chain (seed_bufs is [[u8; 32]; 16]).
#[test]
fn seed_account_field_rejects_invalid_field_len() {
    let make = |len: u8| IntentDefinition {
        version: 1,
        program_id: "11111111111111111111111111111111".to_string(),
        instruction_name: "test".to_string(),
        discriminator: vec![1, 2, 3, 4, 5, 6, 7, 8],
        params: vec![],
        accounts: vec![AccountDef {
            name: "child".to_string(),
            source: "pda".to_string(),
            writable: true,
            is_signer: false,
            source_data: Some(serde_json::json!({"seedCount": 1, "seedStart": 0})),
        }],
        data_segments: vec![DataSegmentDef {
            segment_type: "literal".to_string(),
            data: Some(serde_json::json!([1, 2, 3, 4, 5, 6, 7, 8])),
            param_index: None,
        }],
        seeds: vec![SeedDef {
            seed_type: "account_field".to_string(),
            value: None,
            param_index: None,
            account_index: Some(0),
            field_offset: Some(0),
            field_len: Some(len),
        }],
        template: "t".to_string(),
        risk_level: "LOW".to_string(),
        timelock_seconds: 0,
        verification: None,
    };

    assert!(lucid_cli::commands::wallet::build_intent_bytes(&make(0), 1, 1, &[], &[]).is_err());
    assert!(lucid_cli::commands::wallet::build_intent_bytes(&make(33), 1, 1, &[], &[]).is_err());
    assert!(lucid_cli::commands::wallet::build_intent_bytes(&make(32), 1, 1, &[], &[]).is_ok());
    assert!(lucid_cli::commands::wallet::build_intent_bytes(&make(1), 1, 1, &[], &[]).is_ok());
}
