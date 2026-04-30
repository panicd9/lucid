# Demo Recording Shot List — `LiveDemo` scene (1:40–2:20, 40s)

This replaces the stylized `LiveDemo.tsx` mockups with real footage. Capture once, drop the file at `marketing-video/public/live-demo.mp4`, and I'll wire it in.

## Setup (~10 min)

```bash
# Terminal 1: validator + program
solana-test-validator \
  --bpf-program LUC5TbUhLpT2dZuC2qA4vMZdxJXsbcsUVejTqLJBJWR target/deploy/lucid.so \
  --reset

# Terminal 2: seed wallets + intents
bash demo/run.sh

# Terminal 3: dashboard
npm run dev --prefix dashboard
```

Then in your browser, navigate to the demo wallet (it should auto-link from `bash demo/run.sh` output).

## Recording

- **Tool**: `simplescreenrecorder` or OBS, **1920x1080**, 30fps, no audio
- **Length**: aim for 38–40s. We can trim, can't add.
- **Cursor**: hide if your tool supports it; otherwise just don't move it idly

## Shot list (40s, 4 beats × 10s each)

### Beat 1 (0–10s) — Ruleset page
- Open the demo treasury wallet
- Linger on the **intent list with risk badges** (5+ visible, mix of LOW/MEDIUM/HIGH/CRITICAL)
- Slowly scroll once to show timelock columns

**Goal:** judge sees "this is a ruleset, not free-form transactions"

### Beat 2 (10–20s) — Propose
- Click **"Propose"** on a `withdraw_treasury` (or any HIGH-risk) intent
- Show the **message preview panel** clearly (the plain-English text the Ledger will render)
- Hold on the preview for at least 3 seconds — this is the money shot

**Goal:** judge sees "what the signer will read on their device"

### Beat 3 (20–30s) — Sign
- Click **"Sign with Ledger"**
- Show the WebHID prompt → device connects (if you can capture the actual Ledger device on screen via webcam-in-frame, even better — but don't slow down to set this up)
- Approval registers, signer's checkbox flips
- Quick cut to a second signer signing (you can fake this by switching wallets — no need for two real Ledgers)

**Goal:** judge sees "approval flow uses WebHID directly, no wallet adapter middleman"

### Beat 4 (30–40s) — Execute
- Threshold-reached state: 3-of-5 ✓
- Timelock countdown clears (skip the wait by setting timelock to 0 in the demo wallet, or fast-forward in post)
- Click **"Execute"**
- Show success state: tx confirmed, audit log entry appended

**Goal:** judge sees "the program ran the CPI; this is real, not a mockup"

## After recording

Save the file as:

```
marketing-video/public/live-demo.mp4
```

Then tell me — I'll swap the stylized `LiveDemo.tsx` for the real footage in ~5 minutes.

## Fallback

If you hit a blocker (Ledger flakey, validator crashes, timelock annoying), record a 30s walk-through of just **Beats 1+2+4** (skip Sign). Even that's a massive credibility upgrade over stylized cards.

If you don't record at all by the time we lock the final cut, the stylized version stays — it's not embarrassing, just less convincing.
