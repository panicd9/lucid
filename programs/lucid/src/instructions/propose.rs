use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::cpi::{Seed, Signer};
use pinocchio::error::ProgramError;
use pinocchio::ProgramResult;
use pinocchio::sysvars::Sysvar;
use pinocchio::sysvars::{clock::Clock, rent::Rent};

use crate::state::accounts::*;
use crate::state::constants::*;
use crate::state::ed25519::extract_and_verify_ed25519_for_propose;
use crate::state::errors::*;
use crate::state::param_validation::validate_param_constraints;

pub struct Propose;

impl Propose {
    /// Accounts: [wallet, intent, proposal, instructions_sysvar, payer, system_program]
    pub fn process(data: &[u8], accounts: &mut [AccountView], program_id: &Address) -> ProgramResult {
        if accounts.len() < 6 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        if !accounts[4].is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }
        require_owner!(accounts[0], program_id); // wallet
        require_owner!(accounts[1], program_id); // intent
        // accounts[2] = proposal (being created)
        // accounts[3] = instructions sysvar, accounts[4] = payer, accounts[5] = system
        require_len!(data, 8);
        let proposal_index = u64::from_le_bytes(
            data[..8].try_into().map_err(|_| ProgramError::InvalidInstructionData)?
        );
        let params_data = &data[8..];

        let clock = Clock::get()?;
        let rent = Rent::get()?;

        let wallet_address = accounts[0].address().to_bytes();
        let intent_address = accounts[1].address().to_bytes();
        let payer_address = accounts[4].address().to_bytes();

        // Read wallet and intent
        let current_proposal_index;
        let wallet_name_buf: [u8; 32];
        let wallet_name_len: u8;
        {
            let wdata = accounts[0].try_borrow()?;
            let wallet = Wallet::from_bytes(&wdata)?;
            if proposal_index != wallet.proposal_index {
                return Err(ProgramError::Custom(ERR_PROPOSAL_INDEX_MISMATCH));
            }
            current_proposal_index = wallet.proposal_index;
            wallet_name_buf = wallet.name;
            wallet_name_len = wallet.name_len;

            let idata = accounts[1].try_borrow()?;
            let intent = IntentHeader::from_bytes(&idata)?;
            if intent.approved == 0 {
                return Err(ProgramError::Custom(ERR_INTENT_DEACTIVATED));
            }
            if wallet.frozen == 1 && intent.intent_type == INTENT_TYPE_ADD {
                return Err(ProgramError::Custom(ERR_WALLET_FROZEN));
            }
            if intent.wallet != wallet_address {
                return Err(ProgramError::InvalidAccountData);
            }

            // Validate param constraints
            validate_param_constraints(intent, &idata, params_data)?;
        }

        // Extract proposer from Ed25519 precompile
        let wallet_name = &wallet_name_buf[..wallet_name_len as usize];
        let proposer_pubkey;
        {
            let idata = accounts[1].try_borrow()?;
            let intent = IntentHeader::from_bytes(&idata)?;
            let (pk, _idx) = extract_and_verify_ed25519_for_propose(
                &accounts[3],
                &idata,
                intent,
                wallet_name,
                current_proposal_index,
                params_data,
            )?;
            proposer_pubkey = pk;
        }

        // Create proposal PDA
        let proposal_idx_bytes = current_proposal_index.to_le_bytes();
        let proposal_seeds: &[&[u8]] = &[PROPOSAL_SEED, &intent_address, &proposal_idx_bytes];
        let (proposal_pda, proposal_bump) = Address::find_program_address(proposal_seeds, program_id);
        if accounts[2].address() != &proposal_pda {
            return Err(ProgramError::InvalidSeeds);
        }

        let proposal_size = Proposal::HEADER_LEN + params_data.len();
        let proposal_lamports = rent.try_minimum_balance(proposal_size)?;

        let proposal_bump_bytes = [proposal_bump];
        let proposal_signer_seeds = [
            Seed::from(PROPOSAL_SEED),
            Seed::from(intent_address.as_slice()),
            Seed::from(proposal_idx_bytes.as_slice()),
            Seed::from(proposal_bump_bytes.as_slice()),
        ];
        let proposal_signer = [Signer::from(proposal_signer_seeds.as_slice())];

        pinocchio_system::instructions::CreateAccount {
            from: &accounts[4],
            to: &accounts[2],
            lamports: proposal_lamports,
            space: proposal_size as u64,
            owner: program_id,
        }
        .invoke_signed(&proposal_signer)?;

        // Initialize proposal
        {
            let mut pdata = accounts[2].try_borrow_mut()?;
            pdata[0] = Proposal::DISCRIMINATOR;
            pdata[1] = ACCOUNT_VERSION;
            let proposal = Proposal::from_bytes_mut(&mut pdata)?;

            proposal.wallet = wallet_address;
            proposal.intent = intent_address;
            proposal.proposal_index = current_proposal_index;
            proposal.proposer = proposer_pubkey;
            proposal.approval_bitmap = 0;
            proposal.cancellation_bitmap = 0;
            proposal.status = STATUS_ACTIVE;
            proposal.bump = proposal_bump;
            proposal._pad = [0; 2];
            proposal.proposed_at = clock.unix_timestamp;
            proposal.approved_at = 0;
            proposal.rent_refund = payer_address;
            proposal.params_data_len = params_data.len() as u16;
            proposal._reserved = [0; 6];

            // Write params_data directly (can't call write_params_data due to borrow overlap)
            let params_start = Proposal::HEADER_LEN;
            let params_end = params_start + params_data.len();
            if params_end > pdata.len() {
                return Err(ProgramError::InvalidAccountData);
            }
            pdata[params_start..params_end].copy_from_slice(params_data);
        }

        // Increment wallet proposal_index and intent active_proposal_count
        {
            let mut wdata = accounts[0].try_borrow_mut()?;
            let wallet = Wallet::from_bytes_mut(&mut wdata)?;
            wallet.proposal_index = wallet.proposal_index.checked_add(1)
                .ok_or(ProgramError::Custom(ERR_ARITHMETIC_OVERFLOW))?;
        }
        {
            let mut idata = accounts[1].try_borrow_mut()?;
            let intent = IntentHeader::from_bytes_mut(&mut idata)?;
            intent.active_proposal_count = intent.active_proposal_count.checked_add(1)
                .ok_or(ProgramError::Custom(ERR_ARITHMETIC_OVERFLOW))?;
        }

        Ok(())
    }
}
