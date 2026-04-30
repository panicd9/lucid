use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::cpi::{Seed, Signer};
use pinocchio::error::ProgramError;

use crate::state::accounts::{validate_intent_header, IntentHeader, Wallet};
use crate::state::constants::*;
use crate::state::errors::*;

pub(super) fn execute_meta_add(
    accounts: &mut [AccountView],
    params: &[u8],
    wallet_address: &[u8; 32],
    program_id: &Address,
) -> Result<(), ProgramError> {
    if accounts.len() < 9 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    // remaining: accounts[6] = new_intent, accounts[7] = payer, accounts[8] = system_program

    let intent_count;
    {
        let mut wdata = accounts[0].try_borrow_mut()?;
        let wallet = Wallet::from_bytes_mut(&mut wdata)?;
        if wallet.frozen == 1 {
            return Err(ProgramError::Custom(ERR_WALLET_FROZEN));
        }
        intent_count = wallet.intent_count;
        wallet.intent_count = wallet.intent_count.checked_add(1)
            .ok_or(ProgramError::Custom(ERR_ARITHMETIC_OVERFLOW))?;
    }

    // params for AddIntent meta: string (u16 len + intent definition bytes)
    let intent_def = if params.len() > 2 {
        let slen = u16::from_le_bytes([params[0], params[1]]) as usize;
        &params[2..2 + slen]
    } else {
        params
    };

    let total_size = PREFIX_LEN + intent_def.len();
    let lamports = rent_exempt_lamports(total_size);

    let index_bytes = [intent_count];
    let intent_seeds: &[&[u8]] = &[INTENT_SEED, wallet_address.as_slice(), &index_bytes];
    let (intent_pda, intent_bump) = Address::find_program_address(intent_seeds, program_id);
    if accounts[6].address() != &intent_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    let bump_bytes = [intent_bump];
    let signer_seeds = [
        Seed::from(INTENT_SEED),
        Seed::from(wallet_address.as_slice()),
        Seed::from(index_bytes.as_slice()),
        Seed::from(bump_bytes.as_slice()),
    ];
    let signer = [Signer::from(signer_seeds.as_slice())];

    pinocchio_system::instructions::CreateAccount {
        from: &accounts[7],
        to: &accounts[6],
        lamports,
        space: total_size as u64,
        owner: program_id,
    }
    .invoke_signed(&signer)?;

    {
        let mut idata = accounts[6].try_borrow_mut()?;
        let idata_len = idata.len();
        idata[0] = IntentHeader::DISCRIMINATOR;
        idata[1] = ACCOUNT_VERSION;
        idata[PREFIX_LEN..PREFIX_LEN + intent_def.len()].copy_from_slice(intent_def);
        let intent = IntentHeader::from_bytes_mut(&mut idata)?;
        intent.wallet = *wallet_address;
        intent.bump = intent_bump;
        intent.intent_index = intent_count;
        intent.approved = 1;
        intent.active_proposal_count = 0;

        validate_intent_header(intent, idata_len)?;
    }

    Ok(())
}

pub(super) fn execute_meta_remove(
    accounts: &mut [AccountView],
    params: &[u8],
    wallet_address: &[u8; 32],
    program_id: &Address,
) -> Result<(), ProgramError> {
    if params.is_empty() || accounts.len() < 7 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let target_index = params[0];

    // Meta-intents (indices 0/1/2) are governance infrastructure. A signer
    // approving "remove intent #0" on a Ledger may not realize they are
    // disabling all future ADDs. Reject self-targeted meta-removal.
    if target_index < 3 {
        return Err(ProgramError::Custom(ERR_META_INTENT_PROTECTED));
    }

    // Bind accounts[6] to the executing wallet — without this any wallet's
    // approved REMOVE could deactivate intents in any other Lucid wallet at
    // the same numeric index.
    require_owner!(accounts[6], program_id);
    let index_bytes = [target_index];
    let intent_seeds: &[&[u8]] = &[INTENT_SEED, wallet_address.as_slice(), &index_bytes];
    let (expected_pda, _) = Address::find_program_address(intent_seeds, program_id);
    if accounts[6].address() != &expected_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    let mut idata = accounts[6].try_borrow_mut()?;
    let intent = IntentHeader::from_bytes_mut(&mut idata)?;
    if intent.wallet != *wallet_address {
        return Err(ProgramError::InvalidAccountData);
    }
    if intent.intent_index != target_index {
        return Err(ProgramError::InvalidAccountData);
    }
    if intent.active_proposal_count > 0 {
        return Err(ProgramError::Custom(ERR_ACTIVE_PROPOSALS_EXIST));
    }
    intent.approved = 0;
    Ok(())
}

pub(super) fn execute_meta_update(
    accounts: &mut [AccountView],
    params: &[u8],
    wallet_address: &[u8; 32],
    program_id: &Address,
) -> Result<(), ProgramError> {
    if params.len() < 4 || accounts.len() < 7 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let target_index = params[0];

    // Meta-intents (indices 0/1/2) are governance infrastructure — block
    // self-targeted UPDATE for the same reason as REMOVE.
    if target_index < 3 {
        return Err(ProgramError::Custom(ERR_META_INTENT_PROTECTED));
    }

    let def_len = u16::from_le_bytes([params[1], params[2]]) as usize;
    if params.len() < 3 + def_len {
        return Err(ProgramError::InvalidInstructionData);
    }
    let new_def = &params[3..3 + def_len];

    // Bind accounts[6] to the executing wallet — without this any wallet's
    // approved UPDATE could rewrite intents in any other Lucid wallet at
    // the same numeric index, taking over their vault.
    require_owner!(accounts[6], program_id);
    let index_bytes = [target_index];
    let intent_seeds: &[&[u8]] = &[INTENT_SEED, wallet_address.as_slice(), &index_bytes];
    let (expected_pda, _) = Address::find_program_address(intent_seeds, program_id);
    if accounts[6].address() != &expected_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    let mut idata = accounts[6].try_borrow_mut()?;
    let intent = IntentHeader::from_bytes_mut(&mut idata)?;
    if intent.wallet != *wallet_address {
        return Err(ProgramError::InvalidAccountData);
    }
    if intent.intent_index != target_index {
        return Err(ProgramError::InvalidAccountData);
    }
    if intent.active_proposal_count > 0 {
        return Err(ProgramError::Custom(ERR_ACTIVE_PROPOSALS_EXIST));
    }

    let preserved_wallet = intent.wallet;
    let preserved_bump = intent.bump;
    let preserved_index = intent.intent_index;

    let idata_len = idata.len();
    if PREFIX_LEN + new_def.len() > idata_len {
        return Err(ProgramError::InvalidAccountData);
    }
    // Zero the entire data region first to prevent stale bytes
    idata[PREFIX_LEN..idata_len].fill(0);
    idata[PREFIX_LEN..PREFIX_LEN + new_def.len()].copy_from_slice(new_def);

    let intent = IntentHeader::from_bytes_mut(&mut idata)?;
    intent.wallet = preserved_wallet;
    intent.bump = preserved_bump;
    intent.intent_index = preserved_index;
    intent.approved = 1;
    intent.active_proposal_count = 0;

    validate_intent_header(intent, idata_len)?;

    Ok(())
}
