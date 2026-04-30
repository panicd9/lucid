use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::cpi::{Seed, Signer};
use pinocchio::error::ProgramError;
use pinocchio::ProgramResult;
use crate::state::accounts::{self, *};
use crate::state::byte_pool::find_in_approvers;
use crate::state::constants::*;
use crate::state::errors::*;

pub struct AddIntentsBatch;

impl AddIntentsBatch {
    /// Accounts: [wallet, signer/payer, system_program, intent_0, ..., intent_{count-1}, add_meta_intent]
    ///
    /// `add_meta_intent` (last account) is intent index 0 — the ADD meta-intent
    /// that holds the wallet's authority list. See AddIntent::process for the
    /// rationale.
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
        // remaining accounts: [intent_0..intent_{count-1}, add_meta_intent]
        if accounts.len() < 3 + count + 1 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        let meta_idx = 3 + count;
        require_owner!(accounts[meta_idx], program_id); // add_meta_intent

        // Verify accounts[meta_idx] is the wallet's ADD meta-intent (index 0) and
        // the signer is in its approver list.
        {
            let wallet_address_for_meta = accounts[0].address().to_bytes();
            let zero = [0u8];
            let meta_seeds: &[&[u8]] = &[INTENT_SEED, &wallet_address_for_meta, &zero];
            let (expected_meta_pda, _) = Address::find_program_address(meta_seeds, program_id);
            if accounts[meta_idx].address() != &expected_meta_pda {
                return Err(ProgramError::InvalidSeeds);
            }
            let mdata = accounts[meta_idx].try_borrow()?;
            let meta = IntentHeader::from_bytes(&mdata)?;
            if meta.wallet != wallet_address_for_meta {
                return Err(ProgramError::InvalidAccountData);
            }
            let signer_key = accounts[1].address().to_bytes();
            find_in_approvers(&mdata, meta, &signer_key)?;
        }

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
            let intent_lamports = rent_exempt_lamports(total_size);

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
