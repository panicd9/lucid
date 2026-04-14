use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::cpi::{Seed, Signer};
use pinocchio::error::ProgramError;
use pinocchio::ProgramResult;
use crate::state::accounts::*;
use crate::state::constants::*;
use crate::state::errors::*;

/// Check that a list of 32-byte pubkeys contains no duplicates
fn has_duplicate_pubkeys(keys: &[u8], count: usize) -> bool {
    for i in 0..count {
        for j in (i + 1)..count {
            if keys[i * 32..(i + 1) * 32] == keys[j * 32..(j + 1) * 32] {
                return true;
            }
        }
    }
    false
}

pub struct CreateWallet;

impl CreateWallet {
    pub fn process(data: &[u8], accounts: &mut [AccountView], program_id: &Address) -> ProgramResult {
        if accounts.len() < 7 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        if !accounts[5].is_signer() {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Parse instruction data: [create_key(32), name_len(1), name, ...]
        require_len!(data, 32);
        let create_key = &data[0..32];
        let mut offset = 32;

        require_len!(data, offset + 1);
        let name_len = data[offset] as usize;
        offset += 1;
        if name_len == 0 || name_len > MAX_NAME_LEN {
            return Err(ProgramError::Custom(ERR_NAME_TOO_LONG));
        }
        require_len!(data, offset + name_len);
        let name = &data[offset..offset + name_len];
        offset += name_len;

        require_len!(data, offset + 1);
        let proposer_count = data[offset];
        offset += 1;
        if proposer_count == 0 {
            return Err(ProgramError::Custom(ERR_NO_SIGNERS));
        }
        if proposer_count as usize > MAX_SIGNERS {
            return Err(ProgramError::Custom(ERR_TOO_MANY_SIGNERS));
        }
        let proposers_len = proposer_count as usize * 32;
        require_len!(data, offset + proposers_len);
        let proposers = &data[offset..offset + proposers_len];
        offset += proposers_len;

        require_len!(data, offset + 1);
        let approver_count = data[offset];
        offset += 1;
        if approver_count == 0 {
            return Err(ProgramError::Custom(ERR_NO_SIGNERS));
        }
        if approver_count as usize > MAX_SIGNERS {
            return Err(ProgramError::Custom(ERR_TOO_MANY_SIGNERS));
        }
        let approvers_len = approver_count as usize * 32;
        require_len!(data, offset + approvers_len);
        let approvers = &data[offset..offset + approvers_len];
        offset += approvers_len;

        // Reject duplicate pubkeys in proposer/approver lists
        if has_duplicate_pubkeys(proposers, proposer_count as usize) {
            return Err(ProgramError::InvalidArgument);
        }
        if has_duplicate_pubkeys(approvers, approver_count as usize) {
            return Err(ProgramError::InvalidArgument);
        }

        require_len!(data, offset + 6);
        let approval_threshold = data[offset];
        let cancellation_threshold = data[offset + 1];
        if approval_threshold == 0 || approval_threshold > approver_count {
            return Err(ProgramError::Custom(ERR_INVALID_THRESHOLD));
        }
        if cancellation_threshold == 0 || cancellation_threshold > approver_count {
            return Err(ProgramError::Custom(ERR_INVALID_THRESHOLD));
        }
        let timelock_seconds = u32::from_le_bytes(
            data[offset + 2..offset + 6].try_into().map_err(|_| ProgramError::InvalidInstructionData)?
        );

        // ── Derive wallet PDA ──
        let wallet_seeds: &[&[u8]] = &[WALLET_SEED, create_key];
        let (wallet_pda, wallet_bump) = Address::find_program_address(wallet_seeds, program_id);
        if accounts[0].address() != &wallet_pda {
            return Err(ProgramError::InvalidSeeds);
        }

        // ── Create wallet account ──
        let wallet_bump_bytes = [wallet_bump];
        let wallet_signer_seeds = [
            Seed::from(WALLET_SEED),
            Seed::from(create_key),
            Seed::from(wallet_bump_bytes.as_slice()),
        ];
        let wallet_signer = [Signer::from(wallet_signer_seeds.as_slice())];

        let wallet_space = Wallet::LEN;
        let wallet_lamports = rent_exempt_lamports(wallet_space);

        pinocchio_system::instructions::CreateAccount {
            from: &accounts[5],
            to: &accounts[0],
            lamports: wallet_lamports,
            space: wallet_space as u64,
            owner: program_id,
        }
        .invoke_signed(&wallet_signer)?;

        // ── Initialize wallet data ──
        {
            let mut wdata = accounts[0].try_borrow_mut()?;
            wdata[0] = Wallet::DISCRIMINATOR;
            wdata[1] = ACCOUNT_VERSION;
            let wallet = Wallet::from_bytes_mut(&mut wdata)?;
            wallet.proposal_index = 0;
            wallet.intent_count = 3;
            wallet.frozen = 0;
            wallet.bump = wallet_bump;
            wallet.name_len = name.len() as u8;
            wallet._reserved = [0; 4];
            wallet.create_key = create_key.try_into().map_err(|_| ProgramError::InvalidInstructionData)?;
            wallet.name = [0; 32];
            wallet.name[..name.len()].copy_from_slice(name);
        }

        // ── Create vault PDA ──
        let wallet_addr_bytes = wallet_pda.to_bytes();
        let vault_seeds: &[&[u8]] = &[VAULT_SEED, &wallet_addr_bytes];
        let (vault_pda, vault_bump) = Address::find_program_address(vault_seeds, program_id);
        if accounts[1].address() != &vault_pda {
            return Err(ProgramError::InvalidSeeds);
        }

        let vault_bump_bytes = [vault_bump];
        let vault_signer_seeds = [
            Seed::from(VAULT_SEED),
            Seed::from(wallet_addr_bytes.as_slice()),
            Seed::from(vault_bump_bytes.as_slice()),
        ];
        let vault_signer = [Signer::from(vault_signer_seeds.as_slice())];

        let vault_space = Vault::LEN;
        let vault_lamports = rent_exempt_lamports(vault_space);

        pinocchio_system::instructions::CreateAccount {
            from: &accounts[5],
            to: &accounts[1],
            lamports: vault_lamports,
            space: vault_space as u64,
            owner: program_id,
        }
        .invoke_signed(&vault_signer)?;

        {
            let mut vdata = accounts[1].try_borrow_mut()?;
            vdata[0] = Vault::DISCRIMINATOR;
            vdata[1] = ACCOUNT_VERSION;
            let vault = Vault::from_bytes_mut(&mut vdata)?;
            vault.wallet = wallet_addr_bytes;
            vault.bump = vault_bump;
        }

        // ── Create 3 meta-intents ──
        let meta_types = [INTENT_TYPE_ADD, INTENT_TYPE_REMOVE, INTENT_TYPE_UPDATE];
        let meta_templates: [&[u8]; 3] = [
            b"add intent: {0}",
            b"remove intent #{0}",
            b"update intent #{0}: {1}",
        ];

        for (idx, intent_type) in meta_types.iter().enumerate() {
            let intent_index = idx as u8;
            let account_idx = 2 + idx; // accounts[2], [3], [4]

            let index_bytes = [intent_index];
            let intent_seeds: &[&[u8]] = &[INTENT_SEED, &wallet_addr_bytes, &index_bytes];
            let (intent_pda, intent_bump) = Address::find_program_address(intent_seeds, program_id);
            if accounts[account_idx].address() != &intent_pda {
                return Err(ProgramError::InvalidSeeds);
            }

            let template = meta_templates[idx];
            let (param_count, param_entries_size) = match *intent_type {
                INTENT_TYPE_ADD => (1u8, ParamEntry::SIZE),
                INTENT_TYPE_REMOVE => (1u8, ParamEntry::SIZE),
                INTENT_TYPE_UPDATE => (2u8, 2 * ParamEntry::SIZE),
                _ => unreachable!(),
            };

            let byte_pool_len = 4 + template.len();
            let total_size = IntentHeader::HEADER_LEN
                + (proposer_count as usize * 32)
                + (approver_count as usize * 32)
                + param_entries_size
                + byte_pool_len;

            let intent_lamports = rent_exempt_lamports(total_size);
            let intent_bump_bytes = [intent_bump];
            let intent_signer_seeds = [
                Seed::from(INTENT_SEED),
                Seed::from(wallet_addr_bytes.as_slice()),
                Seed::from(index_bytes.as_slice()),
                Seed::from(intent_bump_bytes.as_slice()),
            ];
            let intent_signer = [Signer::from(intent_signer_seeds.as_slice())];

            pinocchio_system::instructions::CreateAccount {
                from: &accounts[5],
                to: &accounts[account_idx],
                lamports: intent_lamports,
                space: total_size as u64,
                owner: program_id,
            }
            .invoke_signed(&intent_signer)?;

            let mut idata = accounts[account_idx].try_borrow_mut()?;
            idata[0] = IntentHeader::DISCRIMINATOR;
            idata[1] = ACCOUNT_VERSION;

            let intent = IntentHeader::from_bytes_mut(&mut idata)?;
            intent.wallet = wallet_addr_bytes;
            intent.bump = intent_bump;
            intent.intent_index = intent_index;
            intent.intent_type = *intent_type;
            intent.approved = 1;
            intent.approval_threshold = approval_threshold;
            intent.cancellation_threshold = cancellation_threshold;
            intent.timelock_seconds = timelock_seconds.max(DEFAULT_META_TIMELOCK);
            intent.active_proposal_count = 0;
            intent.proposer_count = proposer_count;
            intent.approver_count = approver_count;
            intent.param_count = param_count;
            intent.account_count = 0;
            intent.instruction_count = 0;
            intent.data_segment_count = 0;
            intent.seed_count = 0;
            intent.byte_pool_len = byte_pool_len as u16;
            intent._reserved = [0; 3];

            // Write proposers after header
            let proposers_start = IntentHeader::HEADER_LEN;
            idata[proposers_start..proposers_start + proposers_len].copy_from_slice(proposers);

            // Write approvers
            let approvers_start = proposers_start + proposers_len;
            idata[approvers_start..approvers_start + approvers_len].copy_from_slice(approvers);

            // Write param entries
            let params_start = approvers_start + approvers_len;
            write_meta_param_entries(&mut idata[params_start..], *intent_type);

            // Write byte_pool (template)
            let bp_start = params_start + param_entries_size;
            idata[bp_start] = 0; // template_offset low
            idata[bp_start + 1] = 0; // template_offset high
            idata[bp_start + 2] = template.len() as u8;
            idata[bp_start + 3] = (template.len() >> 8) as u8;
            idata[bp_start + 4..bp_start + 4 + template.len()].copy_from_slice(template);
        }

        Ok(())
    }
}

fn write_meta_param_entries(buf: &mut [u8], intent_type: u8) {
    match intent_type {
        INTENT_TYPE_ADD => {
            write_param_entry(buf, PARAM_TYPE_STRING);
        }
        INTENT_TYPE_REMOVE => {
            write_param_entry(buf, PARAM_TYPE_U8);
        }
        INTENT_TYPE_UPDATE => {
            write_param_entry(buf, PARAM_TYPE_U8);
            write_param_entry(&mut buf[ParamEntry::SIZE..], PARAM_TYPE_STRING);
        }
        _ => {}
    }
}

fn write_param_entry(buf: &mut [u8], param_type: u8) {
    // Layout: constraint_value:8, name_offset:2, name_len:2, param_type:1, constraint_type:1, display_decimals:1, pad:1
    buf[..ParamEntry::SIZE].fill(0);
    buf[12] = param_type;
}
