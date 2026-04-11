use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::error::ProgramError;
use pinocchio::ProgramResult;

use crate::state::accounts::*;
use crate::state::byte_pool::find_in_approvers;
use crate::state::errors::*;

pub struct DeactivateIntent;

impl DeactivateIntent {
    pub fn process(data: &[u8], accounts: &mut [AccountView], _program_id: &Address) -> ProgramResult {
        if accounts.len() < 3 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        require_len!(data, 1);
        if !accounts[2].is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }
        require_owner!(accounts[0], _program_id); // wallet
        require_owner!(accounts[1], _program_id); // intent

        let wallet_addr = accounts[0].address().to_bytes();

        // Verify signer is an approver of this intent
        {
            let idata = accounts[1].try_borrow()?;
            let intent = IntentHeader::from_bytes(&idata)?;
            if intent.wallet != wallet_addr {
                return Err(ProgramError::InvalidAccountData);
            }
            let signer_key = accounts[2].address().to_bytes();
            find_in_approvers(&idata, intent, &signer_key)?;
        }

        let mut idata = accounts[1].try_borrow_mut()?;
        let intent = IntentHeader::from_bytes_mut(&mut idata)?;

        if intent.active_proposal_count > 0 {
            return Err(ProgramError::Custom(ERR_ACTIVE_PROPOSALS_EXIST));
        }

        intent.approved = 0;

        Ok(())
    }
}
