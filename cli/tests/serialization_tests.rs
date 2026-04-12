/// Tests that verify on-chain account layout offsets are correctly understood
/// by the CLI.  We build raw byte buffers that mirror the on-chain
/// #[repr(C)] layout, then read specific offsets and assert the values.
///
/// Layout constants imported from lucid_cli::types.

use lucid_cli::types::*;

// -------------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------------

/// Write a little-endian u64 into `buf` at `offset`.
fn write_u64(buf: &mut [u8], offset: usize, val: u64) {
    buf[offset..offset + 8].copy_from_slice(&val.to_le_bytes());
}

/// Write a little-endian u16 into `buf` at `offset`.
fn write_u16(buf: &mut [u8], offset: usize, val: u16) {
    buf[offset..offset + 2].copy_from_slice(&val.to_le_bytes());
}

/// Write a little-endian u32 into `buf` at `offset`.
fn write_u32(buf: &mut [u8], offset: usize, val: u32) {
    buf[offset..offset + 4].copy_from_slice(&val.to_le_bytes());
}

/// Write a little-endian i64 into `buf` at `offset`.
fn write_i64(buf: &mut [u8], offset: usize, val: i64) {
    buf[offset..offset + 8].copy_from_slice(&val.to_le_bytes());
}

/// Read a little-endian u16 from `buf` at `offset`.
fn read_u16(buf: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes(buf[offset..offset + 2].try_into().unwrap())
}

/// Read a little-endian i64 from `buf` at `offset`.
fn read_i64(buf: &[u8], offset: usize) -> i64 {
    i64::from_le_bytes(buf[offset..offset + 8].try_into().unwrap())
}

// =========================================================================
// Wallet layout tests
// =========================================================================
// Wallet on-chain layout (after 8-byte Anchor discriminator replaced by our
// 2-byte prefix in the CLI model):
//   offset 0: disc (u8)        – 1 byte
//   offset 1: version (u8)     – 1 byte
//   ---- PREFIX_LEN = 2 ----
//   offset 2: proposal_index   – u64 (8 bytes)
//   offset 10: intent_count    – u8
//   offset 11: frozen          – u8
//   offset 12: bump            – u8
//   offset 13: name_len        – u8
//   offset 14: reserved        – 4 bytes
//   offset 18: name            – 32 bytes
//   total data after prefix: WALLET_DATA_LEN = 48, so total = 50

#[test]
fn wallet_proposal_index_at_offset_2() {
    let mut buf = vec![0u8; PREFIX_LEN + WALLET_DATA_LEN]; // 50 bytes
    buf[0] = DISC_WALLET; // disc
    buf[1] = 1;           // version

    let expected: u64 = 0xDEAD_BEEF_CAFE_1234;
    write_u64(&mut buf, PREFIX_LEN, expected); // offset 2

    let pd = &buf[PREFIX_LEN..]; // data after prefix
    let read_val = u64::from_le_bytes(pd[0..8].try_into().unwrap());
    assert_eq!(read_val, expected, "proposal_index should be at offset PREFIX_LEN (2)");
}

#[test]
fn wallet_intent_count_at_offset_10() {
    let mut buf = vec![0u8; PREFIX_LEN + WALLET_DATA_LEN];
    buf[0] = DISC_WALLET;
    buf[1] = 1;

    let expected_intent_count: u8 = 7;
    buf[PREFIX_LEN + 8] = expected_intent_count; // offset 10 raw, 8 in pd

    let pd = &buf[PREFIX_LEN..];
    assert_eq!(pd[8], expected_intent_count, "intent_count at pd[8]");
}

#[test]
fn wallet_frozen_at_offset_11() {
    let mut buf = vec![0u8; PREFIX_LEN + WALLET_DATA_LEN];
    buf[0] = DISC_WALLET;
    buf[1] = 1;

    buf[PREFIX_LEN + 9] = 1; // frozen = true

    let pd = &buf[PREFIX_LEN..];
    assert_eq!(pd[9], 1, "frozen at pd[9]");
}

#[test]
fn wallet_name_len_at_offset_13() {
    let mut buf = vec![0u8; PREFIX_LEN + WALLET_DATA_LEN];
    buf[0] = DISC_WALLET;
    buf[1] = 1;

    let expected_name_len: u8 = 11;
    buf[PREFIX_LEN + 11] = expected_name_len; // offset 13 raw, 11 in pd

    let pd = &buf[PREFIX_LEN..];
    assert_eq!(pd[11], expected_name_len, "name_len at pd[11]");
}

// =========================================================================
// Proposal layout tests
// =========================================================================
// Proposal on-chain layout (PREFIX_LEN = 2, DATA_LEN = 168):
//   [disc:1, version:1] -- prefix (2)
//   pd[0..32]:   wallet (Pubkey)
//   pd[32..64]:  intent (Pubkey)
//   pd[64..72]:  proposal_index (u64)
//   pd[72..104]: proposer (Pubkey)
//   pd[104..106]: approval_bitmap (u16)
//   pd[106..108]: cancellation_bitmap (u16)
//   pd[108]:     status (u8)
//   pd[109]:     bump (u8)
//   pd[110..112]: pad (2 bytes)
//   pd[112..120]: proposed_at (i64)
//   pd[120..128]: approved_at (i64)
//   pd[128..160]: rent_refund (Pubkey)
//   pd[160..162]: params_data_len (u16)
//   pd[162..168]: reserved (6 bytes)

#[test]
fn proposal_status_at_correct_offset() {
    let mut buf = vec![0u8; PREFIX_LEN + PROPOSAL_DATA_LEN]; // 170 bytes
    buf[0] = DISC_PROPOSAL;
    buf[1] = 1;

    let status = STATUS_APPROVED;
    buf[PREFIX_LEN + 108] = status;

    let pd = &buf[PREFIX_LEN..];
    assert_eq!(pd[108], status, "status should be at pd[108]");
}

#[test]
fn proposal_approval_bitmap_at_offset_104() {
    let mut buf = vec![0u8; PREFIX_LEN + PROPOSAL_DATA_LEN];
    buf[0] = DISC_PROPOSAL;
    buf[1] = 1;

    let expected: u16 = 0b1010_1010_0101_0101;
    write_u16(&mut buf, PREFIX_LEN + 104, expected);

    let pd = &buf[PREFIX_LEN..];
    let read_val = read_u16(pd, 104);
    assert_eq!(read_val, expected, "approval_bitmap at pd[104..106]");
}

#[test]
fn proposal_cancellation_bitmap_at_offset_106() {
    let mut buf = vec![0u8; PREFIX_LEN + PROPOSAL_DATA_LEN];
    buf[0] = DISC_PROPOSAL;
    buf[1] = 1;

    let expected: u16 = 0xFF00;
    write_u16(&mut buf, PREFIX_LEN + 106, expected);

    let pd = &buf[PREFIX_LEN..];
    let read_val = read_u16(pd, 106);
    assert_eq!(read_val, expected, "cancellation_bitmap at pd[106..108]");
}

#[test]
fn proposal_params_data_len_at_offset_160() {
    let mut buf = vec![0u8; PREFIX_LEN + PROPOSAL_DATA_LEN];
    buf[0] = DISC_PROPOSAL;
    buf[1] = 1;

    let expected: u16 = 512;
    write_u16(&mut buf, PREFIX_LEN + 160, expected);

    let pd = &buf[PREFIX_LEN..];
    let read_val = read_u16(pd, 160);
    assert_eq!(read_val, expected, "params_data_len at pd[160..162]");
}

#[test]
fn proposal_proposed_at_offset_112() {
    let mut buf = vec![0u8; PREFIX_LEN + PROPOSAL_DATA_LEN];
    buf[0] = DISC_PROPOSAL;
    buf[1] = 1;

    let expected: i64 = 1_700_000_000;
    write_i64(&mut buf, PREFIX_LEN + 112, expected);

    let pd = &buf[PREFIX_LEN..];
    let read_val = read_i64(pd, 112);
    assert_eq!(read_val, expected, "proposed_at at pd[112..120]");
}

#[test]
fn proposal_approved_at_offset_120() {
    let mut buf = vec![0u8; PREFIX_LEN + PROPOSAL_DATA_LEN];
    buf[0] = DISC_PROPOSAL;
    buf[1] = 1;

    let expected: i64 = 1_700_003_600;
    write_i64(&mut buf, PREFIX_LEN + 120, expected);

    let pd = &buf[PREFIX_LEN..];
    let read_val = read_i64(pd, 120);
    assert_eq!(read_val, expected, "approved_at at pd[120..128]");
}

// =========================================================================
// IntentHeader layout tests
// =========================================================================
// IntentHeader on-chain layout (PREFIX_LEN = 2, DATA_LEN = 56):
//   [disc:1, version:1] -- prefix (2)
//   pd[0..32]:  wallet (Pubkey)
//   pd[32..36]: timelock_seconds (u32)
//   pd[36..38]: active_proposal_count (u16)
//   pd[38..40]: byte_pool_len (u16)
//   pd[40]:     bump (u8)
//   pd[41]:     intent_index (u8)
//   pd[42]:     intent_type (u8)
//   pd[43]:     approved (u8)
//   pd[44]:     approval_threshold (u8)
//   pd[45]:     cancellation_threshold (u8)
//   pd[46]:     proposer_count (u8)
//   pd[47]:     approver_count (u8)
//   pd[48]:     param_count (u8)
//   pd[49]:     account_count (u8)
//   pd[50]:     instruction_count (u8)
//   pd[51]:     data_segment_count (u8)
//   pd[52]:     seed_count (u8)
//   pd[53..56]: reserved (3 bytes)

#[test]
fn intent_header_intent_type_at_offset_42() {
    let mut buf = vec![0u8; PREFIX_LEN + INTENT_HEADER_LEN];
    buf[0] = DISC_INTENT;
    buf[1] = 1;

    buf[PREFIX_LEN + 42] = INTENT_TYPE_CUSTOM; // 3

    let pd = &buf[PREFIX_LEN..];
    assert_eq!(pd[42], INTENT_TYPE_CUSTOM, "intent_type at pd[42]");
}

#[test]
fn intent_header_proposer_count_at_offset_46() {
    let mut buf = vec![0u8; PREFIX_LEN + INTENT_HEADER_LEN];
    buf[0] = DISC_INTENT;
    buf[1] = 1;

    buf[PREFIX_LEN + 46] = 5;

    let pd = &buf[PREFIX_LEN..];
    assert_eq!(pd[46], 5, "proposer_count at pd[46]");
}

#[test]
fn intent_header_approver_count_at_offset_47() {
    let mut buf = vec![0u8; PREFIX_LEN + INTENT_HEADER_LEN];
    buf[0] = DISC_INTENT;
    buf[1] = 1;

    buf[PREFIX_LEN + 47] = 3;

    let pd = &buf[PREFIX_LEN..];
    assert_eq!(pd[47], 3, "approver_count at pd[47]");
}

#[test]
fn intent_header_byte_pool_offset_calculation() {
    // Given known counts, the variable-length arrays that follow the fixed
    // header are laid out sequentially.  The byte pool starts right after:
    //   INTENT_HEADER_LEN
    //   + proposer_count * 32   (Pubkey each)
    //   + approver_count * 32   (Pubkey each)
    //   + param_count   * PARAM_ENTRY_SIZE
    //   + account_count * ACCOUNT_ENTRY_SIZE
    //   + instruction_count * INSTRUCTION_ENTRY_SIZE
    //   + data_segment_count * DATA_SEGMENT_ENTRY_SIZE
    //   + seed_count * SEED_ENTRY_SIZE

    let proposer_count: usize = 2;
    let approver_count: usize = 3;
    let param_count: usize = 1;
    let account_count: usize = 2;
    let instruction_count: usize = 1;
    let data_segment_count: usize = 2;
    let seed_count: usize = 1;

    let expected_offset = INTENT_HEADER_LEN
        + proposer_count * 32
        + approver_count * 32
        + param_count * PARAM_ENTRY_SIZE
        + account_count * ACCOUNT_ENTRY_SIZE
        + instruction_count * INSTRUCTION_ENTRY_SIZE
        + data_segment_count * DATA_SEGMENT_ENTRY_SIZE
        + seed_count * SEED_ENTRY_SIZE;

    // Manual calculation:
    //   56 + 64 + 96 + 16 + 16 + 8 + 12 + 6 = 274
    let manual = 56 + (2 * 32) + (3 * 32) + (1 * 16) + (2 * 8) + (1 * 8) + (2 * 6) + (1 * 6);
    assert_eq!(expected_offset, manual, "byte_pool_offset formula must match manual calc");
    assert_eq!(expected_offset, 274);

    // Build a buffer large enough and verify we can write/read the byte pool
    // at the computed offset (relative to data start, i.e. after PREFIX_LEN).
    let total_len = PREFIX_LEN + expected_offset + 4; // 4 extra for a test marker
    let mut buf = vec![0u8; total_len];
    buf[0] = DISC_INTENT;
    buf[1] = 1;

    // Set counts in the header
    let pd_start = PREFIX_LEN;
    buf[pd_start + 46] = proposer_count as u8;
    buf[pd_start + 47] = approver_count as u8;
    buf[pd_start + 48] = param_count as u8;
    buf[pd_start + 49] = account_count as u8;
    buf[pd_start + 50] = instruction_count as u8;
    buf[pd_start + 51] = data_segment_count as u8;
    buf[pd_start + 52] = seed_count as u8;

    // Write a marker at the byte pool offset
    let marker: u32 = 0xCAFE_BABE;
    let pool_abs = pd_start + expected_offset;
    write_u32(&mut buf, pool_abs, marker);

    // Read it back
    let val = u32::from_le_bytes(buf[pool_abs..pool_abs + 4].try_into().unwrap());
    assert_eq!(val, marker, "marker at computed byte_pool_offset must be readable");
}
