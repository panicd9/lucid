#!/usr/bin/env bash
set -euo pipefail

# Lucid Demo Script — runs on Surfpool (localhost:8899)
#
# Prerequisites:
#   1. cargo build-sbf --manifest-path programs/lucid/Cargo.toml
#   2. cd programs/lucid && surfpool start   (keep running in another terminal)
#   3. npm run dev --prefix dashboard        (keep running in another terminal)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$ROOT/demo"
WALLETS="$DEMO/wallets"
KEYPAIR="${KEYPAIR:-$HOME/.config/solana/id.json}"
RPC="http://127.0.0.1:8899"

# Demo wallets (pre-generated, gitignored)
PAYER=$(solana address -k "$KEYPAIR")
WALLET1=$(solana address -k "$WALLETS/wallet1.json")
WALLET2=$(solana address -k "$WALLETS/wallet2.json")
WALLET3=$(solana address -k "$WALLETS/wallet3.json")
WALLET4=$(solana address -k "$WALLETS/wallet4.json")
WALLET5=$(solana address -k "$WALLETS/wallet5.json")

echo "============================================"
echo "  Lucid Demo — Intent-Based Multisig"
echo "============================================"
echo ""
echo "Payer:    $PAYER"
echo "Wallet 1: $WALLET1"
echo "Wallet 2: $WALLET2"
echo "Wallet 3: $WALLET3"
echo "Wallet 4: $WALLET4"
echo "Wallet 5: $WALLET5"
echo "RPC:      $RPC"
echo ""

# ── Step 1: Generate intents from Campfire IDL ──────────────
echo "── Step 1: Generate intents from Campfire crowdfunding IDL"
cargo run -p lucid-cli -- generate \
  --idl "$DEMO/crowdfunding.json" \
  --output "$DEMO/intents"
echo ""

# ── Step 2: Verify intents (Tier 1 + Tier 2) ───────────────
echo "── Step 2: Verify intents (Tier 1 + Tier 2)"
cargo run -p lucid-cli -- verify \
  --intents "$DEMO/intents" \
  --idl "$DEMO/crowdfunding.json"
echo ""

# ── Step 3: Create a multisig wallet ────────────────────────
echo "── Step 3: Create 'treasury' multisig wallet (2-of-3)"
CREATE_OUTPUT=$(cargo run -p lucid-cli -- wallet create \
  --name treasury \
  --proposers "$PAYER" \
  --approvers "$WALLET1,$WALLET2,$WALLET3" \
  --approval-threshold 2 \
  --cancellation-threshold 1 \
  --keypair "$KEYPAIR" \
  --url "$RPC" 2>/dev/null)
echo "$CREATE_OUTPUT"

# Extract wallet address from create output
WALLET_ADDR=$(echo "$CREATE_OUTPUT" | grep "Wallet:" | head -1 | awk '{print $2}')
echo "  → Wallet address: $WALLET_ADDR"
echo ""

# ── Step 4: Add intents to the wallet ───────────────────────
echo "── Step 4: Add intents to wallet $WALLET_ADDR"
cargo run -p lucid-cli -- wallet add-intents \
  --wallet "$WALLET_ADDR" \
  --intents "$DEMO/intents" \
  --keypair "$KEYPAIR" \
  --url "$RPC"
echo ""

# ── Step 5: Show wallet state ──────────────────────────────
echo "── Step 5: Show wallet state"
cargo run -p lucid-cli -- wallet show \
  --wallet "$WALLET_ADDR" \
  --url "$RPC"
echo ""

echo "============================================"
echo "  Dashboard: http://localhost:5173"
echo "  Paste wallet address: $WALLET_ADDR"
echo "  Surfpool Studio: http://localhost:18488"
echo "============================================"
