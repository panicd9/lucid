# Lucid — X (Twitter) Header Brief

**Deliverable:** 1500 × 500 PNG/JPG (3:1), <2MB. RGB.
**Visual reference (mockup):** `../x-header.html` — open in a browser to see the intended composition. This is a starting point, not a constraint.

---

## Concept

One sentence: **Blind hex hash → human-readable approval.** That transformation IS the product, so the header should communicate it visually.

Lucid is a Solana multisig where signers read what they approve on the hardware wallet itself — instead of a 64-character hex blob with a "blind signing" warning. The header should make that contrast feel obvious in <1 second.

**Tone:** Quiet, confident, security-grade. Not playful, not corporate, not "web3-purple." Think Linear / Vercel / Stripe Atlas — but darker and more deliberate. Closer to a terminal than a marketing site.

**Avoid:** glassmorphism stock textures, abstract blockchain mesh, generic key/lock icons, neon, gradients beyond a single emerald glow, any second accent color.

---

## Brand tokens (source of truth: `/design-system/lucid/MASTER.md`)

### Colors — single-accent emerald system

| Role | Hex | Notes |
|------|-----|-------|
| Background | `#141414` | Page base |
| Surface 1 | `#1A1A1A` | |
| Surface 2 | `#1E1E1E` | Card backgrounds |
| Surface 3 | `#262626` | Nested |
| Primary | `#10B981` | The ONLY brand accent. Use sparingly. |
| Primary deep | `#059669` | Gradient endpoint / pressed states |
| Text | `#F0F0F0` | |
| Muted | `#A3A3A3` | Secondary copy |
| Danger (rare) | `#EF4444` | Reserved for "blind signing" / hex backdrop tint only — not a brand color |

No blue. No purple. No second accent.

### Typography

- **Display / brand:** Inter — weights 500, 600, 700, 800
- **Mono / signing display:** JetBrains Mono — 400, 500, 600
- Inter: tight tracking on display sizes (`-0.02em`)
- The wordmark `LUCID` is set in Inter 800, letter-spacing `+0.02em` (slightly opened up — this is intentional)

> Note: the `MASTER.md` design system lists Orbitron + Exo 2, but the project switched to Inter across the deck, dashboard, and submission (commit `dc5717a`). **Use Inter.** That doc is being updated.

---

## X header constraints

X overlays the avatar at the **bottom-left** and crops differently across mobile/desktop. Treat as:

- **Safe zone (no critical content):** bottom-left ~320×320 area — covered by avatar
- **Mobile crop:** the horizontal middle band is most reliably visible; top and bottom edges may be cropped on some clients
- **Bio sits below the image** (off-canvas), so don't put your tagline at the very bottom expecting it to read alongside the bio
- **Right ⅔ of the canvas** carries the most visual weight

---

## Suggested composition (open to interpretation)

Two-pane logic:

1. **Left third:** brand block — `LUCID` wordmark, tagline, accent bar. Padded inward so the avatar doesn't collide.
2. **Right two-thirds:** the unique element — a Ledger-style clear-signing display showing what a signer actually sees on the device. Use the SVG provided (`signing-card.svg`) as a starting point; restyle freely.
3. **Background:** dim red hex hashes fading left-to-right under a soft emerald glow on the right. Subtle (5–8% opacity for the hash). It's a texture, not a focal element.
4. **Optional top-right:** small mono caption like `SOLANA · CLEAR-SIGNING` with an emerald dot.

The designer is welcome to restructure entirely — but the **before/after of blind hex vs. human-readable approval** should survive.

---

## Copy

- **Wordmark:** `LUCID`
- **Tagline (primary):** Human-readable multisig.
- **Tagline (alt, longer):** Signers read what they approve — on the device itself.
- **Approval message (for the signing-card mock):**
  ```
  approve transfer 1,000 USDC to ops-treasury
  wallet     dao-governance · 7Hk2…PDA
  proposal   #42
  expires    10 Apr 2026 12:00:00 UTC
  ```
  Use generic placeholder names only. **Do not reference real protocols** (Drift, Squads, Bybit, etc.) — given those are recent hack victims, naming them in marketing reads as mocking.

---

## Assets in this folder

| File | What it is |
|------|------------|
| `brief.md` | This file |
| `signing-card.svg` | Editable vector of the Ledger signing display. Open in Figma/Illustrator. |
| `../x-header.html` | Working HTML mockup at exact 1500×500 — open in a browser as a visual reference |
| `../../design-system/lucid/MASTER.md` | Full brand system (deeper reference) |

---

## Out-of-scope variations (only if there's time)

- Square avatar variant (400×400) using just the wordmark + emerald dot
- LinkedIn banner (1584×396)
- OG image (1200×630)
