## Why

On physical iOS Safari and compact mobile viewports, the bottom navigation controls on the Story Genesis Presets screen (`#preset-screen`)—specifically `[Back]`, `[Manage Presets]`, and `[Next: Adventure Config]`—are cut off and trapped below the viewport fold. 

Empirical probing revealed a scroll containment defect: wizard screens use `min-height: 100dvh` without a bounded height, growing to 996px while `.app-container` centers them vertically inside a 667px window. Because `body` has `overflow: hidden` and `.app-container` has `overflow: visible`, excess content is pushed off both the top and bottom edges and clipped without scrolling.

Establishing bounded scroll ownership on `.app-container`, removing the flex-origin centering trap, and assigning a single-owner safe-area clearance buffer ensures that all wizard screens and modal dialogs scroll naturally and keep interactive controls fully accessible above mobile browser toolbars.

## What Changes

- **Single Mobile Scroll Container**:
  - Configure `.app-container` under `@media (max-width: 767px)` with `height: 100%; align-items: flex-start; overflow-y: auto; -webkit-overflow-scrolling: touch;`.
  - Fixes the flex-origin centering trap so tall wizard content starts at the top and scrolls downwards.
- **Wizard Screens Single-Owner Clearance Buffer**:
  - Update `#startup-screen`, `#preset-screen`, `#custom-preset-screen`, `#character-screen`, `#preset-manager-screen`, `#restore-screen`, and `#preset-editor-screen` to `min-height: 100%; overflow-y: visible;`.
  - Assign bottom clearance directly to wizard panels: `padding-bottom: calc(var(--safe-bottom) + 1.5rem);`.
- **Token & Header Hygiene**:
  - Add `--safe-top: env(safe-area-inset-top, 0px);` to `:root` and use `var(--safe-top)` in `.startup-header` and `.panel-header`.
  - Consolidate duplicate `.panel-footer-nav` declarations in the mobile media query.
  - Upgrade `.modal-content` to `max-height: 90vh; max-height: 90dvh; overflow-y: auto; padding-bottom: calc(var(--safe-bottom) + 1rem);`.
- **Verified Multi-Screen Playwright Test Suite**:
  - Add `TestMobileScreenBottomClearance` testing `#preset-screen`, `#custom-preset-screen`, `#character-screen`, and `#restore-screen` across mobile viewports.
  - Assert that when scrolled to the bottom under simulated bottom insets (`--safe-bottom: 34px` / `44px`), footer buttons sit $\le \text{innerHeight} - \text{safe\_bottom}$.
  - Assert hit-test validity via `document.elementFromPoint()` to confirm the button is the topmost hit target.
  - Add regression checks ensuring the fixed gameplay HUD and mobile tab bar retain existing clearance.

## Capabilities

### New Capabilities
*(None. All changes modify and extend the existing mobile layout specification.)*

### Modified Capabilities
- `mobile-viewport-ergonomics`:
  - Extend *Bottom Safe-Area Inset Clearance and Token Indirection* to mandate bounded scroll containment and single-owner clearance buffering across all wizard screens and modal dialogs.
  - Add *Universal Mobile Wizard and Modal Accessibility* requiring hit-tested clearance for all primary navigation buttons.

## Impact

- **CSS**: [`web/static/style.css`](file:///home/node/global-sandbox/projects/open-dungeon/web/static/style.css) (mobile `.app-container` scroller, wizard screen clearance buffer, consolidated `.panel-footer-nav`, modal dvh sizing).
- **Tests**: [`tests/e2e/test_mobile_viewport.py`](file:///home/node/global-sandbox/projects/open-dungeon/tests/e2e/test_mobile_viewport.py) (new `TestMobileScreenBottomClearance` suite with geometry and hit-testing assertions).
- **Documentation**: [`web/FRONTEND_ARCHITECTURE.md`](file:///home/node/global-sandbox/projects/open-dungeon/web/FRONTEND_ARCHITECTURE.md) and [`tests/ARCHITECTURE.md`](file:///home/node/global-sandbox/projects/open-dungeon/tests/ARCHITECTURE.md).
