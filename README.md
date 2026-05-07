# Lucid

**Human-readable multisig.** Read what you sign.

## The Problem

Multisig signers on Solana approve transactions their hardware wallet can't read. The Ledger throws a "blind signing" warning and asks you to accept the risk — so trust falls back to the multisig UI. When that UI is compromised, the hardware wallet you bought as your trust anchor offers zero protection.

## The Stakes

**$2 billion stolen in 18 months across four multisig hacks. Every one used hardware wallets. Every one, the wallet couldn't read what was being signed.**

| Hack | Date | Loss | Mechanic |
|------|------|------|----------|
| **Bybit** | Feb 2025 | $1.46B | Lazarus pushed malicious JS into Safe's frontend; signers' Ledgers blind-signed a `delegatecall` the UI hid as a 30,000 ETH transfer |
| **Drift** | Apr 2026 | $285M | DPRK social-engineered Squads multisig signers into pre-signing durable-nonce governance transactions they couldn't fully verify on hardware |
| **WazirX** | Jul 2024 | $235M | Liminal-managed Safe UI displayed one transaction; signers approved another that swapped the implementation for a malicious contract |
| **Radiant** | Oct 2024 | $50M | Malware showed a routine config change while hardware wallets signed `transferOwnership` on the lending pool |

The pattern doesn't change until the wallet itself can read the transaction.

## The Solution

Lucid is the human-readable multisig. Wallets define a ruleset of allowed operations (intents) upfront, and each intent carries a plain-English template the Ledger renders natively via `signMessage`. The on-chain program reconstructs the exact message from the intent definition and proposal parameters, then verifies the ed25519 signature against it — if anything is tampered between proposal and signing, the signature won't match and the program rejects it. No blind signing, no UI as your last line of defense — you only need to trust the hardware wallet.

The Ledger displays the actual action in plain text:

```
approve add market 5 with oracle 9abc...def | wallet: drift-governance (Drft9...PDA); proposal: #42; expires: 10 Apr 2026 12:00:00
```

## Why Lucid

- **Plain-English signing on device** — Signers approve via `signMessage`. The wallet renders the action as text — on a hardware wallet, on the device itself, outside any compromised host.
- **Intent verification engine** — Tier 1 (known programs) + Tier 2 (Anchor IDL structural checks) validate every intent definition before it reaches the chain, catching swapped discriminators, stripped signers, faked instruction names, and retyped parameters
- **Auto-generated intents** — Feed an Anchor IDL, get complete intent definitions with risk classification (CRITICAL/HIGH/MEDIUM/LOW), automatic timelocks, parameter constraints, and named human-readable templates
- **Full dashboard** — Ruleset browser, proposal tracking, approval bitmaps, timelock countdowns, and direct Ledger WebHID signing — no wallet-adapter middlemen
- **TypeScript SDK** — Intent generation, structural verification, signing envelope construction, wallet interface
- **Pinocchio on-chain program** — Zero-copy accounts, 11 instructions, mainnet-ready on stable toolchain
- **On-chain tamper detection** — Program reconstructs the expected message from state and verifies the ed25519 signature; tampering → signature mismatch → reject. Sub-cent verification cost via Solana's native ed25519 precompile.

## How It Works

### Without Lucid (every multisig today)
1. Squads or Realms proposal created with raw instruction bytes
2. Signer's Ledger shows: `Blind signing ahead — Accept risk?` then a message hash + fee payer
3. Signer falls back to trusting what the multisig UI claims the transaction does
4. Compromised UI can show "add market" while the Ledger signs "change admin"

### With Lucid
1. Protocol creates wallet with verified intents auto-generated from their IDL
2. Proposer signs human-readable message on Ledger: `"propose add market 5 with oracle 9abc..."`
3. Approver reads on Ledger: `"approve add market 5 with oracle 9abc..."` — APPROVES
4. Attack: Ledger shows `"approve change admin authority to 3mR...xyz"` — REJECTS

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────────┐
│  Program IDL │────>│ Intent       │────>│ Verification      │
│  (JSON)      │     │ Generator    │     │ Engine (Tier 1+2) │
└─────────────┘     └──────────────┘     └───────────────────┘
                                                   │
                                            verified intents
                                                   │
                           ┌───────────────────────v───────────────────────┐
                           │  On-Chain Wallet (Pinocchio)                  │
                           │  name, proposers, approvers, threshold        │
                           │                                               │
                           │  Intent[0]: "change admin to {new_admin}"     │
                           │  Intent[1]: "withdraw {amount} to {dest}"     │
                           │  ...                                          │
                           │                                               │
                           │  Vault PDA ── holds program authority         │
                           └───────────────────────────────────────────────┘
                                                   │
                    propose (signMessage on Ledger) │ approve (signMessage)
                                                   │
                           ┌───────────────────────v───────────────────────┐
                           │  Proposal                                     │
                           │  ed25519 signature verification               │
                           │  approval bitmap → threshold → timelock       │
                           │  → execute via CPI from vault PDA             │
                           └───────────────────────────────────────────────┘
```

## Components

| Component | Description |
|-----------|-------------|
| `programs/lucid/` | On-chain Pinocchio program — 11 instructions, zero-copy accounts |
| `sdk/` | TypeScript SDK — intent generation, verification, signing |
| `dashboard/` | React web UI — ruleset browser, proposals, Ledger signing |
| `cli/` | Rust CLI — wallet management, intent generation, verification, governance |
| `demo/` | End-to-end demo with crowdfunding protocol |

## Quick Start

### Build

```bash
# On-chain program
cargo build-sbf --manifest-path programs/lucid/Cargo.toml

# CLI
cargo build -p lucid-cli

# SDK
npm run build --prefix sdk

# Dashboard
npm run build --prefix dashboard
```

### Test

```bash
bash test.sh    # Runs all 11 checks (217 tests across program / CLI / SDK / dashboard)
```

### Demo

```bash
# Terminal 1: local validator
solana-test-validator \
  --bpf-program LUC5TbUhLpT2dZuC2qA4vMZdxJXsbcsUVejTqLJBJWR target/deploy/lucid.so \
  --reset

# Terminal 2: run demo
bash demo/run.sh

# Terminal 3: dashboard (optional)
npm run dev --prefix dashboard
```

The demo generates intents from a crowdfunding IDL, runs tamper detection (5 attack scenarios), creates a 2-of-3 multisig wallet, registers intents with risk-based timelocks, and audits on-chain state.

## Program ID

`LUC5TbUhLpT2dZuC2qA4vMZdxJXsbcsUVejTqLJBJWR`

## License

Built for the Colosseum Frontier Hackathon.
