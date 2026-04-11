use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::error::ProgramError;
use pinocchio::ProgramResult;

use crate::state::accounts::*;
use crate::state::constants::*;

pub struct Cleanup;

impl Cleanup {
    /// Accounts: [proposal, intent, rent_refund]
    pub fn process(accounts: &mut [AccountView], _program_id: &Address) -> ProgramResult {
        if accounts.len() < 3 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        require_owner!(accounts[0], _program_id); // proposal
        require_owner!(accounts[1], _program_id); // intent

        let status;
        let rent_refund_addr;
        {
            let pdata = accounts[0].try_borrow()?;
            let proposal = Proposal::from_bytes(&pdata)?;
            status = proposal.status;
            rent_refund_addr = proposal.rent_refund;

            if status != STATUS_EXECUTED && status != STATUS_CANCELLED {
                return Err(ProgramError::InvalidAccountData);
            }
            if proposal.intent != accounts[1].address().to_bytes() {
                return Err(ProgramError::InvalidAccountData);
            }
            if rent_refund_addr != accounts[2].address().to_bytes() {
                return Err(ProgramError::InvalidAccountData);
            }
        }

        // Decrement active_proposal_count if cancelled (executed already decremented)
        if status == STATUS_CANCELLED {
            let mut idata = accounts[1].try_borrow_mut()?;
            let intent = IntentHeader::from_bytes_mut(&mut idata)?;
            intent.active_proposal_count = intent.active_proposal_count.saturating_sub(1);
        }

        // Transfer lamports from proposal to rent_refund, then close
        let proposal_lamports = accounts[0].lamports();
        accounts[0].set_lamports(0);
        accounts[2].set_lamports(accounts[2].lamports() + proposal_lamports);
        accounts[0].close()?;

        Ok(())
    }
}
