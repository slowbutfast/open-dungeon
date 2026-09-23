## 1. Test Scaffolding (TDD)

- [ ] 1.1 Add gameplay-screen fixture to `tests/e2e/test_mobile_viewport.py` that navigates past wizard screens to the active gameplay HUD
- [ ] 1.2 Write failing clearance test with injected `--safe-bottom: 34px` asserting tab button bottom clears the inset zone (`tab_bottom <= inner_height - 34`) and console input row sits above tab bar top
- [ ] 1.3 Write failing test verifying `.mobile-tab-bar` measured height minus bottom padding equals 45px (matching `--tab-bar-h`) with at least an 8px padding floor when `--safe-bottom` is 0px
- [ ] 1.4 Write failing test for `.action-chip` touch targets $\ge 44\text{px}$ and `.app-container` side padding $\ge 1.5\text{rem}$ on mobile viewports
- [ ] 1.5 Write failing assertions for `100dvh` / `40dvh` stylesheet rules, access gate mobile layout, and desktop (1920px) layout regression test

## 2. CSS Tokens & Dynamic Viewport Heights

- [ ] 2.1 Add `:root` custom properties `--safe-bottom: env(safe-area-inset-bottom, 0px)` and `--tab-bar-h: 45px` to `web/static/style.css`
- [ ] 2.2 Update `body` rule in `web/static/style.css` to `height: 100vh; height: 100dvh; width: 100%;`
- [ ] 2.3 Update wizard screens (`#startup-screen`, `#preset-screen`, `#character-screen`, `#custom-preset-screen`) to `min-height: 100vh; min-height: 100dvh;`
- [ ] 2.4 Update `.sidebar-panel` on mobile to `max-height: 40vh; max-height: 40dvh;`

## 3. Safe-Area Clearance on Mobile Navigation & Dashboard

- [ ] 3.1 Set `.mobile-tab { min-height: calc(var(--tab-bar-h) - 1px); }` and update `.mobile-tab-bar` padding-bottom to `max(8px, var(--safe-bottom))` in `web/static/style.css`
- [ ] 3.2 Update `.game-dashboard` padding-bottom to `calc(var(--tab-bar-h) + max(8px, var(--safe-bottom)))` in `web/static/style.css`
- [ ] 3.3 Set `.app-container` mobile padding to `max(1.5rem, env(safe-area-inset-left, 1.5rem))` and right, and update mobile `.action-chip` and console utility buttons to `min-height: 44px`

## 4. HTML Viewport Configuration

- [ ] 4.1 Add `interactive-widget=resizes-content` to `<meta name="viewport">` in `web/templates/index.html`
- [ ] 4.2 Add `interactive-widget=resizes-content` to `<meta name="viewport">` in `web/templates/gate.html`

## 5. Architecture Documentation

- [ ] 5.1 Update `web/FRONTEND_ARCHITECTURE.md` documenting `--safe-bottom`, `--tab-bar-h`, and viewport standards per `AGENTS.md`
- [ ] 5.2 Update `tests/ARCHITECTURE.md` documenting mobile E2E test cases

## 6. Verification & Empirical Audit

- [ ] 6.1 Run full regression test suite (`python3 -m pytest tests/e2e/test_mobile_viewport.py -v`) and verify all tests pass
- [ ] 6.2 Populate `verification.md` with Requirement Adherence Matrix, resolved assumptions, and verbatim execution logs
