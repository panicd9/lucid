use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::error::ProgramError;
use pinocchio::ProgramResult;

use crate::state::accounts::*;
use crate::state::byte_pool::find_in_approvers;
use crate::state::errors::*;

pub struct FreezeWallet;

impl FreezeWallet {
    /// Accounts: [wallet, meta_intent, signer]
    pub fn process(accounts: &mut [AccountView], _program_id: &Address) -> ProgramResult {
        if accounts.len() < 3 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        if !accounts[2].is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }
        require_owner!(accounts[0], _program_id); // wallet
        require_owner!(accounts[1], _program_id); // meta_intent

        let wallet_addr = accounts[0].address().to_bytes();

        // Verify meta-intent belongs to this wallet and signer is an approver
        {
            let idata = accounts[1].try_borrow()?;
            let intent = IntentHeader::from_bytes(&idata)?;
            if intent.wallet != wallet_addr {
                return Err(ProgramError::InvalidAccountData);
            }
            let signer_key = accounts[2].address().to_bytes();
            find_in_approvers(&idata, intent, &signer_key)?;
        }

        let mut wdata = accounts[0].try_borrow_mut()?;
        let wallet = Wallet::from_bytes_mut(&mut wdata)?;

        if wallet.frozen == 1 {
            return Err(ProgramError::Custom(ERR_ALREADY_FROZEN));
        }

        wallet.frozen = 1;

        Ok(())
    }
}
