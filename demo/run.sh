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
KEYPAIR="${KEYPAIR:-$HOME/.config/solana/id.json}"
RPC="http://127.0.0.1:8899"
PAYER=$(solana address -k "$KEYPAIR")

echo "============================================"
echo "  Lucid Demo — Intent-Based Multisig"
echo "============================================"
echo ""
echo "Payer:   $PAYER"
echo "RPC:     $RPC"
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
cargo run -p lucid-cli -- wallet create \
  --name treasury \
  --proposers "$PAYER" \
  --approvers "$PAYER,$PAYER,$PAYER" \
  --approval-threshold 2 \
  --cancellation-threshold 1 \
  --keypair "$KEYPAIR" \
  --url "$RPC"
echo ""

# ── Step 4: Add intents to the wallet ───────────────────────
echo "── Step 4: Add intents to 'treasury' wallet"
cargo run -p lucid-cli -- wallet add-intents \
  --wallet treasury \
  --intents "$DEMO/intents" \
  --keypair "$KEYPAIR" \
  --url "$RPC"
echo ""

# ── Step 5: Show wallet state ──────────────────────────────
echo "── Step 5: Show wallet state"
cargo run -p lucid-cli -- wallet show \
  --wallet treasury \
  --url "$RPC"
echo ""

echo "============================================"
echo "  Dashboard: http://localhost:5173"
echo "  Select 'Localhost' network, search 'treasury'"
echo "  Surfpool Studio: http://localhost:18488"
echo "============================================"
