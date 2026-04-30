// Brand constants — pulled verbatim from pitch_deck/submission.html
// Keep in sync with that file's :root variables.

export const COLORS = {
  bg: "#141414",
  card: "#1E1E1E",
  card2: "#262626",
  border: "#262626",
  text: "#F0F0F0",
  muted: "#A3A3A3",
  emerald: "#10B981",
  emeraldDeep: "#059669",
  emeraldGlow: "rgba(16, 185, 129, 0.15)",
  amber: "#f59e0b",
  red: "#ef4444",
  redGlow: "rgba(239, 68, 68, 0.18)",
} as const;

// Headline / display: Orbitron 600 (numbers, hooks, section titles)
// Body / narration captions: Exo 2 400
// Code / addresses: JetBrains Mono 500
//
// NOTE: @remotion/google-fonts registers Exo 2 as "Exo Two", so we use that
// family name here. Loaded in src/fonts.ts; matches dashboard/index.html.
export const FONTS = {
  display: "Orbitron, system-ui, sans-serif",
  body: "'Exo Two', 'Exo 2', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export const FPS = 30;

// Master timing — every scene's startFrame derives from this.
// Scenes are inclusive of their own transitions; gaps are intentional.
export const SCENES = {
  hook: { start: 0, duration: 15 * FPS }, // 0:00–0:15 — 450 frames
  stakes: { start: 15 * FPS, duration: 30 * FPS }, // 0:15–0:45 — 900
  solution: { start: 45 * FPS, duration: 15 * FPS }, // 0:45–1:00 — 450
  beforeAfter: { start: 60 * FPS, duration: 40 * FPS }, // 1:00–1:40 — 1200
  liveDemo: { start: 100 * FPS, duration: 40 * FPS }, // 1:40–2:20 — 1200
  whatWeBuilt: { start: 140 * FPS, duration: 25 * FPS }, // 2:20–2:45 — 750
  close: { start: 165 * FPS, duration: 15 * FPS }, // 2:45–3:00 — 450
} as const;

export const TOTAL_DURATION = 180 * FPS; // 5400 frames @ 30fps = 180s

export const DIM_LANDSCAPE = { width: 1920, height: 1080 } as const;
