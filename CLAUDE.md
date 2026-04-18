# Lucid — Intent-Based Multisig for Solana

Signers read what they approve on their hardware wallet. Not a wrapper. The multisig.

## Project Structure

```
programs/lucid/       On-chain Pinocchio program (11 instructions)
cli/                  Rust CLI tool (lucid binary)
sdk/                  TypeScript SDK (@lucid/sdk)
dashboard/            React web UI (Vite + Tailwind)
clients/rust/         Auto-generated Rust client (Codama)
demo/                 End-to-end demo with Campfire crowdfunding protocol
```

## Program ID

`LUC5TbUhLpT2dZuC2qA4vMZdxJXsbcsUVejTqLJBJWR`

Note: `programs/lucid/src/state/constants.rs` has a placeholder `PROGRAM_ID = [0; 32]` — the real ID is derived from `target/deploy/lucid-keypair.json` and hardcoded in `dashboard/src/lib/constants.ts`.

## Build Commands

```bash
# Build on-chain program (SBF target)
cargo build-sbf --manifest-path programs/lucid/Cargo.toml

# Build CLI
cargo build -p lucid-cli

# SDK typecheck + build
npm run types --prefix sdk
npm run build --prefix sdk

# Dashboard dev server
npm run dev --prefix dashboard

# Dashboard production build
npm run build --prefix dashboard
```

## Test Commands

Run the full suite (always run full suite, never scope to individual files):

```bash
bash test.sh
```

This runs 5 phases (11 checks total):
1. `cargo build-sbf` — SBF binary
2. `cargo check -p lucid` — program compilation
3. Rust integration tests (LiteSVM): `lifecycle`, `proposal`, `security`, golden vectors
4. CLI tests: `cargo test -p lucid-cli`
5. SDK: typecheck + 64 vitest tests
6. Dashboard: build + 22 vitest tests

## Demo

```bash
# Terminal 1: start validator with Lucid + Campfire programs
solana-test-validator \
  --bpf-program LUC5TbUhLpT2dZuC2qA4vMZdxJXsbcsUVejTqLJBJWR target/deploy/lucid.so \
  --reset

# Terminal 2: run demo script
bash demo/run.sh

# Terminal 3 (optional): dashboard
npm run dev --prefix dashboard
```

Demo flow: generate intents from Campfire IDL -> verify -> tamper detection -> create wallet -> add intents -> audit.

## Architecture

### On-Chain (Pinocchio)

- **Wallet** — PDA `["wallet", name]`, holds proposer/approver lists, thresholds
- **Vault** — PDA `["vault", wallet]`, holds program authority and assets
- **Intent** — PDA `["intent", wallet, index]`, byte_pool with full CPI definition
- **Proposal** — PDA `["proposal", intent, index]`, approval bitmap, params_data

Instruction discriminators: 0-4 (wallet lifecycle), 10-12 (propose/approve/cancel), 20 (execute), 30 (cleanup), 228 (emit event).

### Signing Flow

Signers approve via `signMessage` (not `signTransaction`). The Ledger displays human-readable text:
```
expires 2026-04-10 12:00:00: approve add market 5 with oracle 9abc...def
| wallet: drift-governance proposal: 42
```

The program reconstructs the message from on-chain state and verifies the ed25519 signature via the precompile.

### SDK Modules

- `IntentGenerator` — Anchor IDL -> intent definitions
- `VerificationEngine` — Tier 1 (known programs) + Tier 2 (IDL structural)
- `IntentSigner` — ed25519 message envelope construction
- `LucidWallet` — wallet interface, account discovery

### Dashboard

- **Home** — wallet search + demo wallets
- **Constitution** (`/wallet/:address`) — intent list with risk badges
- **Proposals** (`/wallet/:address/proposals`) — propose, approve, cancel, execute
- Ledger WebHID signing for proposals (V0 off-chain envelope)
- Wallet adapters: Phantom, Backpack, Solflare

## Key Dependencies

| Component | Key Deps |
|-----------|----------|
| Program | pinocchio 0.11, pinocchio-system 0.6, shank 0.4 |
| Tests | litesvm 0.11 (with precompiles), ed25519-dalek 2.1 |
| CLI | clap 4, solana-sdk 2.2, solana-client 2.2 |
| SDK | @solana/kit ^2.0.0, vitest, tsup |
| Dashboard | react 18, @solana/kit ^6.8.0, @solana/react ^6.8.0, @ledgerhq/hw-app-solana ^7.10.0 |

## Spec

Full specification: `LUCID_SPEC.md` (account layouts, instruction data, message format, verification engine, competitive positioning, revenue model).

## Conventions

- All account structs use `#[repr(C)]` for deterministic memory layout
- Variable-length data uses byte_pool pattern (offset/length pairs into single buffer)
- PDA seeds use wallet name directly (not hashed), max 32 bytes
- Meta-intents (indexes 0-2) are auto-created on wallet creation: add/remove/update
- Risk levels: LOW, MEDIUM, HIGH, CRITICAL — auto-classified from instruction semantics
- Timelocks are per-intent, measured from approval threshold time (not proposal creation)
