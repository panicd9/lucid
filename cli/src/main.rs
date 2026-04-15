#[allow(dead_code)]
mod commands;
mod intent_utils;
mod pda;
mod rpc;
#[allow(dead_code)]
mod types;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "lucid", about = "Lucid intent-based multisig CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Wallet management commands
    Wallet {
        #[command(subcommand)]
        action: WalletAction,
    },
    /// Generate intent definitions from an Anchor IDL
    Generate {
        /// Path to the Anchor IDL JSON file
        #[arg(long)]
        idl: String,
        /// Output directory for intent JSON files
        #[arg(long)]
        output: String,
    },
    /// Verify intent definitions
    Verify {
        /// Directory containing intent JSON files
        #[arg(long)]
        intents: String,
        /// Optional path to Anchor IDL for Tier 2 verification
        #[arg(long)]
        idl: Option<String>,
    },
    /// Create a proposal
    Propose {
        /// Wallet address
        #[arg(long)]
        wallet: String,
        /// Intent index
        #[arg(long)]
        intent: u8,
        /// Parameters as key=value pairs
        #[arg(long)]
        params: Option<String>,
        /// Signature expiry in seconds from now
        #[arg(long, default_value = "300")]
        expiry: u64,
        /// Path to keypair file
        #[arg(long, default_value = "~/.config/solana/id.json")]
        keypair: String,
        /// RPC URL
        #[arg(long, default_value = "https://api.devnet.solana.com")]
        url: String,
    },
    /// Approve a proposal
    Approve {
        /// Wallet address
        #[arg(long)]
        wallet: String,
        /// Proposal index
        #[arg(long)]
        proposal: u64,
        /// Signature expiry in seconds from now
        #[arg(long, default_value = "300")]
        expiry: u64,
        /// Path to keypair file
        #[arg(long, default_value = "~/.config/solana/id.json")]
        keypair: String,
        /// RPC URL
        #[arg(long, default_value = "https://api.devnet.solana.com")]
        url: String,
    },
    /// Cancel a proposal
    Cancel {
        /// Wallet address
        #[arg(long)]
        wallet: String,
        /// Proposal index
        #[arg(long)]
        proposal: u64,
        /// Signature expiry in seconds from now
        #[arg(long, default_value = "300")]
        expiry: u64,
        /// Path to keypair file
        #[arg(long, default_value = "~/.config/solana/id.json")]
        keypair: String,
        /// RPC URL
        #[arg(long, default_value = "https://api.devnet.solana.com")]
        url: String,
    },
    /// Execute an approved proposal
    Execute {
        /// Wallet address
        #[arg(long)]
        wallet: String,
        /// Proposal index
        #[arg(long)]
        proposal: u64,
        /// Path to keypair file
        #[arg(long, default_value = "~/.config/solana/id.json")]
        keypair: String,
        /// RPC URL
        #[arg(long, default_value = "https://api.devnet.solana.com")]
        url: String,
    },
}

#[derive(Subcommand)]
enum WalletAction {
    /// Create a new multisig wallet
    Create {
        /// Wallet name (max 32 bytes)
        #[arg(long)]
        name: String,
        /// Comma-separated proposer public keys
        #[arg(long)]
        proposers: String,
        /// Comma-separated approver public keys
        #[arg(long)]
        approvers: String,
        /// Number of approvals needed
        #[arg(long)]
        approval_threshold: u8,
        /// Number of cancellations needed
        #[arg(long)]
        cancellation_threshold: u8,
        /// Timelock in seconds
        #[arg(long, default_value = "0")]
        timelock: u32,
        /// Path to keypair file
        #[arg(long, default_value = "~/.config/solana/id.json")]
        keypair: String,
        /// RPC URL
        #[arg(long, default_value = "https://api.devnet.solana.com")]
        url: String,
    },
    /// Show wallet details
    Show {
        /// Wallet address
        #[arg(long)]
        wallet: String,
        /// RPC URL
        #[arg(long, default_value = "https://api.devnet.solana.com")]
        url: String,
    },
    /// Freeze wallet (prevent new intent additions)
    Freeze {
        /// Wallet address
        #[arg(long)]
        wallet: String,
        /// Path to keypair file
        #[arg(long, default_value = "~/.config/solana/id.json")]
        keypair: String,
        /// RPC URL
        #[arg(long, default_value = "https://api.devnet.solana.com")]
        url: String,
    },
    /// Add intents from a directory or single JSON file
    AddIntents {
        /// Wallet address
        #[arg(long)]
        wallet: String,
        /// Single intent JSON file
        #[arg(long, conflicts_with = "intents")]
        intent: Option<String>,
        /// Directory containing intent JSON files
        #[arg(long, conflicts_with = "intent")]
        intents: Option<String>,
        /// Proposer pubkeys (comma-separated). Omit to inherit from wallet.
        #[arg(long)]
        proposers: Option<String>,
        /// Approver pubkeys (comma-separated). Omit to inherit from wallet.
        #[arg(long)]
        approvers: Option<String>,
        /// Approval threshold. Omit to inherit from wallet.
        #[arg(long)]
        approval_threshold: Option<u8>,
        /// Cancellation threshold. Omit to inherit from wallet.
        #[arg(long)]
        cancellation_threshold: Option<u8>,
        /// Path to keypair file
        #[arg(long, default_value = "~/.config/solana/id.json")]
        keypair: String,
        /// RPC URL
        #[arg(long, default_value = "https://api.devnet.solana.com")]
        url: String,
    },
}

fn main() {
    let cli = Cli::parse();

    let result = match cli.command {
        Commands::Wallet { action } => match action {
            WalletAction::Create {
                name,
                proposers,
                approvers,
                approval_threshold,
                cancellation_threshold,
                timelock,
                keypair,
                url,
            } => commands::wallet::create(
                &name,
                &proposers,
                &approvers,
                approval_threshold,
                cancellation_threshold,
                timelock,
                &keypair,
                &url,
            ),
            WalletAction::Show { wallet, url } => commands::wallet::show(&wallet, &url),
            WalletAction::Freeze {
                wallet,
                keypair,
                url,
            } => commands::wallet::freeze(&wallet, &keypair, &url),
            WalletAction::AddIntents {
                wallet,
                intent,
                intents,
                proposers,
                approvers,
                approval_threshold,
                cancellation_threshold,
                keypair,
                url,
            } => {
                let source = intent.or(intents).unwrap_or_else(|| {
                    eprintln!("Error: provide either --intent <file> or --intents <dir>");
                    std::process::exit(1);
                });
                commands::wallet::add_intents(
                    &wallet,
                    &source,
                    proposers.as_deref(),
                    approvers.as_deref(),
                    approval_threshold,
                    cancellation_threshold,
                    &keypair,
                    &url,
                )
            }
        },
        Commands::Generate { idl, output } => commands::generate::generate(&idl, &output),
        Commands::Verify { intents, idl } => commands::verify::verify(&intents, idl.as_deref()),
        Commands::Propose {
            wallet,
            intent,
            params,
            expiry,
            keypair,
            url,
        } => commands::propose::propose(&wallet, intent, params.as_deref(), expiry, &keypair, &url),
        Commands::Approve {
            wallet,
            proposal,
            expiry,
            keypair,
            url,
        } => commands::approve::approve(&wallet, proposal, expiry, &keypair, &url),
        Commands::Cancel {
            wallet,
            proposal,
            expiry,
            keypair,
            url,
        } => commands::cancel::cancel(&wallet, proposal, expiry, &keypair, &url),
        Commands::Execute {
            wallet,
            proposal,
            keypair,
            url,
        } => commands::execute::execute(&wallet, proposal, &keypair, &url),
    };

    if let Err(e) = result {
        eprintln!("Error: {:#}", e);
        std::process::exit(1);
    }
}
