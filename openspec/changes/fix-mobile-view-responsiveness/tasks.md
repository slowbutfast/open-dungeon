## 1. Test Scaffolding (TDD)

- [x] 1.1 Create `tests/e2e/test_mobile_viewport.py` with viewport parametrization fixture for iPhone SE (375px), iPhone 12 (390px), iPhone 16 Pro (430px), iPad Mini (768px)
- [x] 1.2 Write failing tests for no horizontal overflow on all wizard screens at all mobile viewports
- [x] 1.3 Write failing tests for touch target sizes (44x44px minimum) on all buttons, cards, and inputs
- [x] 1.4 Write failing tests for menu button navigation (tap to navigate between screens) at all mobile viewports
- [x] 1.5 Write failing tests for console font size consistency across user/assistant/system turn types
- [x] 1.6 Write screenshot capture tests for manual review at each viewport

## 2. HTML Viewport Setup

- [x] 2.1 Add `viewport-fit=cover` to viewport meta tag in `web/templates/index.html` to enable safe-area insets

## 3. CSS Mobile Wizard Screen Layouts

- [x] 3.1 Add `min-height: 100vh` and scrollable content for startup screen on mobile (`@media max-width: 767px`)
- [x] 3.2 Add `min-height: 100vh` and scrollable content for preset screen on mobile
- [x] 3.3 Add `min-height: 100vh` and scrollable content for character screen on mobile
- [x] 3.4 Add `min-height: 100vh` and scrollable content for custom-preset screen on mobile
- [x] 3.5 Add safe-area inset padding (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`) to wizard screen headers and footers

## 4. CSS Responsive Grids

- [x] 4.1 Override `.preset-grid` to `grid-template-columns: 1fr` on mobile
- [x] 4.2 Add tablet breakpoint (768-1023px) with `grid-template-columns: repeat(2, 1fr)` for preset grid
- [x] 4.3 Override `.character-grid` to `grid-template-columns: 1fr` on mobile
- [x] 4.4 Add tablet breakpoint (768-1023px) with `grid-template-columns: repeat(2, 1fr)` for character grid

## 5. CSS Footer Navigation

- [x] 5.1 Add `flex-wrap: wrap` to `.panel-footer-nav` on mobile to prevent button overflow
- [x] 5.2 Ensure footer buttons stack or wrap gracefully on all wizard screens

## 6. CSS Modal Responsiveness

- [x] 6.1 Add `max-width: 90vw`, `max-height: 90vh`, `overflow-y: auto` to `.modal-content` on mobile
- [x] 6.2 Override `.barter-layout` to `grid-template-columns: 1fr` (vertical stacking) on mobile
- [x] 6.3 Hide `.barter-arrow` on mobile
- [x] 6.4 Add `flex-wrap: wrap` to `.modal-footer` on mobile
- [x] 6.5 Ensure modal close button meets 44x44px touch target on mobile

## 7. CSS Console Font Consistency

- [x] 7.1 Remove explicit `font-size: 1.05rem` override from `.log-turn-assistant`
- [x] 7.2 Remove explicit `font-size: 0.85rem` override from `.log-turn-system`
- [x] 7.3 Standardize `.console-log` base font-size to `0.85rem` across all viewports

## 8. CSS Touch Targets

- [x] 8.1 Ensure all `.btn` elements have `min-height: 44px` on mobile
- [x] 8.2 Ensure all `.preset-card` and `.char-card` elements have `min-height: 44px` on mobile
- [x] 8.3 Ensure all form inputs (`input`, `textarea`, `select`) have `min-height: 44px` on mobile
- [x] 8.4 Ensure `.mobile-tab` buttons have `min-height: 44px` (verify existing)

## 9. Startup Screen Mobile Refinements

- [x] 9.1 Scale `.startup-header h1` to max 2.5rem on mobile (prevent overflow on 375px)
- [x] 9.2 Ensure `.startup-header .subtitle` wraps without overflow on mobile
- [x] 9.3 Verify keyboard hints (`.kbd-hint`) are hidden on mobile (existing behavior)

## 10. Verification

- [x] 10.1 Run `python -m pytest tests/e2e/test_mobile_viewport.py -v` and verify all tests pass
- [x] 10.2 Run `python -m pytest tests/e2e/test_menu_navigation.py -v` to verify desktop regression
- [x] 10.3 Run `python -m pytest tests/e2e/test_barter_ui.py -v` to verify barter UI regression
- [x] 10.4 Review screenshots in `tests/e2e/screenshots/` for visual issues at each viewport
- [x] 10.5 Manual verification of safe-area insets on notched device emulation
- [x] 10.6 Manual verification of desktop layout (1280px) remains unchanged
