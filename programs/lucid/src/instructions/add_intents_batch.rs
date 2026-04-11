use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::cpi::{Seed, Signer};
use pinocchio::error::ProgramError;
use pinocchio::ProgramResult;
use pinocchio::sysvars::Sysvar;
use pinocchio::sysvars::rent::Rent;

use crate::state::accounts::{self, *};
use crate::state::constants::*;
use crate::state::errors::*;

pub struct AddIntentsBatch;

impl AddIntentsBatch {
    pub fn process(data: &[u8], accounts: &mut [AccountView], program_id: &Address) -> ProgramResult {
        if accounts.len() < 3 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        if !accounts[1].is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }
        require_owner!(accounts[0], program_id); // wallet

        require_len!(data, 1);
        let count = data[0] as usize;
        if count == 0 || count > MAX_BATCH_INTENTS {
            return Err(ProgramError::Custom(ERR_BATCH_TOO_LARGE));
        }
        // remaining accounts start at index 3
        if accounts.len() < 3 + count {
            return Err(ProgramError::NotEnoughAccountKeys);
        }

        let rent = Rent::get()?;
        let wallet_address = accounts[0].address().to_bytes();

        let mut wallet_intent_count;
        {
            let wdata = accounts[0].try_borrow()?;
            let wallet = Wallet::from_bytes(&wdata)?;
            if wallet.frozen == 1 {
                return Err(ProgramError::Custom(ERR_WALLET_FROZEN));
            }
            // Only allow direct AddIntentsBatch during initial setup (before any proposals)
            if wallet.proposal_index > 0 {
                return Err(ProgramError::Custom(ERR_SETUP_PHASE_ONLY));
            }
            wallet_intent_count = wallet.intent_count;
        }

        let mut data_offset = 1usize;

        for i in 0..count {
            let intent_index = wallet_intent_count;
            let acct_idx = 3 + i;

            require_len!(data, data_offset + 2);
            let intent_data_len = u16::from_le_bytes([data[data_offset], data[data_offset + 1]]) as usize;
            data_offset += 2;
            require_len!(data, data_offset + intent_data_len);
            let intent_data_raw = &data[data_offset..data_offset + intent_data_len];
            data_offset += intent_data_len;

            let index_bytes = [intent_index];
            let intent_seeds: &[&[u8]] = &[INTENT_SEED, &wallet_address, &index_bytes];
            let (intent_pda, intent_bump) = Address::find_program_address(intent_seeds, program_id);
            if accounts[acct_idx].address() != &intent_pda {
                return Err(ProgramError::InvalidSeeds);
            }

            let total_size = PREFIX_LEN + intent_data_len;
            let intent_lamports = rent.try_minimum_balance(total_size)?;

            let intent_bump_bytes = [intent_bump];
            let intent_signer_seeds = [
                Seed::from(INTENT_SEED),
                Seed::from(wallet_address.as_slice()),
                Seed::from(index_bytes.as_slice()),
                Seed::from(intent_bump_bytes.as_slice()),
            ];
            let intent_signer = [Signer::from(intent_signer_seeds.as_slice())];

            pinocchio_system::instructions::CreateAccount {
                from: &accounts[1],
                to: &accounts[acct_idx],
                lamports: intent_lamports,
                space: total_size as u64,
                owner: program_id,
            }
            .invoke_signed(&intent_signer)?;

            {
                let mut idata = accounts[acct_idx].try_borrow_mut()?;
                idata[0] = IntentHeader::DISCRIMINATOR;
                idata[1] = ACCOUNT_VERSION;
                idata[PREFIX_LEN..PREFIX_LEN + intent_data_len].copy_from_slice(intent_data_raw);

                let idata_len = idata.len();
                let intent = IntentHeader::from_bytes_mut(&mut idata)?;
                intent.wallet = wallet_address;
                intent.bump = intent_bump;
                intent.intent_index = intent_index;
                intent.approved = 1;
                intent.active_proposal_count = 0;

                accounts::validate_intent_header(intent, idata_len)?;
            }

            wallet_intent_count = wallet_intent_count.checked_add(1)
                .ok_or(ProgramError::Custom(ERR_ARITHMETIC_OVERFLOW))?;
        }

        // Update wallet intent count
        {
            let mut wdata = accounts[0].try_borrow_mut()?;
            let wallet = Wallet::from_bytes_mut(&mut wdata)?;
            wallet.intent_count = wallet_intent_count;
        }

        Ok(())
    }
}
