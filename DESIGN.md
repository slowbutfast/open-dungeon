---
version: "1.0"
name: "OpenDungeon"
license: "Apache-2.0"
brand: "Retro terminal cyberpunk — Infocom-era text adventure meets neon CRT monitor"
colors:
  background: "#07090d"
  surface: "rgba(13, 20, 30, 0.45)"
  surfaceElevated: "rgba(7, 9, 13, 0.6)"
  border: "rgba(56, 189, 248, 0.2)"
  borderHover: "rgba(56, 189, 248, 0.6)"
  primary: "#38bdf8"
  success: "#4ade80"
  warning: "#facc15"
  error: "#ef4444"
  textPrimary: "#e0f2fe"
  textSecondary: "rgba(224, 242, 254, 0.45)"
  textLog: "#4ade80"
  textLogDim: "rgba(74, 222, 128, 0.75)"
  accentPurple: "#a855f7"
  accentYellow: "#eab308"
  accentRose: "#f43f5e"
typography:
  display:
    fontFamily: "'VT323', monospace"
    fontSize: "3rem"
    fontWeight: 400
    letterSpacing: "2px"
  headline:
    fontFamily: "'VT323', monospace"
    fontSize: "2.2rem"
    fontWeight: 400
  sectionTitle:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "1rem"
    fontWeight: 700
  body:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "0.82rem"
    fontWeight: 400
  label:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "0.72rem"
    fontWeight: 500
    letterSpacing: "0.05em"
    textTransform: "uppercase"
rounded:
  sm: "3px"
  md: "4px"
  lg: "6px"
  pill: "12px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1.25rem"
  xl: "1.5rem"
  xxl: "2rem"
elevation:
  panel: "0 8px 32px 0 rgba(0, 0, 0, 0.37)"
  glow: "0 0 10px rgba(56, 189, 248, 0.3)"
  glowStrong: "0 0 15px rgba(56, 189, 248, 0.45)"
  textGlow: "0 0 5px rgba(56, 189, 248, 0.4)"
---

## Overview

OpenDungeon is a retro-terminal, CRT-aesthetic text adventure interface. The visual language evokes 1980s Infocom mainframe terminals filtered through a cyberpunk neon lens. Dense information display, phosphor-green narration text, cyan UI chrome, and persistent scanline overlays create an immersive "hacking into a dungeon" atmosphere.

The interface prioritizes readability of long-form narrative text while maintaining a compact, information-dense layout. Glassmorphism panels with backdrop blur sit over a near-black background. All interactive elements glow on hover, reinforcing the "live terminal" feeling.

## Colors

- **Background (#07090d):** Near-black void. Never use pure #000 — the slight blue tint keeps the CRT illusion alive.
- **Surface (rgba(13, 20, 30, 0.45)):** Glassmorphism panels with 10px backdrop blur. Semi-transparent to let the dark background bleed through.
- **Primary / Cyan (#38bdf8):** All interactive chrome — borders, focus rings, active states, headings, status bar text. This is the "terminal phosphor" color.
- **Success / Green (#4ade80):** Narrator output text, positive status indicators, completed states. Used for the main game log narration.
- **Error (#ef4444):** Destructive actions, error states, delete buttons. Always paired with a red glow box-shadow.
- **Warning (#facc15):** Mock/offline LLM status indicators.
- **Text Primary (#e0f2fe):** User input text, body copy in cards. Slightly cool-tinted white, never pure #fff.
- **Text Secondary (rgba(224, 242, 254, 0.45)):** Muted labels, placeholders, inactive elements. Use at 45% opacity of text primary.
- **Lore Badges:** Purple (#a855f7) for locations, Yellow (#eab308) for items, Rose (#f43f5e) for lore, Cyan for characters. Each badge uses 15% opacity background fill.

## Typography

- **Display (VT323):** Used exclusively for the app title "OPENDUNGEON" and panel headers. 3rem with 2px letter-spacing. This is the retro terminal font — use sparingly for maximum impact.
- **Headlines (VT323):** Section headers like `[STORY GENESIS PRESETS]` and `[CHARACTER GENESIS]`. 2.2rem. Always wrapped in square brackets for the terminal aesthetic.
- **Section Titles (JetBrains Mono Bold):** Sub-section headers, card titles, tab labels. 1rem, uppercase feel via weight.
- **Body (Inter):** Narrative game text uses JetBrains Mono at 1.05rem with 1.75 line-height for the console log. UI body text uses Inter at 0.95rem.
- **Mono (JetBrains Mono):** All UI chrome — buttons, inputs, labels, log entries, status bars. This is the workhorse font. 0.72rem-0.95rem range.
- **Labels:** 0.72rem JetBrains Mono, uppercase, 0.05em letter-spacing. Used for form labels, badge text, utility buttons.

## Layout

- **Full viewport:** The app fills 100vw x 100vh with no page scroll. All scrolling happens inside panels.
- **Centered startup:** Menu screens are centered vertically/horizontally with max-width 480px (startup) or 800px (wizards).
- **Game dashboard:** Two-column grid — main console (1fr) + sidebar (340px). Collapses to single column below 768px with a fixed bottom tab bar.
- **Spacing scale:** 4px base unit. Use 0.5rem (8px) for tight gaps, 0.75rem (12px) for form groups, 1.25rem (20px) for section separation, 2rem (32px) for panel padding.
- **Grid cards:** Preset and character grids use `repeat(auto-fit, minmax(220px, 1fr))` with 1.25rem gap.

## Elevation & Depth

- **Glass panels:** `backdrop-filter: blur(10px)` with semi-transparent dark background. 1px cyan border at 20% opacity, transitioning to 60% on hover.
- **Glow states:** Interactive elements gain `box-shadow: 0 0 10px rgba(56, 189, 248, 0.3)` on hover/focus. Active states increase to 0.45 opacity.
- **Text glow:** Headings and active elements use `text-shadow: 0 0 5px rgba(56, 189, 248, 0.4)` for the phosphor CRT glow effect.
- **CRT overlay:** Scanlines (4px repeating gradient at 85% opacity) and screen flicker (subtle 0.15s animation) sit above all content at z-index 9998-9999. Toggleable via `/crt` command.
- **Modal overlay:** Dark backdrop at 70% opacity with 4px blur. Modals themselves are glass panels.

## Shapes

- **Buttons:** 4px border-radius (`rounded.md`). Sharp enough to feel terminal-like, soft enough to not look broken.
- **Cards:** 6px border-radius (`rounded.lg`) for preset cards, character cards, save items.
- **Inputs:** 4px border-radius matching buttons.
- **Badges/Pills:** 3px border-radius (`rounded.sm`) for status pills and lore type badges.
- **Suggestion chips:** 12px border-radius (`rounded.pill`) — the only rounded element, creating visual distinction for clickable suggestions.
- **Lore cards:** 4px border-radius with optional 3px left border accent for event log cards.

## Components

### Buttons
- **Default:** Transparent background, 1px cyan border at 20% opacity, JetBrains Mono 0.9rem. Hover: 10% cyan fill, glowing border, text-shadow.
- **Primary:** Cyan border at 100%, 15% cyan fill, glow box-shadow. Hover: 30% fill, stronger glow.
- **Danger:** Red border and text. Hover: 15% red fill.
- **Utility:** No border, muted text. Hover: cyan text with glow. Active state: cyan with text-shadow.
- **Disabled:** 50% opacity, no hover effects, `cursor: not-allowed`.

### Cards (Preset, Character, Save, Lore)
- Dark surface background (40-60% opacity), 1px border at 20% opacity.
- Hover: border glows to 60%, slight `translateY(-2px)` lift, 5% cyan fill.
- Active/selected: full cyan border, glow shadow, 8% cyan fill.

### Console Log
- JetBrains Mono at 0.95rem, 1.6 line-height.
- User turns: bold, #e0f2fe (cool white).
- Assistant/narrator turns: #4ade80 (green) at 1.05rem with green text-shadow.
- System messages: cyan text on 5% cyan background with 3px left cyan border.
- Error messages: red text on 5% red background with 3px left red border.

### Status Bar
- Full-width, VT323 font at 1.3rem, cyan text with text-shadow.
- Cyan border at 100% opacity — the only element with a fully opaque border.
- Labels in muted text, values in cyan.

### Inputs
- Dark background (70% opacity), 1px border at 20% opacity.
- Focus: border glows to 60%, `box-shadow: 0 0 8px rgba(56, 189, 248, 0.3)`.
- Labels above inputs in cyan JetBrains Mono at 0.8rem.

### Tabs
- VT323 font at 1.3rem, bottom-border indicator (2px).
- Inactive: muted text. Active: cyan text with glow and cyan bottom border.

### Toast Notifications
- Fixed bottom-center, glass panel styling with cyan border.
- Green text for success, red text + red border for errors.
- Slide-up animation (translateY from 60px to 0).

## Do's and Don'ts

**DO:**
- Use square bracket wrappers for section titles (e.g., `[STORY GENESIS PRESETS]`) to maintain the terminal command aesthetic.
- Apply text-shadow glow to all cyan/primary-colored text for the CRT phosphor effect.
- Keep backgrounds semi-transparent with backdrop blur — never use solid opaque panels.
- Use JetBrains Mono for ALL UI chrome (buttons, labels, inputs, status text).
- Maintain the scanline overlay effect as a core part of the visual identity (make it toggleable, not removable).
- Use the green (#4ade80) color specifically for narrator/game output text to distinguish it from UI chrome.

**DON'T:**
- Never use pure white (#fff) for text — always use the cool-tinted #e0f2fe.
- Never use pure black (#000) for backgrounds — use #07090d.
- Don't use rounded corners larger than 6px for panels and cards (pill-shaped chips are the exception).
- Don't use solid/opaque backgrounds for panels — glassmorphism with backdrop-blur is mandatory.
- Don't use sans-serif fonts for UI chrome — only Inter for narrative body text, JetBrains Mono and VT323 for everything else.
- Don't add drop shadows — use glow (box-shadow with color, not blur-only shadows).
- Don't use gradients on backgrounds — the dark void is flat. Gradients are only used for the scanline overlay.
- Don't create colorful, playful UI — this is a dark, dense, information-rich terminal interface. Restraint is key.
