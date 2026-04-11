use litesvm::LiteSVM;
use solana_address::Address;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;

use super::{instructions, pda, program_id};
use super::{DISC_WALLET, DISC_INTENT, ACCOUNT_VERSION, PREFIX_LEN};

/// Path to the compiled program .so file
const PROGRAM_SO: &str = "../../target/deploy/lucid.so";

/// Create a new LiteSVM instance with the Lucid program loaded
pub fn new_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(program_id(), PROGRAM_SO)
        .expect("failed to load lucid.so — run `cargo build-sbf` first");
    svm
}

/// Airdrop SOL to an address
pub fn airdrop(svm: &mut LiteSVM, to: &Address, lamports: u64) {
    svm.airdrop(to, lamports).unwrap();
}

/// Send a transaction and return the result
pub fn send_tx(
    svm: &mut LiteSVM,
    ixs: &[Instruction],
    payer: &Keypair,
    signers: &[&Keypair],
) -> litesvm::types::TransactionResult {
    let msg = Message::new_with_blockhash(
        ixs,
        Some(&payer.pubkey()),
        &svm.latest_blockhash(),
    );
    let tx = Transaction::new(signers, msg, svm.latest_blockhash());
    svm.send_transaction(tx)
}

/// Get account data as bytes
pub fn get_account_data(svm: &LiteSVM, addr: &Address) -> Option<Vec<u8>> {
    svm.get_account(addr).map(|a| a.data.to_vec())
}

/// Get account lamports
pub fn get_lamports(svm: &LiteSVM, addr: &Address) -> u64 {
    svm.get_account(addr).map(|a| a.lamports).unwrap_or(0)
}

/// Create a wallet with default settings and return relevant info
pub struct WalletSetup {
    pub wallet: Address,
    pub vault: Address,
    pub intents: [Address; 3],
    pub payer: Keypair,
    pub proposers: Vec<Keypair>,
    pub approvers: Vec<Keypair>,
    pub name: Vec<u8>,
}

pub fn create_test_wallet(
    svm: &mut LiteSVM,
    name: &[u8],
    num_proposers: usize,
    num_approvers: usize,
    approval_threshold: u8,
    cancellation_threshold: u8,
    timelock_seconds: u32,
) -> WalletSetup {
    let payer = Keypair::new();
    airdrop(svm, &payer.pubkey(), 100_000_000_000);

    let proposers: Vec<Keypair> = (0..num_proposers).map(|_| Keypair::new()).collect();
    let approvers: Vec<Keypair> = (0..num_approvers).map(|_| Keypair::new()).collect();

    let proposer_addrs: Vec<Address> = proposers.iter().map(|k| k.pubkey()).collect();
    let approver_addrs: Vec<Address> = approvers.iter().map(|k| k.pubkey()).collect();

    let pid = program_id();
    let (wallet, _) = pda::find_wallet_pda(name, &pid);
    let (vault, _) = pda::find_vault_pda(&wallet, &pid);
    let intents = [
        pda::find_intent_pda(&wallet, 0, &pid).0,
        pda::find_intent_pda(&wallet, 1, &pid).0,
        pda::find_intent_pda(&wallet, 2, &pid).0,
    ];

    let ix = instructions::create_wallet(
        name,
        &proposer_addrs,
        &approver_addrs,
        approval_threshold,
        cancellation_threshold,
        timelock_seconds,
        &payer.pubkey(),
    );

    let result = send_tx(svm, &[ix], &payer, &[&payer]);
    assert!(result.is_ok(), "CreateWallet failed: {:?}", result.err());

    WalletSetup {
        wallet,
        vault,
        intents,
        payer,
        proposers,
        approvers,
        name: name.to_vec(),
    }
}

pub struct WalletState {
    pub proposal_index: u64,
    pub intent_count: u8,
    pub frozen: u8,
    pub bump: u8,
    pub name_len: u8,
}

pub fn read_wallet_state(svm: &LiteSVM, wallet: &Address) -> WalletState {
    let data = get_account_data(svm, wallet).expect("wallet account not found");
    assert_eq!(data[0], DISC_WALLET);
    assert_eq!(data[1], ACCOUNT_VERSION);

    let d = &data[PREFIX_LEN..];
    WalletState {
        proposal_index: u64::from_le_bytes(d[0..8].try_into().unwrap()),
        intent_count: d[8],
        frozen: d[9],
        bump: d[10],
        name_len: d[11],
    }
}

pub fn read_proposal_status(svm: &LiteSVM, proposal: &Address) -> u8 {
    let data = get_account_data(svm, proposal).expect("proposal account not found");
    let status_offset = PREFIX_LEN + 32 + 32 + 8 + 32 + 2 + 2;
    data[status_offset]
}

pub fn read_proposal_bitmaps(svm: &LiteSVM, proposal: &Address) -> (u16, u16) {
    let data = get_account_data(svm, proposal).expect("proposal account not found");
    let bitmap_offset = PREFIX_LEN + 32 + 32 + 8 + 32;
    let approval = u16::from_le_bytes([data[bitmap_offset], data[bitmap_offset + 1]]);
    let cancel = u16::from_le_bytes([data[bitmap_offset + 2], data[bitmap_offset + 3]]);
    (approval, cancel)
}

pub fn read_intent_approved(svm: &LiteSVM, intent: &Address) -> u8 {
    let data = get_account_data(svm, intent).expect("intent account not found");
    assert_eq!(data[0], DISC_INTENT);
    let approved_offset = PREFIX_LEN + 32 + 4 + 2 + 2 + 1 + 1 + 1;
    data[approved_offset]
}
