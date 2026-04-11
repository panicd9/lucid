#[macro_use]
pub mod utils;

pub mod state;
pub mod instructions;

#[cfg(feature = "idl")]
pub mod idl;

use pinocchio::{
    account::AccountView,
    address::Address,
    entrypoint,
    error::ProgramError,
    ProgramResult,
};

use instructions::*;
use state::constants::DISC_EMIT_EVENT;

entrypoint!(process_instruction);

fn process_instruction(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    match data.split_first() {
        // Wallet lifecycle
        Some((&0, data)) => CreateWallet::process(data, accounts, program_id),
        Some((&1, data)) => AddIntent::process(data, accounts, program_id),
        Some((&2, data)) => AddIntentsBatch::process(data, accounts, program_id),
        Some((&3, data)) => DeactivateIntent::process(data, accounts, program_id),
        Some((&4, _))    => FreezeWallet::process(accounts, program_id),
        // Proposal flow
        Some((&10, data)) => Propose::process(data, accounts, program_id),
        Some((&11, data)) => Approve::process(data, accounts, program_id),
        Some((&12, data)) => Cancel::process(data, accounts, program_id),
        // Execution
        Some((&20, _))    => Execute::process(accounts, program_id),
        // Cleanup
        Some((&30, _))    => Cleanup::process(accounts, program_id),
        // Event emission (CPI from self)
        Some((&DISC_EMIT_EVENT, _)) => EmitEvent::process(accounts, program_id),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
