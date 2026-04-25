# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Lucid
**Updated:** 2026-04-25
**Category:** Security / Crypto Governance
**Style:** Muted Security (single-accent emerald on neutral black)

---

## Global Rules

### Color Palette

| Role | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Primary | `#059669` | `emerald-600` | Accent, verified states, CTAs, actions |
| Primary Light | `#10B981` | `emerald-500` | Hover states, gradient endpoints |
| Background | `#141414` | `neutral-950` | Page background |
| Surface 1 | `#1A1A1A` | `neutral-900` | Intermediate surface |
| Surface 2 | `#1E1E1E` | `neutral-800` | Cards, modals |
| Surface 3 | `#262626` | `neutral-750` | Nested content inside cards |
| Text | `#F0F0F0` | `neutral-100` | Primary text |
| Muted | `#A3A3A3` | `neutral-400` | Secondary text |

**Single-accent system:** Emerald is the only brand color. All interactive elements, status indicators, and CTAs use emerald. No blue in the brand.

### Semantic Colors (do not change)

| State | Color | Usage |
|-------|-------|-------|
| Warning/Unverified | `amber-400` | Attention needed, unverified intents, signing prompts |
| Error/Cancel | `red-400` | Errors, cancelled proposals, tampered data |
| Success/Verified | `emerald-400` | Verified intents, approved actions, confirmed txns |
| Danger/Critical | `red-500` | Critical risk, destructive actions |
| High Risk | `orange-400` | High-risk intents |
| Medium Risk | `yellow-400` | Medium-risk intents |

### Typography

- **Heading Font:** Orbitron
- **Body Font:** Exo 2
- **Mono Font:** JetBrains Mono
- **Google Fonts:** [Orbitron + Exo 2 + JetBrains Mono](https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap)

### Surface Layering

Use progressively lighter neutrals for depth:

```
Page background (neutral-950)
  └── Card (neutral-800)
        └── Nested content (neutral-750)
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `shadow-glow-green` | `0 0 20px rgba(5, 150, 105, 0.15)` | Primary glow |
| `shadow-glow-green-lg` | `0 0 40px rgba(5, 150, 105, 0.2)` | Large primary glow |

---

## Component Specs

### Buttons

```css
/* Primary CTA Button */
.btn-primary {
  background: linear-gradient(to right, #059669, #10B981);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #059669;
  border: 2px solid #059669;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #1E1E1E;
  border-radius: 12px;
  padding: 24px;
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  transform: translateY(-2px);
}

/* Nested content inside a card */
.card-nested {
  background: #262626;
  border-radius: 8px;
  padding: 16px;
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #404040;
  border-radius: 8px;
  font-size: 16px;
  background: #141414;
  color: #F0F0F0;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #059669;
  outline: none;
  box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.2);
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.modal {
  background: #1E1E1E;
  border-radius: 16px;
  padding: 32px;
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Muted Security — single emerald accent

**Keywords:** Dark grey, warm black, security green, enterprise, infrastructure

**Best For:** Security tools, governance dashboards, signing workflows, multisig interfaces

**Key Effects:** Subtle green glow (text-shadow: 0 0 10px), dark transitions, high readability, visible focus rings

### Color Language

- **Emerald** = Everything intentional: CTAs, verified states, active states, actions, navigation
- **Amber** = Warning only (unverified, pending attention)
- **Red** = Error/cancel/critical risk
- **Orange/Yellow** = Risk badges (high/medium)
- **Neutral greys** = Structure, text, borders

---

## Anti-Patterns (Do NOT Use)

- ❌ Light backgrounds
- ❌ Navy/blue-tinted backgrounds (use neutral grey)
- ❌ Blue as brand or CTA color (emerald only)
- ❌ Gold/amber as brand accent (reserved for semantic warnings only)
- ❌ Purple/violet
- ❌ Emojis as icons — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ Missing cursor:pointer on clickable elements
- ❌ Layout-shifting hovers (avoid scale transforms that shift layout)
- ❌ Low contrast text — maintain 4.5:1 minimum contrast ratio
- ❌ Instant state changes — always use transitions (150-300ms)
- ❌ Invisible focus states

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
- [ ] Emerald used for all brand accents (no blue)
- [ ] Amber reserved for semantic warnings only
- [ ] Nested content uses neutral-750 for depth
