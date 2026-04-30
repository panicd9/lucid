use solana_address::Address;
use solana_instruction::{AccountMeta, Instruction};

use lucid_client::instructions::*;

use super::{pda, program_id};

/// Build a CreateWallet instruction
pub fn create_wallet(
    create_key: &Address,
    name: &[u8],
    proposers: &[Address],
    approvers: &[Address],
    approval_threshold: u8,
    cancellation_threshold: u8,
    timelock_seconds: u32,
    payer: &Address,
) -> Instruction {
    let pid = program_id();
    let (wallet_pda, _) = pda::find_wallet_pda(create_key, &pid);
    let (vault_pda, _) = pda::find_vault_pda(&wallet_pda, &pid);
    let (intent0, _) = pda::find_intent_pda(&wallet_pda, 0, &pid);
    let (intent1, _) = pda::find_intent_pda(&wallet_pda, 1, &pid);
    let (intent2, _) = pda::find_intent_pda(&wallet_pda, 2, &pid);

    let mut ix = CreateWalletBuilder::new()
        .wallet(wallet_pda)
        .vault(vault_pda)
        .meta_intent_add(intent0)
        .meta_intent_remove(intent1)
        .meta_intent_update(intent2)
        .payer(*payer)
        .instruction();

    // Append instruction args (not captured by Shank IDL)
    let mut data = vec![CREATE_WALLET_DISCRIMINATOR];
    data.extend_from_slice(create_key.as_ref());
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
    ix.data = data;
    ix
}

/// Build an AddIntent instruction. Appends the wallet's ADD meta-intent
/// (intent index 0) as a 5th account so the program can verify the signer is
/// in the wallet's approver list.
pub fn add_intent(
    wallet: &Address,
    intent_index: u8,
    intent_data_raw: &[u8],
    payer: &Address,
) -> Instruction {
    let pid = program_id();
    let (intent_pda, _) = pda::find_intent_pda(wallet, intent_index, &pid);
    let (add_meta_pda, _) = pda::find_intent_pda(wallet, 0, &pid);

    let mut ix = AddIntentBuilder::new()
        .wallet(*wallet)
        .intent(intent_pda)
        .payer(*payer)
        .instruction();

    // Auth proof: signer must be in this meta-intent's approver list.
    ix.accounts.push(AccountMeta::new_readonly(add_meta_pda, false));

    let mut data = vec![ADD_INTENT_DISCRIMINATOR];
    data.extend_from_slice(intent_data_raw);
    ix.data = data;
    ix
}

/// Build an AddIntentsBatch instruction. The ADD meta-intent (index 0) is
/// appended after the per-intent PDAs as the auth-proof account.
pub fn add_intents_batch(
    wallet: &Address,
    start_index: u8,
    intents: &[Vec<u8>],
    payer: &Address,
) -> Instruction {
    let pid = program_id();

    let mut builder = AddIntentsBatchBuilder::new();
    builder.wallet(*wallet).payer(*payer);

    for i in 0..intents.len() {
        let (intent_pda, _) = pda::find_intent_pda(wallet, start_index + i as u8, &pid);
        builder.add_remaining_account(AccountMeta::new(intent_pda, false));
    }
    let (add_meta_pda, _) = pda::find_intent_pda(wallet, 0, &pid);
    builder.add_remaining_account(AccountMeta::new_readonly(add_meta_pda, false));

    let mut ix = builder.instruction();

    let mut data = vec![ADD_INTENTS_BATCH_DISCRIMINATOR];
    data.push(intents.len() as u8);
    for intent_data in intents {
        data.extend_from_slice(&(intent_data.len() as u16).to_le_bytes());
        data.extend_from_slice(intent_data);
    }
    ix.data = data;
    ix
}

/// Build a DeactivateIntent instruction
pub fn deactivate_intent(
    wallet: &Address,
    intent: &Address,
    signer: &Address,
    intent_index: u8,
) -> Instruction {
    let mut ix = DeactivateIntentBuilder::new()
        .wallet(*wallet)
        .intent(*intent)
        .authority(*signer)
        .instruction();

    let mut data = vec![DEACTIVATE_INTENT_DISCRIMINATOR];
    data.push(intent_index);
    ix.data = data;
    ix
}

/// Build a FreezeWallet instruction
pub fn freeze_wallet(
    wallet: &Address,
    meta_intent: &Address,
    signer: &Address,
) -> Instruction {
    FreezeWalletBuilder::new()
        .wallet(*wallet)
        .meta_intent(*meta_intent)
        .authority(*signer)
        .instruction()
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

    let mut ix = ProposeBuilder::new()
        .wallet(*wallet)
        .intent(*intent)
        .proposal(proposal_pda)
        .payer(*payer)
        .instruction();

    let mut data = vec![PROPOSE_DISCRIMINATOR];
    data.extend_from_slice(&proposal_index.to_le_bytes());
    data.extend_from_slice(params_data);
    ix.data = data;
    ix
}

/// Build an Approve instruction
pub fn approve(
    wallet: &Address,
    intent: &Address,
    proposal: &Address,
) -> Instruction {
    let mut ix = ApproveBuilder::new()
        .wallet(*wallet)
        .intent(*intent)
        .proposal(*proposal)
        .instruction();

    ix.data = vec![APPROVE_DISCRIMINATOR, 0];
    ix
}

/// Build a Cancel instruction
pub fn cancel(
    wallet: &Address,
    intent: &Address,
    proposal: &Address,
) -> Instruction {
    let mut ix = CancelBuilder::new()
        .wallet(*wallet)
        .intent(*intent)
        .proposal(*proposal)
        .instruction();

    ix.data = vec![CANCEL_DISCRIMINATOR, 0];
    ix
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

    let mut builder = ExecuteBuilder::new();
    builder
        .wallet(*wallet)
        .vault(*vault)
        .intent(*intent)
        .proposal(*proposal)
        .event_authority(event_authority)
        .program(pid);

    if !remaining_accounts.is_empty() {
        builder.add_remaining_accounts(remaining_accounts);
    }

    builder.instruction()
}

/// Build a Cleanup instruction
pub fn cleanup(
    proposal: &Address,
    intent: &Address,
    rent_refund: &Address,
) -> Instruction {
    CleanupBuilder::new()
        .proposal(*proposal)
        .intent(*intent)
        .rent_refund(*rent_refund)
        .instruction()
}
