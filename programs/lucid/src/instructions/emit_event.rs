use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::error::ProgramError;
use pinocchio::ProgramResult;

use crate::state::constants::*;

pub struct EmitEvent;

impl EmitEvent {
    pub fn process(accounts: &mut [AccountView], program_id: &Address) -> ProgramResult {
        let (event_authority_pda, _) = Address::find_program_address(
            &[EVENT_AUTHORITY_SEED],
            program_id,
        );

        let has_authority = accounts.iter().any(|a| {
            a.address() == &event_authority_pda && a.is_signer()
        });

        if !has_authority {
            return Err(ProgramError::MissingRequiredSignature);
        }

        Ok(())
    }
}
