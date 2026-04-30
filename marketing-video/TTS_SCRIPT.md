# TTS Script — Main 3:00 Pitch

Generate audio per-scene, drop the .mp3 files at `marketing-video/public/audio/<sceneId>.mp3`, then I'll wire them into each scene with `<Audio>` and re-render.

## Recommended ElevenLabs config

- **Voice**: `Adam` or `Charlie` (lower register, calm — fits security positioning). Avoid bright/energetic voices.
- **Model**: `eleven_multilingual_v2`
- **Stability**: 0.55
- **Similarity boost**: 0.75
- **Style**: 0.20
- **Speaker boost**: on

Or use whatever voice you prefer — the recommendation is "calm, low, deliberate." No urgency, no hype.

## Script (verbatim from `pitch_deck/submission.html` Section 3)

The narration below is the locked script. **Do not paraphrase.** Each block maps 1:1 to a scene with the same `id` in `src/scenes/`.

---

### `hook` — 0:00–0:15 (15s, ~80 words → 320wpm)
> *Note: this is dense. ElevenLabs at default speed reads it in ~22s. To fit 15s, either trim (proposed below) or extend the scene to 22s and re-time everything.*

**Original (22s at natural pace):**
"Every multisig on Solana today — Squads, Realms, all of them — sends a transaction the hardware wallet can't read. The Ledger throws a 'blind signing' warning and asks you to accept the risk anyway. So signers fall back to trusting the multisig UI. When that UI is compromised, the hardware wallet you bought as your trust anchor offers zero protection."

**Trimmed (15s):**
"Every multisig on Solana today sends a transaction the hardware wallet can't read. The Ledger throws a blind-signing warning and asks you to accept the risk. So signers trust the UI. When the UI is compromised, the hardware wallet offers zero protection."

→ Use the trimmed version.

---

### `stakes` — 0:15–0:45 (30s)
"Two billion dollars stolen in eighteen months across four multisig hacks. Bybit, February twenty twenty-five — one point four six billion, the largest crypto theft in history. Lazarus pushed malicious JavaScript into Safe's frontend; signers' Ledgers blind-signed a delegatecall the UI hid as a thirty-thousand-ETH transfer. Drift, April twenty twenty-six — two hundred eighty-five million, the largest Solana DeFi protocol hack ever. WazirX, July twenty twenty-four — two hundred thirty-five million from India's largest exchange. Radiant, October twenty twenty-four — fifty million. Every single one used hardware wallets. Every single one, the wallet couldn't read what was being signed. The pattern doesn't change until the wallet itself can read the transaction."

---

### `solution` — 0:45–1:00 (15s)
"Lucid uses signMessage instead of signTransaction. The hardware wallet renders the action in plain English, on the device itself — outside any compromised host. The on-chain program reconstructs the expected message from state and verifies the ed25519 signature. Sub-cent cost."

---

### `beforeAfter` — 1:00–1:40 (40s)
"These are real recordings. Same Ledger device, same multisig flow. On the left — every multisig today. The device shows a blind-signing warning, asks you to override its safety check, then displays a message hash and a fee payer. You can't tell what you're signing. On the right — Lucid. The device shows the actual action in plain English. Trust moves back to the hardware wallet, where it belonged."

---

### `liveDemo` — 1:40–2:20 (40s)
"Live demo. Open the treasury wallet. The ruleset page lists every allowed intent with its risk badge and timelock. Click propose on a withdraw intent — the message preview shows exactly what the Ledger will display. Sign with the device — human-readable text on screen. Approve. Second signer approves. Threshold reached, timelock clears. Click execute. The CPI fires. Audit log captures it."

---

### `whatWeBuilt` — 2:20–2:45 (25s)
"Complete system, not a hackathon prototype. Pinocchio for performance, not Anchor. Two-tier verification engine: Tier 1 matches known program discriminators, Tier 2 does structural matching against Anchor IDLs. Two hundred seventeen tests across the stack. Twenty-two thousand lines of code across program, CLI, SDK, and dashboard. Direct Ledger WebHID signing, no wallet-adapter middlemen."

---

### `close` — 2:45–3:00 (15s)
"Lucid. Read what you sign. Built for Colosseum Frontier."

---

## How to generate

### Option A — ElevenLabs web UI (simplest)
1. Go to elevenlabs.io → Speech Synthesis
2. Pick voice (Adam or Charlie)
3. Paste each block above one at a time
4. Download as `<sceneId>.mp3`
5. Drop into `marketing-video/public/audio/`

### Option B — ElevenLabs CLI / API (faster, scriptable)
```bash
# Install once
npm install -g elevenlabs

# Set key
export ELEVENLABS_API_KEY=sk-...

# Generate per scene (script the loop yourself, voice IDs from elevenlabs dashboard)
elevenlabs tts --voice "Adam" --text "$(cat hook.txt)" --output public/audio/hook.mp3
# ...repeat for each scene
```

## After files are in place

Tell me. I'll add `<Audio src={staticFile("audio/...")}>` calls into each scene's Sequence with `startFrom={0}` and re-render the master.
