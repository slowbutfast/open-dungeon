# Mobile wizard screens need responsive redesign

## Description

The startup/preset/character wizard screens (collectively "wizard screens") have significant scaling issues on mobile devices. They were designed for desktop widths but only had padding and font-size adjustments applied in the current mobile media queries. The layout, hierarchy, and interaction patterns need a mobile-first redesign.

## Current issues

### Startup screen
- `.startup-header h1` at `2rem` (mobile) is still very large for small screens and wraps awkwardly
- `.startup-header .subtitle` contains the LLM status line and the "Infocom Cyber-Link Revision 88" text — these are too wide and overflow on narrow screens
- The three menu buttons (`btn-new-game`, `btn-restore-game`, `btn-toggle-crt`) are full-width and vertically stacked, which works, but the `[1]` / `[2]` / `[T]` keyboard hint prefixes are meaningless on mobile
- `.kbd-hint` at the bottom is correctly hidden on mobile, but no touch-action alternatives exist for the functions it described

### Preset screen (`#preset-screen`)
- `.preset-grid` uses `auto-fit, minmax(220px, 1fr)` — on a 375px screen this creates a single column that is still ~355px wide (after padding), leaving card content with no breathing room
- The "Back" / "Customize Story" / "Next" footer buttons crowd the bottom and the secondary actions group wraps poorly
- Preset cards don't show the description text usefully at mobile widths
- The footer navigation has no mobile-specific layout — buttons overflow or get very small

### Character screen (`#character-screen`)
- Same grid issue as presets — `.character-grid` cards are cramped
- The "Customize Character" toggle exposes a form that was designed for desktop-width inputs
- Form labels and inputs don't scale well (`.form-group input` inherits font-size but the visual layout of label + input stacks poorly at mobile widths)

### Custom preset screen (`#custom-preset-screen`)
- The textarea for the system prompt is only `rows="8"` but takes up excessive screen real estate on mobile
- The form inputs lack sufficient touch targets for comfortable editing

### General
- No swiping/gesture interaction — all navigation is button-based
- Keyboard hints/numbers (`[1]`, `[2]`, `[T]`) shown on startup buttons, useless on mobile
- No bottom-sheet or drawer patterns that mobile users expect
- The `@media (max-width: 767px)` breakpoint is the only responsive treatment — no tablet-specific layout for the wizard flow

## Suggested approach

1. **Mobile-first wizard flow**: Redesign each wizard screen as a full-height viewport layout (not a centered card), with content scrollable and CTAs pinned to the bottom
2. **Preset/character selection**: Replace the grid with a horizontal swipeable card carousel (touch-native), or a vertical list with larger thumbnails
3. **Bottom-sheet forms**: Custom preset/character forms should appear as a bottom sheet rather than a full screen switch
4. **Remove desktop-only chrome**: Hide keyboard hints, number prefixes, and panel-border decorations on mobile
5. **Tablet breakpoint**: Add a `768px - 1023px` treatment for the wizard screens that uses a 2-column layout

## Files affected

- `web/templates/index.html` — wizard screen structure may need restructuring
- `web/static/style.css` — all wizard screen media queries
- `web/static/js/app.js` — may need touch/gesture event wiring

## Acceptance criteria

- Wizard screens are usable on a 375px-wide phone screen without horizontal overflow
- Presets and characters can be browsed with touch-friendly interaction
- Form inputs have adequate touch targets (min 44px)
- All wizard screens respect safe-area insets on notched devices
- Desktop layout (>= 1024px) is completely unchanged