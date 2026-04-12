#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
FAILURES=()

run() {
  local label="$1"
  shift
  printf "${BOLD}── %s${NC}\n" "$label"
  if "$@" 2>&1; then
    printf "${GREEN}   ✔ %s${NC}\n\n" "$label"
    PASS=$((PASS + 1))
  else
    printf "${RED}   ✘ %s${NC}\n\n" "$label"
    FAIL=$((FAIL + 1))
    FAILURES+=("$label")
  fi
}

echo ""
printf "${BOLD}╔══════════════════════════════════════╗${NC}\n"
printf "${BOLD}║      Lucid — Full Test Suite         ║${NC}\n"
printf "${BOLD}╚══════════════════════════════════════╝${NC}\n\n"

# ── 0. Build SBF binary ───────────────────────────────────────────────
printf "${YELLOW}[0/7] Build SBF binary${NC}\n"
run "cargo build-sbf" cargo build-sbf --manifest-path programs/lucid/Cargo.toml

# ── 1. On-chain program ──────────────────────────────────────────────
printf "${YELLOW}[1/7] On-chain program${NC}\n"
run "cargo check (lucid program)" cargo check -p lucid

# ── 2. Rust integration tests (LiteSVM) ──────────────────────────────
printf "${YELLOW}[2/7] Rust integration tests${NC}\n"
run "lifecycle tests"  cargo test -p lucid-tests --test lifecycle  -- --nocapture
run "proposal tests"   cargo test -p lucid-tests --test proposal   -- --nocapture
run "security tests"   cargo test -p lucid-tests --test security   -- --nocapture
run "golden vectors"   cargo test -p lucid-tests --lib             -- --nocapture

# ── 3. CLI ────────────────────────────────────────────────────────────
printf "${YELLOW}[3/7] CLI tests${NC}\n"
run "cli tests" cargo test -p lucid-cli

# ── 4. SDK ────────────────────────────────────────────────────────────
printf "${YELLOW}[4/7] SDK${NC}\n"
run "sdk typecheck" npm run types --prefix sdk
run "sdk tests"     npm test      --prefix sdk

# ── 5. Dashboard ──────────────────────────────────────────────────────
printf "${YELLOW}[5/7] Dashboard${NC}\n"
run "dashboard build" npm run build --prefix dashboard
run "dashboard tests" npm test      --prefix dashboard

# ── 6. JS client (skipped — no test files yet) ───────────────────────
printf "${YELLOW}[6/7] JS client${NC}\n"
printf "${BOLD}── js client tests${NC}\n"
printf "${YELLOW}   ⊘ skipped (no test files in clients/js/test/)${NC}\n\n"

# ── Summary ───────────────────────────────────────────────────────────
echo ""
printf "${BOLD}══════════════════════════════════════${NC}\n"
TOTAL=$((PASS + FAIL))
printf "${GREEN}  ✔ %d passed${NC}  " "$PASS"
if [ "$FAIL" -gt 0 ]; then
  printf "${RED}✘ %d failed${NC}" "$FAIL"
fi
printf "  (out of %d)\n" "$TOTAL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  printf "${RED}  Failed:${NC}\n"
  for f in "${FAILURES[@]+${FAILURES[@]}}"; do
    printf "${RED}    • %s${NC}\n" "$f"
  done
  echo ""
  exit 1
else
  echo ""
  printf "${GREEN}  All checks passed.${NC}\n\n"
fi
