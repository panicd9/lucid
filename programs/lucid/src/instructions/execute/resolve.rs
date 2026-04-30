use pinocchio::account::AccountView;
use pinocchio::address::Address;
use pinocchio::error::ProgramError;

use crate::state::accounts::*;
use crate::state::byte_pool::*;
use crate::state::constants::*;
use crate::state::errors::*;

pub(super) const MAX_RESOLVE_DEPTH: u8 = 3;

pub(super) fn resolve_address(
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
