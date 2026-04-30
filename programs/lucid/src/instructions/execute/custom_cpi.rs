use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::cpi::{Seed, Signer};
use pinocchio::error::ProgramError;
use pinocchio::instruction::{InstructionAccount, InstructionView};

use crate::state::accounts::*;
use crate::state::byte_pool::*;
use crate::state::constants::*;
use crate::state::errors::*;

use super::resolve::resolve_address;

pub(super) fn execute_custom_cpi(
    accounts: &mut [AccountView],
    params_data: &[u8],
    vault_bump: u8,
    wallet_address: &[u8; 32],
    _program_id: &Address,
) -> Result<(), ProgramError> {
    let vault_address = accounts[1].address().to_bytes();

    // Buffer all CPI data from the intent while holding the borrow,
    // then drop before invoking CPI.
    let prog_addr;
    let mut acct_addrs = [[0u8; 32]; MAX_CPI_ACCOUNTS];
    let mut acct_writable = [false; MAX_CPI_ACCOUNTS];
    let mut acct_signer = [false; MAX_CPI_ACCOUNTS];
    let acct_count;
    let mut ix_data_buf = [0u8; MAX_CPI_DATA_LEN];
    let mut ix_data_len = 0usize;

    {
        let idata = accounts[2].try_borrow()?;
        let intent = IntentHeader::from_bytes(&idata)?;

        // Only single-instruction intents are supported for CPI execution
        if intent.instruction_count != 1 {
            return Err(ProgramError::InvalidInstructionData);
        }

        let ix_entry = read_instruction_entry(&idata, intent, 0)?;

        // Resolve program ID and verify it matches the declared target_program
        let prog_entry = read_account_entry(&idata, intent, ix_entry.program_account_index)?;
        prog_addr = resolve_address(&idata, intent, prog_entry, params_data, &accounts[6..], &vault_address)?;
        if intent.target_program != prog_addr {
            return Err(ProgramError::Custom(ERR_PROGRAM_MISMATCH));
        }

        // Build account list
        acct_count = ix_entry.account_count as usize;
        if acct_count > MAX_CPI_ACCOUNTS {
            return Err(ProgramError::InvalidInstructionData);
        }

        for a in 0..acct_count {
            let entry = read_account_entry(&idata, intent, ix_entry.account_start_index + a as u8)?;
            acct_addrs[a] = resolve_address(&idata, intent, entry, params_data, &accounts[6..], &vault_address)?;
            acct_writable[a] = entry.writable == 1;
            acct_signer[a] = entry.is_signer == 1;
        }

        // Build instruction data
        for d in 0..ix_entry.data_segment_count {
            let seg = read_data_segment(&idata, intent, ix_entry.data_segment_start_index + d)?;
            match seg.segment_type {
                SEGMENT_LITERAL => {
                    let off = u16::from_le_bytes([seg.segment_data[0], seg.segment_data[1]]);
                    let len = u16::from_le_bytes([seg.segment_data[2], seg.segment_data[3]]);
                    let bytes = read_bytes_from_byte_pool(&idata, intent, off, len)?;
                    if ix_data_len + bytes.len() > MAX_CPI_DATA_LEN {
                        return Err(ProgramError::InvalidInstructionData);
                    }
                    ix_data_buf[ix_data_len..ix_data_len + bytes.len()].copy_from_slice(bytes);
                    ix_data_len += bytes.len();
                }
                SEGMENT_PARAM => {
                    let param_idx = seg.segment_data[0];
                    let bytes = read_param_bytes(&idata, intent, params_data, param_idx)?;
                    if ix_data_len + bytes.len() > MAX_CPI_DATA_LEN {
                        return Err(ProgramError::InvalidInstructionData);
                    }
                    ix_data_buf[ix_data_len..ix_data_len + bytes.len()].copy_from_slice(bytes);
                    ix_data_len += bytes.len();
                }
                _ => return Err(ProgramError::InvalidInstructionData),
            }
        }
    } // idata borrow dropped here

    // Build and invoke CPI with vault PDA as signer
    let prog_address = Address::new_from_array(prog_addr);
    let mut ia_addrs = [Address::default(); MAX_CPI_ACCOUNTS];
    for a in 0..acct_count {
        ia_addrs[a] = Address::new_from_array(acct_addrs[a]);
    }

    let ia_buf: [InstructionAccount; MAX_CPI_ACCOUNTS] = core::array::from_fn(|i| {
        if i < acct_count {
            InstructionAccount::new(&ia_addrs[i], acct_writable[i], acct_signer[i])
        } else {
            InstructionAccount::readonly(&ia_addrs[0])
        }
    });

    let ix = InstructionView {
        program_id: &prog_address,
        accounts: &ia_buf[..acct_count],
        data: &ix_data_buf[..ix_data_len],
    };

    let wallet_addr = Address::new_from_array(*wallet_address);
    let bump_byte = [vault_bump];
    let seeds = [
        Seed::from(VAULT_SEED),
        Seed::from(wallet_addr.as_array().as_slice()),
        Seed::from(bump_byte.as_slice()),
    ];
    let signer = [Signer::from(seeds.as_slice())];

    pinocchio::cpi::invoke_signed_with_slice(&ix, &accounts[6..], &signer)?;

    Ok(())
}
