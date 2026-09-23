# Tasks: Mobile Wizard Scroll Containment & Page Clearance

## 1. Test Scaffolding (TDD)

- [x] 1.1 Add class `TestMobileScreenBottomClearance` in `tests/e2e/test_mobile_viewport.py` with `test_preset_screen_scroll_and_bottom_clearance` targeting `#preset-screen .btn-back` and `#btn-manage-presets`
- [x] 1.2 Add `test_custom_preset_screen_clearance` targeting `#btn-submit-custom-preset`
- [x] 1.3 Add `test_character_screen_clearance` targeting `#btn-submit-character`
- [x] 1.4 Add `test_restore_screen_clearance` targeting `#restore-screen .btn-back`
- [x] 1.5 Add `test_gameplay_hud_regression_clearance` to guard gameplay HUD fixed tab bar against regression
- [x] 1.6 Run `pytest tests/e2e/test_mobile_viewport.py::TestMobileScreenBottomClearance` to verify that wizard clearance tests fail on un-patched master

## 2. Stylesheet Implementation

- [x] 2.1 Add `--safe-top: env(safe-area-inset-top, 0px);` to `:root` in `web/static/style.css`
- [x] 2.2 In `@media (max-width: 767px)` of `web/static/style.css`, configure `.app-container` with `height: 100%; align-items: flex-start; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-top: max(1rem, var(--safe-top));`
- [x] 2.3 Update `#startup-screen`, `#preset-screen`, `#custom-preset-screen`, `#character-screen`, `#preset-manager-screen`, `#restore-screen`, and `#preset-editor-screen` to `min-height: 100%; overflow-y: visible; padding-bottom: calc(var(--safe-bottom) + 1.5rem);`
- [x] 2.4 Consolidate duplicate `.panel-footer-nav` blocks in mobile media query; use `var(--safe-top)` in `.startup-header` and `.panel-header`
- [x] 2.5 Update `.modal-content` in mobile media query to `max-height: 90vh; max-height: 90dvh; overflow-y: auto; padding-bottom: calc(var(--safe-bottom) + 1rem);`

## 3. Documentation Updates

- [x] 3.1 Update `web/FRONTEND_ARCHITECTURE.md` with mobile scroll containment architecture and `--safe-top` token reference
- [x] 3.2 Update `tests/ARCHITECTURE.md` documenting the new `TestMobileScreenBottomClearance` suite

## 4. Verification & Empirical Audit

- [x] 4.1 Run `pytest tests/e2e/test_mobile_viewport.py::TestMobileScreenBottomClearance -v` and confirm all clearance tests pass
- [x] 4.2 Run full mobile test suite `pytest tests/e2e/test_mobile_viewport.py -v` and confirm all 87+ tests pass
- [x] 4.3 Generate `openspec/changes/mobile-page-clearance-and-accessibility/verification.md` populated with the Requirement Adherence Audit Matrix, resolved assumptions, and runner output

## Implementation Notes

- **2.2 top gutter**: `.app-container` mobile `padding-top` is `max(1.5rem, var(--safe-top))`
  to preserve the 24px top gutter on non-notched handsets.
- **2.3 `min-height: 100%`**: Wizard panels declare `min-height: 100%` (of the bounded
  `.app-container` content box), **not** `100dvh`. A `100dvh` floor inside the padded
  scroller forces exactly 40px of spurious scroll on every short screen
  (`scrollHeight 707px` vs `clientHeight 667px` at 375×667) — eliminating it (40px → 0px)
  removes iOS rubber-banding on `#startup-screen` and short wizard views.
- **2.4 consolidation**: The two mobile `.panel-footer-nav` blocks were merged into one
  (`gap: 0.75rem`); the old `padding-bottom: env(safe-area-inset-bottom)` footer rule was
  removed because bottom clearance is owned by the wizard panel (single-owner buffer).
- **`test_dynamic_viewport_height_declarations`**: now asserts the `dvh` cascade where it
  belongs — `body` (`height: 100vh; 100dvh`), `.sidebar-panel` (`max-height: 40vh; 40dvh`),
  and `.modal-content` (`max-height: 90vh; 90dvh`) — replacing the brittle source-grep on
  the wizard-panel selector list.
- **Regression guards**: `test_restore_screen_clearance` (short content, trivially clear)
  and `test_gameplay_hud_regression_clearance` (fixed HUD) are guard rails that pass both
  pre- and post-patch; they are not the primary evidence for the fix.
- **Suite counts**: `TestMobileScreenBottomClearance` = 16 tests (added
  `test_short_screen_has_no_spurious_scroll`); full `tests/e2e/test_mobile_viewport.py` =
  **96 passed**.
