# Add a toggleable floating debug panel

## Description

The debug panel (LLM call log + system logs) is currently only accessible via the sidebar tabs (`#tab-debug`). On mobile it's a tab in the bottom bar; on desktop it's a sidebar tab. Neither approach allows quick peek-and-hide of debug info while staying in the console/main gameplay view.

A floating toggle button would let users open/close a debug overlay from any screen, on any device size, without losing their place in the console.

## Current behavior

- **Desktop**: Click `/debug` in the utility bar or the "DEBUG" sidebar tab → sidebar switches to debug tab. The console log remains visible but shrunk. To return, user must click another tab.
- **Mobile**: Tap "DEBUG" in the bottom tab bar → console panel is hidden, sidebar shows debug content. To return, tap "CONSOLE".
- Both approaches are full-screen switches — you can't see debug info and the console simultaneously.

## Suggested implementation

### 1. Floating debug toggle button

A small terminal-style button fixed to the bottom-right of the viewport:

```
[🐞]    ← small pill button, semi-transparent
```

- Visible on all screens (mobile + desktop)
- Positioned above the mobile tab bar on mobile
- `z-index: 50` (below modals, above content)

### 2. Debug overlay panel

A fixed-position overlay that slides in from the right (desktop) or bottom (mobile):

- **Desktop** (`>= 768px`): Fixed right panel, ~400px wide, `height: 100vh`, slides in from right edge, sits on top of the console with a semi-transparent backdrop
- **Mobile** (`< 768px`): Fixed bottom sheet, `max-height: 60vh`, slides up from bottom, sits above the tab bar

### 3. Toggle behavior

- Click the floating button → overlay opens (or closes if already open)
- Click outside the overlay → closes
- Press Escape (desktop) → closes
- Overlay content mirrors what `#tab-debug` currently shows (LLM calls + system logs)
- Overlay auto-refreshes via the existing `pollDebugData()` polling

### 4. Backward compatibility

- The existing sidebar debug tab (`#tab-debug`) and the `/debug` command continue to work unchanged
- The floating button is additive — it does not replace the existing debug access

## Files affected

- `web/templates/index.html` — add floating button + debug overlay HTML
- `web/static/style.css` — floating button + overlay styles
- `web/static/js/app.js` — toggle click handler + close-on-outside-click

## Acceptance criteria

- Floating button appears on both desktop and mobile
- Clicking the button toggles the debug overlay
- Overlay shows LLM call list and system logs with live polling
- Overlay closes when tapping outside (or pressing Escape on desktop)
- Existing `/debug` command and sidebar tab continue to work
- Safe-area insets respected on mobile