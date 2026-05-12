use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::cpi::{Seed, Signer};
use pinocchio::error::ProgramError;
use pinocchio::instruction::{InstructionAccount, InstructionView};
use pinocchio::ProgramResult;
use pinocchio::sysvars::Sysvar;
use pinocchio::sysvars::clock::Clock;

use crate::state::accounts::*;
use crate::state::byte_pool::*;
use crate::state::constants::*;
use crate::state::errors::*;
use crate::state::message::render_intent_message;

mod custom_cpi;
mod meta;
mod resolve;

use custom_cpi::execute_custom_cpi;
use meta::{execute_meta_add, execute_meta_remove, execute_meta_update};

pub struct Execute;

impl Execute {
    /// Accounts: [wallet, vault, intent, proposal, event_authority, program, ...remaining]
    pub fn process(accounts: &mut [AccountView], program_id: &Address) -> ProgramResult {
        if accounts.len() < 6 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }

        require_owner!(accounts[0], program_id); // wallet
        // Vault is 0-byte and System-Program–owned by design; ownership
        // can't be used as the integrity check. Instead we re-derive the
        // vault PDA from wallet_address + cached vault_bump below.
        require_owner!(accounts[2], program_id); // intent
        require_owner!(accounts[3], program_id); // proposal

        let clock = Clock::get()?;

        let wallet_address = accounts[0].address().to_bytes();
        let intent_address = accounts[2].address().to_bytes();

        // Read state and validate
        let vault_bump: u8;
        let intent_type: u8;
        let timelock_seconds: u32;
        let proposal_index: u64;
        let approved_at: i64;
        let _params_data_len: u16;
        let wallet_name_buf: [u8; 32];
        let wallet_name_len: u8;
        let intent_index: u8;

        {
            let wdata = accounts[0].try_borrow()?;
            let wallet = Wallet::from_bytes(&wdata)?;
            wallet_name_buf = wallet.name;
            wallet_name_len = wallet.name_len;
            vault_bump = wallet.vault_bump;
        }
        // Verify accounts[1] really is the vault PDA for this wallet.
        // Without this an attacker could pass any account here; SOURCE_VAULT
        // resolution and invoke_signed would otherwise trust that address.
        {
            let vault_bump_arr = [vault_bump];
            let expected_vault = Address::create_program_address(
                &[VAULT_SEED, &wallet_address, &vault_bump_arr],
                program_id,
            ).map_err(|_| ProgramError::InvalidSeeds)?;
            if accounts[1].address() != &expected_vault {
                return Err(ProgramError::InvalidSeeds);
            }
        }
        {
            let pdata = accounts[3].try_borrow()?;
            let proposal = Proposal::from_bytes(&pdata)?;
            if proposal.status != STATUS_APPROVED {
                return Err(ProgramError::Custom(ERR_NOT_APPROVED));
            }
            if proposal.wallet != wallet_address {
                return Err(ProgramError::InvalidAccountData);
            }
            if proposal.intent != intent_address {
                return Err(ProgramError::InvalidAccountData);
            }
            proposal_index = proposal.proposal_index;
            approved_at = proposal.approved_at;
            _params_data_len = proposal.params_data_len;
        }
        {
            let idata = accounts[2].try_borrow()?;
            let intent = IntentHeader::from_bytes(&idata)?;
            if intent.wallet != wallet_address {
                return Err(ProgramError::InvalidAccountData);
            }
            intent_type = intent.intent_type;
            timelock_seconds = intent.timelock_seconds;
            intent_index = intent.intent_index;
        }

        // Timelock check
        if clock.unix_timestamp < approved_at + timelock_seconds as i64 {
            return Err(ProgramError::Custom(ERR_TIMELOCK_NOT_REACHED));
        }

        // Read params before state changes
        let mut params_buf = [0u8; MAX_PARAMS_DATA_LEN];
        let params_len;
        {
            let pdata = accounts[3].try_borrow()?;
            let proposal = Proposal::from_bytes(&pdata)?;
            let pd = read_params_data(&pdata, proposal)?;
            params_len = pd.len();
            params_buf[..params_len].copy_from_slice(pd);
        }

        // Mark executed and decrement active count BEFORE CPI to prevent reentrancy
        {
            let mut pdata = accounts[3].try_borrow_mut()?;
            let proposal = Proposal::from_bytes_mut(&mut pdata)?;
            proposal.status = STATUS_EXECUTED;
        }
        {
            let mut idata = accounts[2].try_borrow_mut()?;
            let intent = IntentHeader::from_bytes_mut(&mut idata)?;
            intent.active_proposal_count = intent.active_proposal_count.saturating_sub(1);
        }

        // Execute based on intent type
        match intent_type {
            INTENT_TYPE_CUSTOM => {
                execute_custom_cpi(
                    accounts,
                    &params_buf[..params_len],
                    vault_bump,
                    &wallet_address,
                    program_id,
                )?;
            }
            INTENT_TYPE_ADD => execute_meta_add(accounts, &params_buf[..params_len], &wallet_address, program_id)?,
            INTENT_TYPE_REMOVE => execute_meta_remove(accounts, &params_buf[..params_len], &wallet_address, program_id)?,
            INTENT_TYPE_UPDATE => execute_meta_update(accounts, &params_buf[..params_len], &wallet_address, program_id)?,
            _ => return Err(ProgramError::InvalidInstructionData),
        }

        // Emit execution receipt
        let wallet_name = &wallet_name_buf[..wallet_name_len as usize];
        emit_receipt(accounts, intent_index, proposal_index, wallet_name, program_id)?;

        Ok(())
    }
}

fn emit_receipt(
    accounts: &mut [AccountView],
    intent_index: u8,
    proposal_index: u64,
    wallet_name: &[u8],
    program_id: &Address,
) -> Result<(), ProgramError> {
    // Try to render and emit, but don't fail the whole execution if receipt emission fails
    // Just skip if data is too complex
    let rendered_msg;
    let rendered_len;
    {
        let idata = accounts[2].try_borrow()?;
        let intent = IntentHeader::from_bytes(&idata)?;
        let pdata = accounts[3].try_borrow()?;
        let proposal = Proposal::from_bytes(&pdata)?;
        let pd = read_params_data(&pdata, proposal)?;
        match render_intent_message(intent, &idata, pd, wallet_name, proposal_index) {
            Ok((buf, len)) => {
                rendered_msg = buf;
                rendered_len = len;
            }
            Err(_) => {
                // Emit receipt with empty message rather than skipping entirely
                rendered_msg = [0u8; 512];
                rendered_len = 0;
            }
        }
    }

    // Build event data
    let mut data = [0u8; 1280];
    data[0] = DISC_EMIT_EVENT;
    let mut pos = 1;
    data[pos..pos + 8].copy_from_slice(&EVENT_IX_TAG_LE);
    pos += 8;
    data[pos] = EVENT_ID_EXECUTION_RECEIPT;
    pos += 1;
    data[pos] = intent_index;
    pos += 1;
    data[pos..pos + 8].copy_from_slice(&proposal_index.to_le_bytes());
    pos += 8;
    let msg_len = rendered_len as u16;
    data[pos..pos + 2].copy_from_slice(&msg_len.to_le_bytes());
    pos += 2;
    data[pos..pos + rendered_len].copy_from_slice(&rendered_msg[..rendered_len]);
    pos += rendered_len;

    let (_, ea_bump) = Address::find_program_address(&[EVENT_AUTHORITY_SEED], program_id);
    // Append the bump byte so emit_event can use create_program_address
    data[pos] = ea_bump;
    pos += 1;
    let ea_bump_bytes = [ea_bump];
    let ea_seeds = [
        Seed::from(EVENT_AUTHORITY_SEED),
        Seed::from(ea_bump_bytes.as_slice()),
    ];
    let ea_signer = [Signer::from(ea_seeds.as_slice())];

    let ea_address = *accounts[4].address();
    let ia = [InstructionAccount::readonly_signer(&ea_address)];
    let ix = InstructionView {
        program_id,
        accounts: &ia,
        data: &data[..pos],
    };

    pinocchio::cpi::invoke_signed_with_slice(&ix, &[&accounts[4]], &ea_signer)?;

    Ok(())
}
