## Why

The mobile view has significant responsiveness issues that make the game difficult or unusable on phones and tablets. The wizard screens (startup, preset, character, custom-preset) were designed desktop-first with only minor padding/font-size adjustments for mobile. Modals have no responsive styles, causing layout breakage on small screens. Console font sizes are inconsistent across turn types.

GitHub Issue: #10

## What Changes

- **Mobile-First Wizard Screens**: Redesign startup, preset, character, and custom-preset screens as full-height viewport layouts with scrollable content and pinned CTAs. Add safe-area insets for notched devices (iPhone 12/13/16 Pro).
- **Responsive Grids**: Replace cramped `auto-fit, minmax(220px, 1fr)` grids with mobile-friendly stacked cards. Add tablet breakpoint (768-1023px) with 2-column layout.
- **Modal Responsiveness**: Add mobile-specific styles for all modals (barter, system prompt, lore, confirmation). Barter modal's side-by-side grid must stack vertically on mobile.
- **Console Font Consistency**: Remove explicit `font-size` overrides on `.log-turn-assistant` and `.log-turn-system` so they inherit from `.console-log`. Standardize base size to `0.85rem` across all screen sizes.
- **Touch Target Improvements**: Ensure all interactive elements meet minimum 44x44px touch targets. Remove desktop-only keyboard hints on mobile.
- **Menu Button Navigation**: Ensure all wizard screen buttons (startup menu, preset selection, character selection, footer navigation) are tappable and navigate correctly on mobile viewports.

## Target Viewports

| Device | Width | Height |
|--------|-------|--------|
| iPhone SE | 375px | 667px |
| iPhone 12/13 | 390px | 844px |
| iPhone 16 Pro | 430px | 932px |
| iPad Mini | 768px | 1024px |
| iPad Pro | 1024px | 1366px |

## Capabilities

### New Capabilities
- `mobile-responsive-wizard`: Mobile-first redesign of wizard screens with viewport-height layouts, safe-area insets, and touch-friendly navigation.

### Modified Capabilities
- `game-engine`: Console font size standardization across all turn types.

## Impact

- **Frontend CSS**: `web/static/style.css` — extensive mobile media query additions, wizard screen rewrites, modal responsive styles.
- **Frontend HTML**: `web/templates/index.html` — possible structural changes to wizard screens for mobile-first layout.
- **Frontend JS**: `web/static/js/app.js` — possible touch gesture wiring for carousels.
- **E2E Tests**: `tests/e2e/test_mobile_viewport.py` — new mobile viewport tests with screenshot verification and menu button navigation tests.
- **No backend changes**: All changes are frontend-only.
