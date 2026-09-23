# Tasks: Mobile Wizard Scroll Containment & Page Clearance

## 1. Test Scaffolding (TDD)

- [ ] 1.1 Add class `TestMobileScreenBottomClearance` in `tests/e2e/test_mobile_viewport.py` with `test_preset_screen_scroll_and_bottom_clearance` targeting `#preset-screen .btn-back` and `#btn-manage-presets`
- [ ] 1.2 Add `test_custom_preset_screen_clearance` targeting `#btn-submit-custom-preset`
- [ ] 1.3 Add `test_character_screen_clearance` targeting `#btn-submit-character`
- [ ] 1.4 Add `test_restore_screen_clearance` targeting `#restore-screen .btn-back`
- [ ] 1.5 Add `test_gameplay_hud_regression_clearance` to guard gameplay HUD fixed tab bar against regression
- [ ] 1.6 Run `pytest tests/e2e/test_mobile_viewport.py::TestMobileScreenBottomClearance` to verify that wizard clearance tests fail on un-patched master

## 2. Stylesheet Implementation

- [ ] 2.1 Add `--safe-top: env(safe-area-inset-top, 0px);` to `:root` in `web/static/style.css`
- [ ] 2.2 In `@media (max-width: 767px)` of `web/static/style.css`, configure `.app-container` with `height: 100%; align-items: flex-start; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-top: max(1rem, var(--safe-top));`
- [ ] 2.3 Update `#startup-screen`, `#preset-screen`, `#custom-preset-screen`, `#character-screen`, `#preset-manager-screen`, `#restore-screen`, and `#preset-editor-screen` to `min-height: 100%; overflow-y: visible; padding-bottom: calc(var(--safe-bottom) + 1.5rem);`
- [ ] 2.4 Consolidate duplicate `.panel-footer-nav` blocks in mobile media query; use `var(--safe-top)` in `.startup-header` and `.panel-header`
- [ ] 2.5 Update `.modal-content` in mobile media query to `max-height: 90vh; max-height: 90dvh; overflow-y: auto; padding-bottom: calc(var(--safe-bottom) + 1rem);`

## 3. Documentation Updates

- [ ] 3.1 Update `web/FRONTEND_ARCHITECTURE.md` with mobile scroll containment architecture and `--safe-top` token reference
- [ ] 3.2 Update `tests/ARCHITECTURE.md` documenting the new `TestMobileScreenBottomClearance` suite

## 4. Verification & Empirical Audit

- [ ] 4.1 Run `pytest tests/e2e/test_mobile_viewport.py::TestMobileScreenBottomClearance -v` and confirm all clearance tests pass
- [ ] 4.2 Run full mobile test suite `pytest tests/e2e/test_mobile_viewport.py -v` and confirm all 87+ tests pass
- [ ] 4.3 Generate `openspec/changes/mobile-page-clearance-and-accessibility/verification.md` populated with the Requirement Adherence Audit Matrix, resolved assumptions, and runner output
