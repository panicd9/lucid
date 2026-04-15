#!/usr/bin/env bash
set -euo pipefail

# solana-test-validator \
#   --bpf-program LUC5TbUhLpT2dZuC2qA4vMZdxJXsbcsUVejTqLJBJWR target/deploy/lucid.so \
#   --bpf-program Ab1nTbMuFjcfoRJWWAdxPAVotYz2kzPxS18Yzie2iiQt demo/crowdfunding_programs/crowdfunding.so \
#   --bpf-program 2hNiHwyEh9VJaBKdKAPhw1c9q6wcc5Jgmc1YBTbPNr8M demo/crowdfunding_programs/issuance.so \
#   --bpf-program 6N4KJsm6TPooxvGMrp8PVLXXcp5vMEZJpffzRS29rG6h demo/crowdfunding_programs/rwa_transfer_hook.so \
#   --reset


# Lucid Demo Script — runs on solana-test-validator
#
# Prerequisites:
#   1. cargo build-sbf --manifest-path programs/lucid/Cargo.toml
#   2. solana-test-validator --bpf-program LUC5TbUhLpT2dZuC2qA4vMZdxJXsbcsUVejTqLJBJWR target/deploy/lucid.so --reset
#   3. npm run dev --prefix dashboard        (optional, keep running in another terminal)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$ROOT/demo"
WALLETS="$DEMO/wallets"
KEYPAIR="${KEYPAIR:-$HOME/.config/solana/id.json}"
RPC="http://127.0.0.1:8899"
LUCID="cargo run -q -p lucid-cli --"
# Fixed create key so treasury wallet PDA is deterministic across runs
TREASURY_CREATE_KEY="uKJfh8tGiWcaCVSysUeny6DrT4Rz4xyYtG8hYWTXxQA"

# Generate demo wallet keypairs if missing
mkdir -p "$WALLETS"
for i in 1 2 3 4 5; do
  if [ ! -f "$WALLETS/wallet$i.json" ]; then
    solana-keygen new --no-bip39-passphrase -o "$WALLETS/wallet$i.json" --force 2>/dev/null
  fi
done

PAYER=$(solana address -k "$KEYPAIR")
WALLET1=$(solana address -k "$WALLETS/wallet1.json")
WALLET2=$(solana address -k "$WALLETS/wallet2.json")
WALLET3=$(solana address -k "$WALLETS/wallet3.json")
WALLET4=$(solana address -k "$WALLETS/wallet4.json")
WALLET5=$(solana address -k "$WALLETS/wallet5.json")

echo ""
echo "============================================"
echo "  Lucid Demo — Intent-Based Multisig"
echo "============================================"
echo ""
echo "  Payer:    $PAYER"
echo "  Wallet 1: $WALLET1"
echo "  Wallet 2: $WALLET2"
echo "  Wallet 3: $WALLET3"
echo "  Wallet 4: $WALLET4"
echo "  Wallet 5: $WALLET5"
echo "  RPC:      $RPC"
echo ""

# Fund payer if needed
BALANCE=$(solana balance -k "$KEYPAIR" --url "$RPC" 2>/dev/null | awk '{print $1}')
if (( $(echo "$BALANCE < 5" | bc -l 2>/dev/null || echo 1) )); then
  echo "  Airdropping SOL to payer..."
  solana airdrop 10 --url "$RPC" -k "$KEYPAIR" 2>/dev/null || true
  echo ""
fi

# Fund approver wallets (they need SOL for tx fees when signing approvals)
for i in 1 2 3 4 5; do
  WK="$WALLETS/wallet$i.json"
  BAL=$(solana balance -k "$WK" --url "$RPC" 2>/dev/null | awk '{print $1}')
  if (( $(echo "$BAL < 1" | bc -l 2>/dev/null || echo 1) )); then
    solana airdrop 2 --url "$RPC" -k "$WK" 2>/dev/null || true
  fi
done

# Clean up tampered intents from previous runs
rm -f "$DEMO/intents"/*_TAMPERED.json

# Build once upfront to avoid repeated compile output
cargo build -q -p lucid-cli

# ────────────────────────────────────────────────
# Step 1: Generate intents from Campfire IDL
# ────────────────────────────────────────────────
echo "── Step 1: Generate intents from Campfire crowdfunding IDL"
echo ""
$LUCID generate \
  --idl "$DEMO/crowdfunding.json" \
  --output "$DEMO/intents"
echo ""

# ────────────────────────────────────────────────
# Step 2: Verify intents (Tier 1 + Tier 2)
# ────────────────────────────────────────────────
echo "── Step 2: Verify intents (Tier 1 + Tier 2)"
echo ""
$LUCID verify \
  --intents "$DEMO/intents" \
  --idl "$DEMO/crowdfunding.json"
echo ""

# ────────────────────────────────────────────────
# Step 2b: Tamper detection demo
# ────────────────────────────────────────────────
echo "── Step 2b: Tamper detection — what if someone modifies intents?"
echo ""

python3 -c "
import json

# --- Attack 1: Swap discriminator (call wrong instruction) ---
with open('$DEMO/intents/deposit.json') as f:
    t = json.load(f)
t['discriminator'] = [0,0,0,0,0,0,0,0]
t['riskLevel'] = 'LOW'
t['timelockSeconds'] = 0
with open('$DEMO/intents/deposit_TAMPERED.json', 'w') as f:
    json.dump(t, f, indent=2)

# --- Attack 2: Remove signer requirement (anyone can call) ---
with open('$DEMO/intents/withdraw.json') as f:
    t = json.load(f)
for acct in t['accounts']:
    if acct['isSigner']:
        acct['isSigner'] = False
        acct['writable'] = False
with open('$DEMO/intents/withdraw_TAMPERED.json', 'w') as f:
    json.dump(t, f, indent=2)

# --- Attack 3: Fake instruction name (hide real action) ---
with open('$DEMO/intents/propose_admin.json') as f:
    t = json.load(f)
t['instructionName'] = 'view_stats'
t['riskLevel'] = 'LOW'
t['timelockSeconds'] = 0
t['template'] = 'view pool statistics'
with open('$DEMO/intents/view_stats_TAMPERED.json', 'w') as f:
    json.dump(t, f, indent=2)

# --- Attack 4: Strip accounts to bypass checks ---
with open('$DEMO/intents/close_deposits.json') as f:
    t = json.load(f)
t['accounts'] = t['accounts'][:1]
with open('$DEMO/intents/close_deposits_TAMPERED.json', 'w') as f:
    json.dump(t, f, indent=2)

# --- Attack 5: Change param types (reinterpret data) ---
with open('$DEMO/intents/create_pool.json') as f:
    t = json.load(f)
for p in t['params']:
    if p['paramType'] == 'u64':
        p['paramType'] = 'u8'
with open('$DEMO/intents/create_pool_TAMPERED.json', 'w') as f:
    json.dump(t, f, indent=2)
"

echo "  Created 5 tampered intents:"
echo "    1. deposit_TAMPERED        — swapped discriminator + downgraded risk"
echo "    2. withdraw_TAMPERED       — removed signer requirements"
echo "    3. view_stats_TAMPERED     — propose_admin disguised as 'view_stats'"
echo "    4. close_deposits_TAMPERED — stripped accounts to bypass checks"
echo "    5. create_pool_TAMPERED    — changed param types to reinterpret data"
echo ""
echo "  Running verify on all intents (including tampered)..."
echo ""

$LUCID verify \
  --intents "$DEMO/intents" \
  --idl "$DEMO/crowdfunding.json" || true

echo ""
echo "  Tampered intents left in demo/intents/ for inspection."
echo ""

# ────────────────────────────────────────────────
# Step 3: Create a multisig wallet
# ────────────────────────────────────────────────
echo "── Step 3: Create 'treasury' multisig wallet (2-of-3)"
echo ""
CREATE_OUTPUT=$($LUCID wallet create \
  --name treasury \
  --proposers "$PAYER,$WALLET1" \
  --approvers "$WALLET1,$WALLET2,$WALLET3" \
  --approval-threshold 2 \
  --cancellation-threshold 1 \
  --create-key "$TREASURY_CREATE_KEY" \
  --keypair "$KEYPAIR" \
  --url "$RPC" 2>&1)
echo "$CREATE_OUTPUT"

WALLET_ADDR=$(echo "$CREATE_OUTPUT" | grep "Wallet:" | head -1 | awk '{print $2}')
echo ""
echo "  Wallet address: $WALLET_ADDR"
echo ""

# ────────────────────────────────────────────────
# Step 4: Add intents with different approver sets
# ────────────────────────────────────────────────
echo "── Step 4: Add intents with varying approver sets"
echo ""

echo "  [HIGH]     SOL transfer          — 2-of-3 (W1, W2, W3)"
$LUCID wallet add-intents \
  --wallet "$WALLET_ADDR" \
  --intent "$DEMO/intents/sol_transfer.json" \
  --approvers "$WALLET1,$WALLET2,$WALLET3" \
  --approval-threshold 2 \
  --keypair "$KEYPAIR" \
  --url "$RPC"
echo ""

echo "  [HIGH]     SPL transfer          — 2-of-3 (W1, W2, W3)"
$LUCID wallet add-intents \
  --wallet "$WALLET_ADDR" \
  --intent "$DEMO/intents/spl_transfer.json" \
  --approvers "$WALLET1,$WALLET2,$WALLET3" \
  --approval-threshold 2 \
  --keypair "$KEYPAIR" \
  --url "$RPC"
echo ""

echo "  [MEDIUM]   initialize_global_config — 1-of-2 (W1, W2)"
$LUCID wallet add-intents \
  --wallet "$WALLET_ADDR" \
  --intent "$DEMO/intents/initialize_global_config.json" \
  --approvers "$WALLET1,$WALLET2" \
  --approval-threshold 1 \
  --keypair "$KEYPAIR" \
  --url "$RPC"
echo ""

echo "  [LOW]      create_pool           — 1-of-2 (W1, W2)"
$LUCID wallet add-intents \
  --wallet "$WALLET_ADDR" \
  --intent "$DEMO/intents/create_pool.json" \
  --approvers "$WALLET1,$WALLET2" \
  --approval-threshold 1 \
  --keypair "$KEYPAIR" \
  --url "$RPC"
echo ""

echo "  [HIGH]     deposit               — 3-of-5 (W1, W2, W3, W4, W5)"
$LUCID wallet add-intents \
  --wallet "$WALLET_ADDR" \
  --intent "$DEMO/intents/deposit.json" \
  --approvers "$WALLET1,$WALLET2,$WALLET3,$WALLET4,$WALLET5" \
  --approval-threshold 3 \
  --keypair "$KEYPAIR" \
  --url "$RPC"
echo ""

echo "  [HIGH]     withdraw              — 3-of-5 (W1, W2, W3, W4, W5)"
$LUCID wallet add-intents \
  --wallet "$WALLET_ADDR" \
  --intent "$DEMO/intents/withdraw.json" \
  --approvers "$WALLET1,$WALLET2,$WALLET3,$WALLET4,$WALLET5" \
  --approval-threshold 3 \
  --keypair "$KEYPAIR" \
  --url "$RPC"
echo ""

echo "  [CRITICAL] propose_admin         — 2-of-2 (W1, W4)"
$LUCID wallet add-intents \
  --wallet "$WALLET_ADDR" \
  --intent "$DEMO/intents/propose_admin.json" \
  --approvers "$WALLET1,$WALLET4" \
  --approval-threshold 2 \
  --keypair "$KEYPAIR" \
  --url "$RPC"
echo ""

echo "  [CRITICAL] accept_admin          — 2-of-2 (W1, W4)"
$LUCID wallet add-intents \
  --wallet "$WALLET_ADDR" \
  --intent "$DEMO/intents/accept_admin.json" \
  --approvers "$WALLET1,$WALLET4" \
  --approval-threshold 2 \
  --keypair "$KEYPAIR" \
  --url "$RPC"
echo ""

# ────────────────────────────────────────────────
# Step 5: Show wallet state
# ────────────────────────────────────────────────
echo "── Step 5: Show wallet state"
echo ""
$LUCID wallet show \
  --wallet "$WALLET_ADDR" \
  --url "$RPC"
echo ""

echo "============================================"
echo "  Dashboard: http://localhost:5173"
echo "  Paste wallet address: $WALLET_ADDR"
echo "============================================"
echo ""
