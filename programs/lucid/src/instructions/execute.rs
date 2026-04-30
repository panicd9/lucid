use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::cpi::{Seed, Signer};
use pinocchio::error::ProgramError;
use pinocchio::instruction::{InstructionAccount, InstructionView};
use pinocchio::ProgramResult;
use pinocchio::sysvars::Sysvar;
use pinocchio::sysvars::clock::Clock;

use crate::state::accounts::{self, *};
use crate::state::byte_pool::*;
use crate::state::constants::*;
use crate::state::errors::*;
use crate::state::message::render_intent_message;

pub struct Execute;

impl Execute {
    /// Accounts: [wallet, vault, intent, proposal, event_authority, program, ...remaining]
    pub fn process(accounts: &mut [AccountView], program_id: &Address) -> ProgramResult {
        if accounts.len() < 6 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }

        require_owner!(accounts[0], program_id); // wallet
        require_owner!(accounts[1], program_id); // vault
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
        }
        {
            let vdata = accounts[1].try_borrow()?;
            let vault = Vault::from_bytes(&vdata)?;
            if vault.wallet != wallet_address {
                return Err(ProgramError::InvalidAccountData);
            }
            vault_bump = vault.bump;
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

fn execute_custom_cpi(
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

const MAX_RESOLVE_DEPTH: u8 = 3;

fn resolve_address(
    intent_data: &[u8],
    intent: &IntentHeader,
    entry: &AccountEntry,
    params_data: &[u8],
    remaining: &[AccountView],
    vault_address: &[u8; 32],
) -> Result<[u8; 32], ProgramError> {
    resolve_address_inner(intent_data, intent, entry, params_data, remaining, vault_address, 0)
}

fn resolve_address_inner(
    intent_data: &[u8],
    intent: &IntentHeader,
    entry: &AccountEntry,
    params_data: &[u8],
    remaining: &[AccountView],
    vault_address: &[u8; 32],
    depth: u8,
) -> Result<[u8; 32], ProgramError> {
    if depth > MAX_RESOLVE_DEPTH {
        return Err(ProgramError::Custom(ERR_RECURSION_DEPTH));
    }
    match entry.source {
        SOURCE_STATIC => {
            let off = u16::from_le_bytes([entry.source_data[0], entry.source_data[1]]);
            read_pubkey_from_byte_pool(intent_data, intent, off)
        }
        SOURCE_PARAM => {
            let pi = entry.source_data[0];
            read_param_as_address(intent_data, intent, params_data, pi)
        }
        SOURCE_VAULT => Ok(*vault_address),
        SOURCE_PDA => {
            let seed_start = entry.source_data[0];
            let seed_count = entry.source_data[1];
            let prog_off = u16::from_le_bytes([entry.source_data[2], entry.source_data[3]]);
            let prog_bytes = read_pubkey_from_byte_pool(intent_data, intent, prog_off)?;
            let program = Address::new_from_array(prog_bytes);

            let sc = seed_count as usize;
            if sc > MAX_SEEDS {
                return Err(ProgramError::InvalidInstructionData);
            }

            let mut seed_bufs = [[0u8; 32]; 16];
            let mut seed_lens = [0usize; 16];

            // Cache the verified expected address per account_index across all
            // SEED_ACCOUNT_FIELD seeds in this PDA. A single source account
            // referenced multiple times (e.g. deposit reads pool 3 times) only
            // needs one resolve_address_inner call, which can itself recurse.
            let mut expected_addr_cache: [Option<[u8; 32]>; 16] = [None; 16];

            for s in 0..sc {
                let se = read_seed_entry(intent_data, intent, seed_start + s as u8)?;
                match se.seed_type {
                    SEED_LITERAL => {
                        let o = u16::from_le_bytes([se.seed_data[0], se.seed_data[1]]);
                        let l = u16::from_le_bytes([se.seed_data[2], se.seed_data[3]]) as usize;
                        let b = read_bytes_from_byte_pool(intent_data, intent, o, l as u16)?;
                        seed_bufs[s][..l].copy_from_slice(b);
                        seed_lens[s] = l;
                    }
                    SEED_PARAM => {
                        let pi = se.seed_data[0];
                        let b = read_param_bytes(intent_data, intent, params_data, pi)?;
                        seed_bufs[s][..b.len()].copy_from_slice(b);
                        seed_lens[s] = b.len();
                    }
                    SEED_ACCOUNT => {
                        let ai = se.seed_data[0];
                        let ae = read_account_entry(intent_data, intent, ai)?;
                        let addr = resolve_address_inner(intent_data, intent, ae, params_data, remaining, vault_address, depth + 1)?;
                        seed_bufs[s] = addr;
                        seed_lens[s] = 32;
                    }
                    SEED_ACCOUNT_FIELD => {
                        // Walk past variable-length predecessors (Option<T>) at runtime:
                        // Anchor's serializer writes only the used Borsh prefix, so a
                        // static offset would read stale bytes after a Some→None transition.
                        let ai = se.seed_data[0];
                        let plan_off = u16::from_le_bytes([se.seed_data[1], se.seed_data[2]]);
                        let target_len = se.seed_data[3] as usize;
                        if target_len == 0 || target_len > 32 {
                            return Err(ProgramError::InvalidInstructionData);
                        }
                        if (ai as usize) >= remaining.len() {
                            return Err(ProgramError::NotEnoughAccountKeys);
                        }

                        // Verify the supplied account at remaining[ai] matches what the
                        // intent's account entry at the same index resolves to. Without
                        // this check, an attacker could pass arbitrary account data and
                        // forge the resulting PDA.
                        let ai_us = ai as usize;
                        let expected = match expected_addr_cache[ai_us] {
                            Some(addr) => addr,
                            None => {
                                let ae = read_account_entry(intent_data, intent, ai)?;
                                let addr = resolve_address_inner(intent_data, intent, ae, params_data, remaining, vault_address, depth + 1)?;
                                expected_addr_cache[ai_us] = Some(addr);
                                addr
                            }
                        };
                        if remaining[ai_us].address().to_bytes() != expected {
                            return Err(ProgramError::Custom(ERR_ACCOUNT_MISMATCH));
                        }

                        // Read plan: count first, then op entries.
                        let count = read_bytes_from_byte_pool(intent_data, intent, plan_off, 1)?[0];
                        let plan_bytes = read_bytes_from_byte_pool(
                            intent_data,
                            intent,
                            plan_off + 1,
                            (count as u16) * 3,
                        )?;

                        let adata = remaining[ai as usize].try_borrow()?;
                        let mut o: usize = 8;

                        for i in 0..(count as usize) {
                            let p = i * 3;
                            let op = plan_bytes[p];
                            let size = u16::from_le_bytes([plan_bytes[p + 1], plan_bytes[p + 2]]) as usize;
                            match op {
                                FIELD_OP_SKIP_FIXED => {
                                    o = o.checked_add(size).ok_or(ProgramError::InvalidInstructionData)?;
                                    if o > adata.len() {
                                        return Err(ProgramError::InvalidAccountData);
                                    }
                                }
                                FIELD_OP_SKIP_OPTION => {
                                    if o >= adata.len() {
                                        return Err(ProgramError::InvalidAccountData);
                                    }
                                    let tag = adata[o];
                                    o += 1;
                                    if tag != 0 {
                                        o = o.checked_add(size).ok_or(ProgramError::InvalidInstructionData)?;
                                        if o > adata.len() {
                                            return Err(ProgramError::InvalidAccountData);
                                        }
                                    }
                                }
                                _ => return Err(ProgramError::InvalidInstructionData),
                            }
                        }

                        if o + target_len > adata.len() {
                            return Err(ProgramError::InvalidAccountData);
                        }
                        seed_bufs[s][..target_len].copy_from_slice(&adata[o..o + target_len]);
                        seed_lens[s] = target_len;
                    }
                    _ => return Err(ProgramError::InvalidInstructionData),
                }
            }

            let seed_refs: [&[u8]; 16] = core::array::from_fn(|i| {
                if i < sc { &seed_bufs[i][..seed_lens[i]] } else { &[] as &[u8] }
            });

            let (pda, _): (Address, u8) = Address::find_program_address(&seed_refs[..sc], &program);
            Ok(pda.to_bytes())
        }
        SOURCE_HAS_ONE => {
            // entry.source_data[0] is the AccountEntry index whose pubkey at
            // offset (source_data[1..3]) we want to read. The same index also
            // identifies the slot in `remaining` where the supplied account
            // must appear.
            let src_idx = entry.source_data[0] as usize;
            let data_off = u16::from_le_bytes([entry.source_data[1], entry.source_data[2]]) as usize;
            if src_idx >= remaining.len() || src_idx >= intent.account_count as usize {
                return Err(ProgramError::NotEnoughAccountKeys);
            }
            // Verify the supplied account matches what the intent's account
            // entry at the same index resolves to. Without this check, an
            // attacker could pass a forged source account and inject any
            // chosen pubkey into vault-signed CPI account slots.
            // (Mirrors the SEED_ACCOUNT_FIELD verification above.)
            let src_entry = read_account_entry(intent_data, intent, src_idx as u8)?;
            let expected = resolve_address_inner(
                intent_data, intent, src_entry, params_data, remaining, vault_address, depth + 1,
            )?;
            if remaining[src_idx].address().to_bytes() != expected {
                return Err(ProgramError::Custom(ERR_ACCOUNT_MISMATCH));
            }
            let adata = remaining[src_idx].try_borrow()?;
            if data_off + 32 > adata.len() {
                return Err(ProgramError::InvalidAccountData);
            }
            let mut pk = [0u8; 32];
            pk.copy_from_slice(&adata[data_off..data_off + 32]);
            Ok(pk)
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn execute_meta_add(
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

fn execute_meta_remove(
    accounts: &mut [AccountView],
    params: &[u8],
    wallet_address: &[u8; 32],
    program_id: &Address,
) -> Result<(), ProgramError> {
    if params.is_empty() || accounts.len() < 7 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let target_index = params[0];

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

fn execute_meta_update(
    accounts: &mut [AccountView],
    params: &[u8],
    wallet_address: &[u8; 32],
    program_id: &Address,
) -> Result<(), ProgramError> {
    if params.len() < 4 || accounts.len() < 7 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let target_index = params[0];
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

fn validate_intent_header(intent: &IntentHeader, account_len: usize) -> Result<(), ProgramError> {
    accounts::validate_intent_header(intent, account_len)
}
