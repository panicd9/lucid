use pinocchio::error::ProgramError;

use crate::state::accounts::*;

/// Read a proposer pubkey (32 bytes) at given index from intent data
pub fn read_proposer<'a>(data: &'a [u8], intent: &IntentHeader, index: u8) -> Result<&'a [u8; 32], ProgramError> {
    if index >= intent.proposer_count {
        return Err(ProgramError::InvalidInstructionData);
    }
    let offset = intent.proposers_offset() + (index as usize * 32);
    if offset + 32 > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(unsafe { &*(data[offset..].as_ptr() as *const [u8; 32]) })
}

/// Read an approver pubkey (32 bytes) at given index from intent data
pub fn read_approver<'a>(data: &'a [u8], intent: &IntentHeader, index: u8) -> Result<&'a [u8; 32], ProgramError> {
    if index >= intent.approver_count {
        return Err(ProgramError::InvalidInstructionData);
    }
    let offset = intent.approvers_offset() + (index as usize * 32);
    if offset + 32 > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(unsafe { &*(data[offset..].as_ptr() as *const [u8; 32]) })
}

/// Read a ParamEntry at given index
pub fn read_param_entry<'a>(data: &'a [u8], intent: &IntentHeader, index: u8) -> Result<&'a ParamEntry, ProgramError> {
    if index >= intent.param_count {
        return Err(ProgramError::InvalidInstructionData);
    }
    let offset = intent.params_offset() + (index as usize * ParamEntry::SIZE);
    if offset + ParamEntry::SIZE > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(unsafe { &*(data[offset..].as_ptr() as *const ParamEntry) })
}

/// Read an AccountEntry at given index
pub fn read_account_entry<'a>(data: &'a [u8], intent: &IntentHeader, index: u8) -> Result<&'a AccountEntry, ProgramError> {
    if index >= intent.account_count {
        return Err(ProgramError::InvalidInstructionData);
    }
    let offset = intent.accounts_offset() + (index as usize * AccountEntry::SIZE);
    if offset + AccountEntry::SIZE > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(unsafe { &*(data[offset..].as_ptr() as *const AccountEntry) })
}

/// Read an InstructionEntry at given index
pub fn read_instruction_entry<'a>(data: &'a [u8], intent: &IntentHeader, index: u8) -> Result<&'a InstructionEntry, ProgramError> {
    if index >= intent.instruction_count {
        return Err(ProgramError::InvalidInstructionData);
    }
    let offset = intent.instructions_offset() + (index as usize * InstructionEntry::SIZE);
    if offset + InstructionEntry::SIZE > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(unsafe { &*(data[offset..].as_ptr() as *const InstructionEntry) })
}

/// Read a DataSegmentEntry at given index
pub fn read_data_segment<'a>(data: &'a [u8], intent: &IntentHeader, index: u8) -> Result<&'a DataSegmentEntry, ProgramError> {
    if index >= intent.data_segment_count {
        return Err(ProgramError::InvalidInstructionData);
    }
    let offset = intent.data_segments_offset() + (index as usize * DataSegmentEntry::SIZE);
    if offset + DataSegmentEntry::SIZE > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(unsafe { &*(data[offset..].as_ptr() as *const DataSegmentEntry) })
}

/// Read a SeedEntry at given index
pub fn read_seed_entry<'a>(data: &'a [u8], intent: &IntentHeader, index: u8) -> Result<&'a SeedEntry, ProgramError> {
    if index >= intent.seed_count {
        return Err(ProgramError::InvalidInstructionData);
    }
    let offset = intent.seeds_offset() + (index as usize * SeedEntry::SIZE);
    if offset + SeedEntry::SIZE > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(unsafe { &*(data[offset..].as_ptr() as *const SeedEntry) })
}

/// Read raw bytes from the byte_pool at a given offset and length
pub fn read_bytes_from_byte_pool<'a>(
    data: &'a [u8],
    intent: &IntentHeader,
    pool_offset: u16,
    len: u16,
) -> Result<&'a [u8], ProgramError> {
    let abs_offset = intent.byte_pool_offset() + pool_offset as usize;
    let end = abs_offset + len as usize;
    if end > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(&data[abs_offset..end])
}

/// Read a 32-byte pubkey from byte_pool
pub fn read_pubkey_from_byte_pool(
    data: &[u8],
    intent: &IntentHeader,
    pool_offset: u16,
) -> Result<[u8; 32], ProgramError> {
    let bytes = read_bytes_from_byte_pool(data, intent, pool_offset, 32)?;
    let mut key = [0u8; 32];
    key.copy_from_slice(bytes);
    Ok(key)
}

/// Read the template string from the byte_pool.
/// Convention: first 4 bytes of byte_pool = template_offset:u16 + template_len:u16
pub fn read_template<'a>(data: &'a [u8], intent: &IntentHeader) -> Result<&'a [u8], ProgramError> {
    let bp_offset = intent.byte_pool_offset();
    if intent.byte_pool_len < 4 {
        return Err(ProgramError::InvalidAccountData);
    }
    let tmpl_offset = u16::from_le_bytes([data[bp_offset], data[bp_offset + 1]]);
    let tmpl_len = u16::from_le_bytes([data[bp_offset + 2], data[bp_offset + 3]]);
    let abs_start = bp_offset + 4 + tmpl_offset as usize;
    let abs_end = abs_start + tmpl_len as usize;
    if abs_end > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(&data[abs_start..abs_end])
}

/// Read params_data from a proposal account's raw data
pub fn read_params_data<'a>(data: &'a [u8], proposal: &Proposal) -> Result<&'a [u8], ProgramError> {
    let start = Proposal::HEADER_LEN;
    let end = start + proposal.params_data_len as usize;
    if end > data.len() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(&data[start..end])
}

/// Get the byte size of a parameter type
pub fn param_type_size(param_type: u8) -> usize {
    use crate::state::constants::*;
    match param_type {
        PARAM_TYPE_ADDRESS => 32,
        PARAM_TYPE_U64 => 8,
        PARAM_TYPE_I64 => 8,
        PARAM_TYPE_STRING => 0, // variable
        PARAM_TYPE_BOOL => 1,
        PARAM_TYPE_U8 => 1,
        PARAM_TYPE_U16 => 2,
        PARAM_TYPE_U32 => 4,
        PARAM_TYPE_U128 => 16,
        _ => 0,
    }
}

/// Read param bytes from params_data for a given param index
pub fn read_param_bytes<'a>(
    intent_data: &[u8],
    intent: &IntentHeader,
    params_data: &'a [u8],
    param_index: u8,
) -> Result<&'a [u8], ProgramError> {
    let mut offset = 0usize;
    for i in 0..param_index {
        let entry = read_param_entry(intent_data, intent, i)?;
        let size = param_type_size(entry.param_type);
        if size == 0 {
            if offset + 2 > params_data.len() {
                return Err(ProgramError::InvalidInstructionData);
            }
            let slen = u16::from_le_bytes([params_data[offset], params_data[offset + 1]]) as usize;
            offset += 2 + slen;
        } else {
            offset += size;
        }
    }

    let entry = read_param_entry(intent_data, intent, param_index)?;
    let size = param_type_size(entry.param_type);
    if size == 0 {
        if offset + 2 > params_data.len() {
            return Err(ProgramError::InvalidInstructionData);
        }
        let slen = u16::from_le_bytes([params_data[offset], params_data[offset + 1]]) as usize;
        if offset + 2 + slen > params_data.len() {
            return Err(ProgramError::InvalidInstructionData);
        }
        Ok(&params_data[offset..offset + 2 + slen])
    } else {
        if offset + size > params_data.len() {
            return Err(ProgramError::InvalidInstructionData);
        }
        Ok(&params_data[offset..offset + size])
    }
}

/// Read a param value as a 32-byte address
pub fn read_param_as_address(
    intent_data: &[u8],
    intent: &IntentHeader,
    params_data: &[u8],
    param_index: u8,
) -> Result<[u8; 32], ProgramError> {
    let bytes = read_param_bytes(intent_data, intent, params_data, param_index)?;
    if bytes.len() != 32 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut addr = [0u8; 32];
    addr.copy_from_slice(bytes);
    Ok(addr)
}

/// Find a pubkey in the proposer list, return index
pub fn find_in_proposers(
    data: &[u8],
    intent: &IntentHeader,
    pubkey: &[u8; 32],
) -> Result<u8, ProgramError> {
    for i in 0..intent.proposer_count {
        let p = read_proposer(data, intent, i)?;
        if p == pubkey {
            return Ok(i);
        }
    }
    Err(ProgramError::Custom(crate::state::errors::ERR_SIGNER_NOT_FOUND))
}

/// Find a pubkey in the approver list, return index
pub fn find_in_approvers(
    data: &[u8],
    intent: &IntentHeader,
    pubkey: &[u8; 32],
) -> Result<u8, ProgramError> {
    for i in 0..intent.approver_count {
        let a = read_approver(data, intent, i)?;
        if a == pubkey {
            return Ok(i);
        }
    }
    Err(ProgramError::Custom(crate::state::errors::ERR_SIGNER_NOT_FOUND))
}
