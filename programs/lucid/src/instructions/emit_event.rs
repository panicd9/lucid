use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::error::ProgramError;
use pinocchio::ProgramResult;

use crate::state::constants::*;

pub struct EmitEvent;

impl EmitEvent {
    pub fn process(data: &[u8], accounts: &mut [AccountView], program_id: &Address) -> ProgramResult {
        // The bump byte is appended at the end of the data by execute.rs
        if data.is_empty() {
            return Err(ProgramError::InvalidInstructionData);
        }
        let bump = data[data.len() - 1];

        let expected_pda = Address::create_program_address(
            &[EVENT_AUTHORITY_SEED, &[bump]],
            program_id,
        ).map_err(|_| ProgramError::InvalidSeeds)?;

        let has_authority = accounts.iter().any(|a| {
            a.address() == &expected_pda && a.is_signer()
        });

        if !has_authority {
            return Err(ProgramError::MissingRequiredSignature);
        }

        Ok(())
    }
}
