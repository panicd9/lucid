use solana_address::Address;
use solana_instruction::{AccountMeta, Instruction};

use super::{pda, program_id};

fn system_program_id() -> Address {
    Address::from_str_const("11111111111111111111111111111111")
}

fn instructions_sysvar_id() -> Address {
    Address::from_str_const("Sysvar1nstructions1111111111111111111111111")
}

/// Build a CreateWallet instruction
pub fn create_wallet(
    name: &[u8],
    proposers: &[Address],
    approvers: &[Address],
    approval_threshold: u8,
    cancellation_threshold: u8,
    timelock_seconds: u32,
    payer: &Address,
) -> Instruction {
    let pid = program_id();
    let (wallet_pda, _) = pda::find_wallet_pda(name, &pid);
    let (vault_pda, _) = pda::find_vault_pda(&wallet_pda, &pid);
    let (intent0, _) = pda::find_intent_pda(&wallet_pda, 0, &pid);
    let (intent1, _) = pda::find_intent_pda(&wallet_pda, 1, &pid);
    let (intent2, _) = pda::find_intent_pda(&wallet_pda, 2, &pid);

    let mut data = vec![0u8]; // discriminator
    data.push(name.len() as u8);
    data.extend_from_slice(name);
    data.push(proposers.len() as u8);
    for p in proposers {
        data.extend_from_slice(p.as_ref());
    }
    data.push(approvers.len() as u8);
    for a in approvers {
        data.extend_from_slice(a.as_ref());
    }
    data.push(approval_threshold);
    data.push(cancellation_threshold);
    data.extend_from_slice(&timelock_seconds.to_le_bytes());

    Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(wallet_pda, false),
            AccountMeta::new(vault_pda, false),
            AccountMeta::new(intent0, false),
            AccountMeta::new(intent1, false),
            AccountMeta::new(intent2, false),
            AccountMeta::new(*payer, true),
            AccountMeta::new_readonly(system_program_id(), false),
        ],
        data,
    }
}

/// Build an AddIntent instruction
pub fn add_intent(
    wallet: &Address,
    intent_index: u8,
    intent_data_raw: &[u8],
    payer: &Address,
) -> Instruction {
    let pid = program_id();
    let (intent_pda, _) = pda::find_intent_pda(wallet, intent_index, &pid);

    let mut data = vec![1u8]; // discriminator
    data.extend_from_slice(intent_data_raw);

    Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(*wallet, false),
            AccountMeta::new(intent_pda, false),
            AccountMeta::new(*payer, true),
            AccountMeta::new_readonly(system_program_id(), false),
        ],
        data,
    }
}

/// Build an AddIntentsBatch instruction
pub fn add_intents_batch(
    wallet: &Address,
    start_index: u8,
    intents: &[Vec<u8>],
    payer: &Address,
) -> Instruction {
    let pid = program_id();

    let mut data = vec![2u8]; // discriminator
    data.push(intents.len() as u8);
    for intent_data in intents {
        data.extend_from_slice(&(intent_data.len() as u16).to_le_bytes());
        data.extend_from_slice(intent_data);
    }

    let mut accounts = vec![
        AccountMeta::new(*wallet, false),
        AccountMeta::new(*payer, true),
        AccountMeta::new_readonly(system_program_id(), false),
    ];
    for i in 0..intents.len() {
        let (intent_pda, _) = pda::find_intent_pda(wallet, start_index + i as u8, &pid);
        accounts.push(AccountMeta::new(intent_pda, false));
    }

    Instruction {
        program_id: pid,
        accounts,
        data,
    }
}

/// Build a DeactivateIntent instruction
pub fn deactivate_intent(
    wallet: &Address,
    intent: &Address,
    signer: &Address,
    intent_index: u8,
) -> Instruction {
    let mut data = vec![3u8];
    data.push(intent_index);

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new_readonly(*wallet, false),
            AccountMeta::new(*intent, false),
            AccountMeta::new_readonly(*signer, true),
        ],
        data,
    }
}

/// Build a FreezeWallet instruction
pub fn freeze_wallet(
    wallet: &Address,
    meta_intent: &Address,
    signer: &Address,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*wallet, false),
            AccountMeta::new_readonly(*meta_intent, false),
            AccountMeta::new_readonly(*signer, true),
        ],
        data: vec![4u8],
    }
}

/// Build a Propose instruction
pub fn propose(
    wallet: &Address,
    intent: &Address,
    proposal_index: u64,
    params_data: &[u8],
    payer: &Address,
) -> Instruction {
    let pid = program_id();
    let (proposal_pda, _) = pda::find_proposal_pda(intent, proposal_index, &pid);

    let mut data = vec![10u8];
    data.extend_from_slice(&proposal_index.to_le_bytes());
    data.extend_from_slice(params_data);

    Instruction {
        program_id: pid,
        accounts: vec![
            AccountMeta::new(*wallet, false),
            AccountMeta::new(*intent, false),
            AccountMeta::new(proposal_pda, false),
            AccountMeta::new_readonly(instructions_sysvar_id(), false),
            AccountMeta::new(*payer, true),
            AccountMeta::new_readonly(system_program_id(), false),
        ],
        data,
    }
}

/// Build an Approve instruction
pub fn approve(
    wallet: &Address,
    intent: &Address,
    proposal: &Address,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new_readonly(*wallet, false),
            AccountMeta::new_readonly(*intent, false),
            AccountMeta::new(*proposal, false),
            AccountMeta::new_readonly(instructions_sysvar_id(), false),
        ],
        data: vec![11u8, 0],
    }
}

/// Build a Cancel instruction
pub fn cancel(
    wallet: &Address,
    intent: &Address,
    proposal: &Address,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new_readonly(*wallet, false),
            AccountMeta::new_readonly(*intent, false),
            AccountMeta::new(*proposal, false),
            AccountMeta::new_readonly(instructions_sysvar_id(), false),
        ],
        data: vec![12u8, 0],
    }
}

/// Build an Execute instruction
pub fn execute(
    wallet: &Address,
    vault: &Address,
    intent: &Address,
    proposal: &Address,
    remaining_accounts: &[AccountMeta],
) -> Instruction {
    let pid = program_id();
    let (event_authority, _) = pda::find_event_authority_pda(&pid);

    let mut accounts = vec![
        AccountMeta::new_readonly(*wallet, false),
        AccountMeta::new_readonly(*vault, false),
        AccountMeta::new(*intent, false),
        AccountMeta::new(*proposal, false),
        AccountMeta::new_readonly(event_authority, false),
        AccountMeta::new_readonly(pid, false),
    ];
    accounts.extend_from_slice(remaining_accounts);

    Instruction {
        program_id: pid,
        accounts,
        data: vec![20u8],
    }
}

/// Build a Cleanup instruction
pub fn cleanup(
    proposal: &Address,
    intent: &Address,
    rent_refund: &Address,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*proposal, false),
            AccountMeta::new(*intent, false),
            AccountMeta::new(*rent_refund, false),
        ],
        data: vec![30u8],
    }
}
