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
printf "${YELLOW}[0/5] Build SBF binary${NC}\n"
run "cargo build-sbf" cargo build-sbf --manifest-path programs/lucid/Cargo.toml

# ── 1. On-chain program ──────────────────────────────────────────────
printf "${YELLOW}[1/5] On-chain program${NC}\n"
run "cargo check (lucid program)" cargo check -p lucid

# ── 3. Rust integration tests (LiteSVM) ──────────────────────────────
printf "${YELLOW}[2/5] Rust integration tests${NC}\n"
run "lifecycle tests"  cargo test -p lucid-tests --test lifecycle  -- --nocapture
run "proposal tests"   cargo test -p lucid-tests --test proposal   -- --nocapture
run "security tests"   cargo test -p lucid-tests --test security   -- --nocapture
run "golden vectors"   cargo test -p lucid-tests --lib             -- --nocapture

# ── 4. CLI ────────────────────────────────────────────────────────────
printf "${YELLOW}[3/5] CLI tests${NC}\n"
run "cli tests" cargo test -p lucid-cli

# ── 5. SDK ────────────────────────────────────────────────────────────
printf "${YELLOW}[4/5] SDK${NC}\n"
run "sdk typecheck" npm run types --prefix sdk
run "sdk tests"     npm test      --prefix sdk

# ── 6. Dashboard ──────────────────────────────────────────────────────
printf "${YELLOW}[5/5] Dashboard${NC}\n"
run "dashboard build" npm run build --prefix dashboard
run "dashboard tests" npm test      --prefix dashboard

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
