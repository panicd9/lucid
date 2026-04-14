use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::error::ProgramError;
use pinocchio::ProgramResult;
use pinocchio::sysvars::Sysvar;
use pinocchio::sysvars::clock::Clock;

use crate::state::accounts::*;
use crate::state::constants::*;
use crate::state::ed25519::extract_and_verify_ed25519;
use crate::state::errors::*;

pub struct Approve;

impl Approve {
    /// Accounts: [wallet, intent, proposal, instructions_sysvar]
    pub fn process(accounts: &mut [AccountView], program_id: &Address) -> ProgramResult {
        if accounts.len() < 4 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        require_owner!(accounts[0], program_id);
        require_owner!(accounts[1], program_id);
        require_owner!(accounts[2], program_id);

        let clock = Clock::get()?;

        let wallet_address = accounts[0].address().to_bytes();
        let intent_address = accounts[1].address().to_bytes();

        // Read state
        let wallet_name_buf: [u8; 32];
        let wallet_name_len: u8;
        let approval_threshold: u8;
        let approver_index: u8;

        {
            let wdata = accounts[0].try_borrow()?;
            let wallet = Wallet::from_bytes(&wdata)?;
            wallet_name_buf = wallet.name;
            wallet_name_len = wallet.name_len;
        }

        {
            let pdata = accounts[2].try_borrow()?;
            let proposal = Proposal::from_bytes(&pdata)?;
            if proposal.status != STATUS_ACTIVE {
                return Err(ProgramError::Custom(ERR_PROPOSAL_NOT_ACTIVE));
            }
            if proposal.wallet != wallet_address {
                return Err(ProgramError::InvalidAccountData);
            }
            if proposal.intent != intent_address {
                return Err(ProgramError::InvalidAccountData);
            }
        }

        {
            let idata = accounts[1].try_borrow()?;
            let intent = IntentHeader::from_bytes(&idata)?;
            if intent.wallet != wallet_address {
                return Err(ProgramError::InvalidAccountData);
            }
            if intent.approved == 0 {
                return Err(ProgramError::Custom(ERR_INTENT_DEACTIVATED));
            }
            approval_threshold = intent.approval_threshold;

            let pdata = accounts[2].try_borrow()?;
            let proposal = Proposal::from_bytes(&pdata)?;

            let wallet_name = &wallet_name_buf[..wallet_name_len as usize];
            let (_pk, idx) = extract_and_verify_ed25519(
                &accounts[3],
                &idata,
                intent,
                proposal,
                &pdata,
                wallet_name,
                b"approve",
            )?;
            approver_index = idx;
        }

        // Update proposal
        {
            let mut pdata = accounts[2].try_borrow_mut()?;
            let proposal = Proposal::from_bytes_mut(&mut pdata)?;

            if proposal.approval_bitmap & (1u16 << approver_index) != 0 {
                return Err(ProgramError::Custom(ERR_ALREADY_APPROVED));
            }

            proposal.approval_bitmap |= 1u16 << approver_index;
            proposal.cancellation_bitmap &= !(1u16 << approver_index);

            let approval_count = proposal.approval_bitmap.count_ones() as u8;
            if approval_count >= approval_threshold {
                proposal.status = STATUS_APPROVED;
                proposal.approved_at = clock.unix_timestamp;
            }
        }

        Ok(())
    }
}
