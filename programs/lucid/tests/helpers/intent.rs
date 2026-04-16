use super::{
    INTENT_TYPE_CUSTOM, INTENT_HEADER_LEN, PARAM_ENTRY_SIZE, ACCOUNT_ENTRY_SIZE,
    INSTRUCTION_ENTRY_SIZE, DATA_SEGMENT_ENTRY_SIZE, SEED_ENTRY_SIZE,
    PARAM_TYPE_U64, PARAM_TYPE_ADDRESS,
    SOURCE_STATIC, SOURCE_PARAM, SOURCE_VAULT, SEGMENT_LITERAL, SEGMENT_PARAM,
};

/// Builder for constructing raw intent data bytes that match on-chain IntentHeader + arrays + byte_pool.
/// This builds the data that goes AFTER the discriminator + version prefix (i.e., what gets written
/// starting at offset PREFIX_LEN in the account).
pub struct IntentDataBuilder {
    // IntentHeader fields
    pub wallet: [u8; 32],
    pub target_program: [u8; 32],
    pub timelock_seconds: u32,
    pub intent_type: u8,
    pub approval_threshold: u8,
    pub cancellation_threshold: u8,
    pub proposers: Vec<[u8; 32]>,
    pub approvers: Vec<[u8; 32]>,
    pub params: Vec<ParamDef>,
    pub accounts: Vec<AccountDef>,
    pub instructions: Vec<InstructionDef>,
    pub data_segments: Vec<DataSegmentDef>,
    pub seeds: Vec<SeedDef>,
    pub template: Vec<u8>,
    pub byte_pool_extra: Vec<u8>, // extra bytes in byte_pool after template
}

pub struct ParamDef {
    pub param_type: u8,
    pub constraint_type: u8,
    pub constraint_value: u64,
    pub display_decimals: u8,
    pub decimals_param: u8,
    pub name: Vec<u8>,
}

pub struct AccountDef {
    pub source: u8,
    pub writable: u8,
    pub is_signer: u8,
    pub source_data: [u8; 4],
}

pub struct InstructionDef {
    pub program_account_index: u8,
    pub account_start_index: u8,
    pub account_count: u8,
    pub data_segment_start_index: u8,
    pub data_segment_count: u8,
}

pub struct DataSegmentDef {
    pub segment_type: u8,
    pub segment_data: [u8; 4],
}

pub struct SeedDef {
    pub seed_type: u8,
    pub seed_data: [u8; 4],
}

impl IntentDataBuilder {
    pub fn new() -> Self {
        Self {
            wallet: [0; 32],
            target_program: [0; 32],
            timelock_seconds: 0,
            intent_type: INTENT_TYPE_CUSTOM,
            approval_threshold: 1,
            cancellation_threshold: 1,
            proposers: Vec::new(),
            approvers: Vec::new(),
            params: Vec::new(),
            accounts: Vec::new(),
            instructions: Vec::new(),
            data_segments: Vec::new(),
            seeds: Vec::new(),
            template: Vec::new(),
            byte_pool_extra: Vec::new(),
        }
    }

    /// Build the raw intent data bytes (everything after PREFIX_LEN).
    /// This is what gets passed as instruction data to AddIntent,
    /// and what gets written into the intent account starting at PREFIX_LEN.
    pub fn build(&self) -> Vec<u8> {
        let proposer_count = self.proposers.len() as u8;
        let approver_count = self.approvers.len() as u8;
        let param_count = self.params.len() as u8;
        let account_count = self.accounts.len() as u8;
        let instruction_count = self.instructions.len() as u8;
        let data_segment_count = self.data_segments.len() as u8;
        let seed_count = self.seeds.len() as u8;

        // Build byte_pool: [template_offset:u16 | template_len:u16 | template_bytes | extra_bytes | param_names]
        let mut byte_pool = Vec::new();
        // Template header (4 bytes)
        let template_offset: u16 = 0; // template starts right after the 4-byte header
        let template_len: u16 = self.template.len() as u16;
        byte_pool.extend_from_slice(&template_offset.to_le_bytes());
        byte_pool.extend_from_slice(&template_len.to_le_bytes());
        byte_pool.extend_from_slice(&self.template);
        // Track param name offsets relative to byte_pool start
        let mut param_name_offsets: Vec<(u16, u16)> = Vec::new();
        for param in &self.params {
            let name_offset = byte_pool.len() as u16;
            byte_pool.extend_from_slice(&param.name);
            param_name_offsets.push((name_offset, param.name.len() as u16));
        }
        byte_pool.extend_from_slice(&self.byte_pool_extra);

        let byte_pool_len = byte_pool.len() as u16;

        // Build the IntentHeader (88 bytes)
        let mut data = Vec::new();

        // wallet: [u8; 32]
        data.extend_from_slice(&self.wallet);
        // target_program: [u8; 32]
        data.extend_from_slice(&self.target_program);
        // timelock_seconds: u32
        data.extend_from_slice(&self.timelock_seconds.to_le_bytes());
        // active_proposal_count: u16
        data.extend_from_slice(&0u16.to_le_bytes());
        // byte_pool_len: u16
        data.extend_from_slice(&byte_pool_len.to_le_bytes());
        // bump: u8
        data.push(0);
        // intent_index: u8
        data.push(0);
        // intent_type: u8
        data.push(self.intent_type);
        // approved: u8
        data.push(1);
        // approval_threshold: u8
        data.push(self.approval_threshold);
        // cancellation_threshold: u8
        data.push(self.cancellation_threshold);
        // proposer_count: u8
        data.push(proposer_count);
        // approver_count: u8
        data.push(approver_count);
        // param_count: u8
        data.push(param_count);
        // account_count: u8
        data.push(account_count);
        // instruction_count: u8
        data.push(instruction_count);
        // data_segment_count: u8
        data.push(data_segment_count);
        // seed_count: u8
        data.push(seed_count);
        // _reserved: [u8; 3]
        data.extend_from_slice(&[0u8; 3]);

        assert_eq!(data.len(), 88, "IntentHeader must be 88 bytes");

        // Proposers (N * 32 bytes)
        for p in &self.proposers {
            data.extend_from_slice(p);
        }

        // Approvers (N * 32 bytes)
        for a in &self.approvers {
            data.extend_from_slice(a);
        }

        // ParamEntries (N * 16 bytes each)
        for (i, param) in self.params.iter().enumerate() {
            let (name_off, name_len) = param_name_offsets[i];
            // constraint_value: u64
            data.extend_from_slice(&param.constraint_value.to_le_bytes());
            // name_offset: u16
            data.extend_from_slice(&name_off.to_le_bytes());
            // name_len: u16
            data.extend_from_slice(&name_len.to_le_bytes());
            // param_type: u8
            data.push(param.param_type);
            // constraint_type: u8
            data.push(param.constraint_type);
            // display_decimals: u8
            data.push(param.display_decimals);
            // decimals_param: u8
            data.push(param.decimals_param);
        }

        // AccountEntries (N * 8 bytes each)
        for acc in &self.accounts {
            data.push(acc.source);
            data.push(acc.writable);
            data.push(acc.is_signer);
            data.push(0); // _pad
            data.extend_from_slice(&acc.source_data);
        }

        // InstructionEntries (N * 8 bytes each)
        for ix in &self.instructions {
            data.push(ix.program_account_index);
            data.push(ix.account_start_index);
            data.push(ix.account_count);
            data.push(ix.data_segment_start_index);
            data.push(ix.data_segment_count);
            data.extend_from_slice(&[0u8; 3]); // _pad
        }

        // DataSegmentEntries (N * 6 bytes each)
        for seg in &self.data_segments {
            data.push(seg.segment_type);
            data.push(0); // _pad
            data.extend_from_slice(&seg.segment_data);
        }

        // SeedEntries (N * 6 bytes each)
        for seed in &self.seeds {
            data.push(seed.seed_type);
            data.push(0); // _pad
            data.extend_from_slice(&seed.seed_data);
        }

        // Byte pool
        data.extend_from_slice(&byte_pool);

        data
    }

    /// Calculate the total account size for this intent
    pub fn total_account_size(&self) -> usize {
        let byte_pool_len = 4 + self.template.len()
            + self.params.iter().map(|p| p.name.len()).sum::<usize>()
            + self.byte_pool_extra.len();

        INTENT_HEADER_LEN
            + (self.proposers.len() * 32)
            + (self.approvers.len() * 32)
            + (self.params.len() * PARAM_ENTRY_SIZE)
            + (self.accounts.len() * ACCOUNT_ENTRY_SIZE)
            + (self.instructions.len() * INSTRUCTION_ENTRY_SIZE)
            + (self.data_segments.len() * DATA_SEGMENT_ENTRY_SIZE)
            + (self.seeds.len() * SEED_ENTRY_SIZE)
            + byte_pool_len
    }
}

/// Build a simple custom intent for testing: "transfer {0} SOL to {1}"
/// with a u64 amount param and an address destination param.
pub fn build_test_transfer_intent(
    proposers: &[[u8; 32]],
    approvers: &[[u8; 32]],
    target_program: &[u8; 32],
) -> IntentDataBuilder {
    let mut builder = IntentDataBuilder::new();
    builder.target_program = *target_program;
    builder.intent_type = INTENT_TYPE_CUSTOM;
    builder.approval_threshold = 1;
    builder.cancellation_threshold = 1;
    builder.timelock_seconds = 0;
    builder.template = b"transfer {0} SOL to {1}".to_vec();

    for p in proposers {
        builder.proposers.push(*p);
    }
    for a in approvers {
        builder.approvers.push(*a);
    }

    // Param 0: amount (u64)
    builder.params.push(ParamDef {
        param_type: PARAM_TYPE_U64,
        constraint_type: 0,
        constraint_value: 0,
        display_decimals: 0,
        decimals_param: 0,
        name: b"amount".to_vec(),
    });

    // Param 1: destination (address)
    builder.params.push(ParamDef {
        param_type: PARAM_TYPE_ADDRESS,
        constraint_type: 0,
        constraint_value: 0,
        display_decimals: 0,
        decimals_param: 0,
        name: b"destination".to_vec(),
    });

    // Account 0: target program (static)
    builder.accounts.push(AccountDef {
        source: SOURCE_STATIC,
        writable: 0,
        is_signer: 0,
        source_data: [0; 4],
    });

    // Account 1: vault (writable, source=vault)
    builder.accounts.push(AccountDef {
        source: SOURCE_VAULT,
        writable: 1,
        is_signer: 1,
        source_data: [0; 4],
    });

    // Account 2: destination (from param 1)
    builder.accounts.push(AccountDef {
        source: SOURCE_PARAM,
        writable: 1,
        is_signer: 0,
        source_data: {
            let mut d = [0u8; 4];
            d[0] = 1; // param index 1
            d
        },
    });

    // Instruction 0: system transfer
    builder.instructions.push(InstructionDef {
        program_account_index: 0,
        account_start_index: 1,
        account_count: 2,
        data_segment_start_index: 0,
        data_segment_count: 2,
    });

    // Data segment 0: transfer instruction discriminator (literal: [2, 0, 0, 0])
    builder.data_segments.push(DataSegmentDef {
        segment_type: SEGMENT_LITERAL,
        segment_data: {
            let mut d = [0u8; 4];
            // offset + len in byte_pool for the literal bytes
            // We'll add them as byte_pool_extra
            let offset = (4 + builder.template.len()
                + builder.params.iter().map(|p| p.name.len()).sum::<usize>()) as u16;
            d[0..2].copy_from_slice(&offset.to_le_bytes());
            d[2..4].copy_from_slice(&4u16.to_le_bytes()); // 4 bytes
            d
        },
    });

    // Data segment 1: amount from param 0
    builder.data_segments.push(DataSegmentDef {
        segment_type: SEGMENT_PARAM,
        segment_data: {
            let mut d = [0u8; 4];
            d[0] = 0; // param index
            d
        },
    });

    // The system program transfer instruction discriminator
    builder.byte_pool_extra = vec![2, 0, 0, 0]; // SystemProgram::Transfer = 2

    builder
}
