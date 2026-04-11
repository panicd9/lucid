use pinocchio::error::ProgramError;

use crate::state::accounts::*;
use crate::state::byte_pool::*;
use crate::state::constants::*;
use crate::state::errors::*;

/// Validate parameter constraints defined in the intent against the proposal's params_data.
pub fn validate_param_constraints(
    intent: &IntentHeader,
    intent_data: &[u8],
    params_data: &[u8],
) -> Result<(), ProgramError> {
    for i in 0..intent.param_count {
        let entry = read_param_entry(intent_data, intent, i)?;
        if entry.constraint_type == CONSTRAINT_NONE {
            continue;
        }

        let bytes = read_param_bytes(intent_data, intent, params_data, i)?;

        match entry.constraint_type {
            CONSTRAINT_LESS_THAN_U64 => {
                let val = read_u64_from_param(bytes, entry.param_type)?;
                if val >= entry.constraint_value {
                    return Err(ProgramError::Custom(ERR_PARAM_CONSTRAINT_VIOLATED));
                }
            }
            CONSTRAINT_GREATER_THAN_U64 => {
                let val = read_u64_from_param(bytes, entry.param_type)?;
                if val <= entry.constraint_value {
                    return Err(ProgramError::Custom(ERR_PARAM_CONSTRAINT_VIOLATED));
                }
            }
            _ => return Err(ProgramError::InvalidInstructionData),
        }
    }

    Ok(())
}

/// Read a numeric value as u64 from param bytes based on type
fn read_u64_from_param(bytes: &[u8], param_type: u8) -> Result<u64, ProgramError> {
    match param_type {
        PARAM_TYPE_U64 => {
            if bytes.len() < 8 {
                return Err(ProgramError::InvalidInstructionData);
            }
            Ok(u64::from_le_bytes(bytes[..8].try_into().map_err(|_| ProgramError::InvalidInstructionData)?))
        }
        PARAM_TYPE_U8 => Ok(bytes[0] as u64),
        PARAM_TYPE_U16 => {
            if bytes.len() < 2 {
                return Err(ProgramError::InvalidInstructionData);
            }
            Ok(u16::from_le_bytes([bytes[0], bytes[1]]) as u64)
        }
        PARAM_TYPE_U32 => {
            if bytes.len() < 4 {
                return Err(ProgramError::InvalidInstructionData);
            }
            Ok(u32::from_le_bytes(bytes[..4].try_into().map_err(|_| ProgramError::InvalidInstructionData)?) as u64)
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
