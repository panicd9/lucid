use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::cpi::{Seed, Signer};
use pinocchio::error::ProgramError;
use pinocchio::ProgramResult;
use crate::state::accounts::{self, *};
use crate::state::byte_pool::find_in_approvers;
use crate::state::constants::*;
use crate::state::errors::*;

pub struct AddIntent;

impl AddIntent {
    /// Accounts: [wallet, intent (PDA being created), signer/payer, system_program, add_meta_intent]
    ///
    /// `add_meta_intent` is intent index 0 (the ADD meta-intent created at
    /// CreateWallet time). Its approver list is the wallet's authority set, so
    /// requiring the signer to be in it gates AddIntent on wallet-approver
    /// status — without this, any signer racing the wallet creator between
    /// CreateWallet and the first proposal could inject a backdoor intent.
    pub fn process(intent_data_raw: &[u8], accounts: &mut [AccountView], program_id: &Address) -> ProgramResult {
        if accounts.len() < 5 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        if !accounts[2].is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }
        require_owner!(accounts[0], program_id); // wallet
        require_owner!(accounts[4], program_id); // add_meta_intent

        let wallet_address_for_meta = accounts[0].address().to_bytes();
        // Verify accounts[4] is the wallet's ADD meta-intent (index 0) and the
        // signer is in its approver list. The PDA derivation pins it to this
        // wallet specifically.
        {
            let zero = [0u8];
            let meta_seeds: &[&[u8]] = &[INTENT_SEED, &wallet_address_for_meta, &zero];
            let (expected_meta_pda, _) = Address::find_program_address(meta_seeds, program_id);
            if accounts[4].address() != &expected_meta_pda {
                return Err(ProgramError::InvalidSeeds);
            }
            let mdata = accounts[4].try_borrow()?;
            let meta = IntentHeader::from_bytes(&mdata)?;
            if meta.wallet != wallet_address_for_meta {
                return Err(ProgramError::InvalidAccountData);
            }
            let signer_key = accounts[2].address().to_bytes();
            find_in_approvers(&mdata, meta, &signer_key)?;
        }

        let wallet_address = accounts[0].address().to_bytes();
        let intent_count;

        {
            let mut wdata = accounts[0].try_borrow_mut()?;
            let wallet = Wallet::from_bytes_mut(&mut wdata)?;
            if wallet.frozen == 1 {
                return Err(ProgramError::Custom(ERR_WALLET_FROZEN));
            }
            // Only allow direct AddIntent during initial setup (before any proposals)
            if wallet.proposal_index > 0 {
                return Err(ProgramError::Custom(ERR_SETUP_PHASE_ONLY));
            }
            intent_count = wallet.intent_count;
            wallet.intent_count = wallet.intent_count.checked_add(1)
                .ok_or(ProgramError::Custom(ERR_ARITHMETIC_OVERFLOW))?;
        }

        let index_bytes = [intent_count];
        let intent_seeds: &[&[u8]] = &[INTENT_SEED, &wallet_address, &index_bytes];
        let (intent_pda, intent_bump) = Address::find_program_address(intent_seeds, program_id);
        if accounts[1].address() != &intent_pda {
            return Err(ProgramError::InvalidSeeds);
        }

        let total_size = PREFIX_LEN + intent_data_raw.len();
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
            from: &accounts[2],
            to: &accounts[1],
            lamports: intent_lamports,
            space: total_size as u64,
            owner: program_id,
        }
        .invoke_signed(&intent_signer)?;

        {
            let mut idata = accounts[1].try_borrow_mut()?;
            idata[0] = IntentHeader::DISCRIMINATOR;
            idata[1] = ACCOUNT_VERSION;
            idata[PREFIX_LEN..PREFIX_LEN + intent_data_raw.len()].copy_from_slice(intent_data_raw);

            let idata_len = idata.len();
            let intent = IntentHeader::from_bytes_mut(&mut idata)?;
            intent.wallet = wallet_address;
            intent.bump = intent_bump;
            intent.intent_index = intent_count;
            intent.approved = 1;
            intent.active_proposal_count = 0;

            accounts::validate_intent_header(intent, idata_len)?;
        }

        Ok(())
    }
}
