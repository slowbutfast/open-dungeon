## Executive Summary & Environment

- **Status**: All delta-spec requirements verified passing. `tests/e2e/test_mobile_viewport.py` is **95 passed** (80 pre-existing + 15 new), 0 failed.
- **Date**: 2026-09-23
- **Environment**: Linux (container), Python 3.11.2 via the project interpreter (`./venv/bin/python`, absolute path `/home/node/global-sandbox/projects/open-dungeon/venv/bin/python`), pytest 9.1.1 + pytest-playwright, Node.js v22.23.2 (`node web/server.js`, `MOCK_LLM=1`, port 5007), Chromium bundled in `~/.cache/ms-playwright`.
- **Scope of verification**: Pure static CSS + E2E test changes (`web/static/style.css`, `tests/e2e/test_mobile_viewport.py`). No backend, engine, template, or data-store changes. Geometry is asserted empirically in headless Chromium; physical iOS Safari remains a manual check (see Deferrals).

## Requirement Adherence Audit Matrix

| Capability | Requirement & Scenario | Verification Method / Test File | Status |
| :--- | :--- | :--- | :--- |
| `mobile-viewport-ergonomics` | **MODIFIED** `### Requirement: Bottom Safe-Area Inset Clearance and Token Indirection`<br>`#### Scenario: Notched mobile device clearance (34px)` | `TestMobileViewportErgonomics::test_gameplay_safe_area_clearance` (existing, still green) — tab buttons `<= innerHeight - 34`; wizard screens covered by `TestMobileScreenBottomClearance` (below) | **PASS** |
| `mobile-viewport-ergonomics` | `#### Scenario: Non-notched mobile device (0px inset)` | `test_tab_bar_token_measurement` (existing, still green) — computed `padding-bottom >= 8px` at `--safe-bottom: 0px` | **PASS** |
| `mobile-viewport-ergonomics` | `#### Scenario: Console input and action chips clearance` | `test_gameplay_safe_area_clearance` — `.console-input-row` bottom `<= #mobile-tab-bar` top | **PASS** |
| `mobile-viewport-ergonomics` | `#### Scenario: Wizard screens scrollable bottom buffer` | `TestMobileScreenBottomClearance` + CSS audit — wizard screens declare `padding-bottom: calc(var(--safe-bottom) + 1.5rem)` and `.app-container` is the single scroll owner; buttons measure `<= innerHeight - 34 + 0.5` when scrolled to the end (see Empirical Logs) | **PASS** |
| `mobile-viewport-ergonomics` | `#### Scenario: Modal dialog bottom clearance` | CSS audit of `web/static/style.css` — `.modal-content { max-height: 90vh; max-height: 90dvh; overflow-y: auto; padding-bottom: calc(var(--safe-bottom) + 1rem); }` inside `@media (max-width: 767px)`. No headless modal-height probe added (see Deferrals) | **PASS (audit)** |
| `mobile-viewport-ergonomics` | **ADDED** `### Requirement: Universal Mobile Wizard and Modal Accessibility`<br>`#### Scenario: Preset screen footer buttons hit-testing` | `TestMobileScreenBottomClearance::test_preset_screen_scroll_and_bottom_clearance[iphone-se/iphone-12/iphone-16-pro]` — with `--safe-bottom: 34px`, scrolled to bottom, `#preset-screen .btn-back` and `#btn-manage-presets` bottom `<= innerHeight - 34 + 0.5` and `document.elementFromPoint()` resolves to the button; real `page.mouse.click` at the center navigates back to `#startup-screen` | **PASS** |
| `mobile-viewport-ergonomics` | `#### Scenario: Custom preset and character genesis navigation clearance` | `test_custom_preset_screen_clearance[*]` (`#btn-submit-custom-preset`), `test_character_screen_clearance[*]` (`#btn-submit-character`) | **PASS** |
| `mobile-viewport-ergonomics` | `#### Scenario: Restore screen back button clearance` | `test_restore_screen_clearance[*]` (`#restore-screen .btn-back`) | **PASS** |

## Resolved Assumptions & Empirical Proof

| Assumption from research.md | How Verified in Code/Tests | Result / Value | Volatility |
| :--- | :--- | :--- | :--- |
| `.app-container` must become the single bounded scroll owner to consume wizard overflow | `test_preset_screen_scroll_and_bottom_clearance` asserts `#app` computed `overflow-y == 'auto'` and `scrollHeight (1084px) > clientHeight (667px)` at 375×667 | `.app-container { height: 100%; align-items: flex-start; overflow-y: auto; }` lands; probe: `appOverflowY: "auto"`, `appScrollH: 1084`, `appClientH: 667` | stable |
| Removing the flex-origin centering trap (`align-items: flex-start`) restores top-anchored scrolling | Post-patch footer buttons land inside the viewport when scrolled to the end (bottom `525.4px` vs pre-patch `819.5px` at 375×667) | Pre-patch footer was fully off-screen; post-patch `#preset-screen .btn-back` bottom `525.4 <= 633.5` (`innerHeight 667 − 34 + 0.5`) | stable |
| `document.elementFromPoint()` proves unobstructed hit-testability that `locator.click()` would mask | Every clearance test asserts `hitIsSelf` at the button center | `hitDesc: "btn btn-back"` / `"btn-manage-presets"` resolve to the target buttons | stable |
| Wizard screens keep `min-height: 100dvh` without re-introducing the clip | `overflow-y: visible` on panels delegates overflow to `.app-container`; `test_dynamic_viewport_height_declarations` still asserts the `100vh`→`100dvh` cascade | `overflow-y: visible` + `padding-bottom: calc(var(--safe-bottom) + 1.5rem)` on all 7 wizard screens | stable |
| Headless Chromium reports `env(safe-area-inset-*)` as `0px` | Directly relied upon: tests inject a literal `--safe-bottom: 34px`; no real inset in headless mode | Confirmed; token indirection is the only testable seam | stable |
| Modals render within `90dvh` on compact handsets | **Not automated.** `.modal-content` now caps at `90dvh` with internal `overflow-y: auto`; no headless modal probe added | Deferred to manual / future probe | decays |

## Nomenclature & Code Symbol Audit

| Glossary Term | Final Code Identifier | Location / File | Verified Compliant? |
| :--- | :--- | :--- | :--- |
| Scroll Containment | `.app-container { overflow-y: auto; height: 100%; }` in `@media (max-width: 767px)` | `web/static/style.css` mobile block | Yes |
| Flex-Origin Trap fix | `align-items: flex-start` on `.app-container` (mobile) | `web/static/style.css` mobile block | Yes |
| Single-Owner Clearance Buffer | `padding-bottom: calc(var(--safe-bottom) + 1.5rem)` on `#startup-screen`, `#preset-screen`, `#custom-preset-screen`, `#character-screen`, `#preset-manager-screen`, `#restore-screen`, `#preset-editor-screen` | `web/static/style.css` mobile block | Yes |
| Hit-Test Verification | `document.elementFromPoint(centerX, centerY)` in `_measure_button` | `tests/e2e/test_mobile_viewport.py` | Yes |
| `--safe-top` | `--safe-top: env(safe-area-inset-top, 0px)` in `:root`; consumed by `.startup-header`, `.panel-header`, `.app-container` | `web/static/style.css` | Yes |
| Modal dvh sizing | `.modal-content { max-height: 90vh; max-height: 90dvh; overflow-y: auto; }` | `web/static/style.css` mobile block | Yes |

## Landed Tech Footprint & Patterns

| Adopted Pattern | Implementation File(s) | Verification Command / Suite |
| :--- | :--- | :--- |
| Single mobile scroll owner on `.app-container` | `web/static/style.css` (mobile block) | `TestMobileScreenBottomClearance` |
| Single-owner wizard clearance buffer (`calc(var(--safe-bottom) + 1.5rem)`) | `web/static/style.css` (mobile block) | `TestMobileScreenBottomClearance` |
| `--safe-top` token indirection replacing raw `env()` in headers | `web/static/style.css` (`:root`, `.startup-header`, `.panel-header`) | static audit + `test_dynamic_viewport_height_declarations` |
| Consolidated `.panel-footer-nav` (single `gap: 0.75rem`; footer no longer owns bottom padding) | `web/static/style.css` (mobile block) | static audit |
| Modal `90dvh` + internal scroll + clearance padding | `web/static/style.css` (mobile block) | static audit |
| Geometry + hit-test E2E helpers (`_measure_button`, `_assert_clear_and_hittable`, `_scroll_app_to_bottom`, `_inject_safe_bottom`) | `tests/e2e/test_mobile_viewport.py` | `pytest tests/e2e/test_mobile_viewport.py::TestMobileScreenBottomClearance -v` |

## Invalidated Hypotheses & Mid-Build Adjustments

| Original Belief | What Proved Wrong | Final Resolution | Rationale |
| :--- | :--- | :--- | :--- |
| Wizard panels could switch to `min-height: 100%` (tasks.md 2.3) | `test_dynamic_viewport_height_declarations` and the existing `Dynamic Viewport Height Sizing` requirement mandate the `min-height: 100vh; min-height: 100dvh;` cascade | Panels keep `min-height: 100vh; min-height: 100dvh;` **plus** `overflow-y: visible` and the clearance padding. `.app-container`'s bounded scroll makes the 100dvh floor harmless | Preserves an unmodified spec requirement; scroll ownership is what changed, not the dvh floor |
| `page.evaluate` accepts an expression string with injected `arguments` | Chromium throws `ReferenceError: arguments is not defined` for expression strings | `_inject_safe_bottom` uses a function body `(px) => …` and passes `px` as the argument | Playwright only injects `arg` into function-form expressions |
| `#btn-preset-next` participates in the footer | It is `display: none` until a preset card is selected | Cleared from the assertion set; the visible footer buttons (`[Back]`, `[Manage Presets]`) carry the hit-test contract | Matches `web/templates/index.html:76` |
| The worktree could serve its own `node_modules` | `npm install` was not run in the worktree; `express` was missing | Symlinked the main checkout's `node_modules` (gitignored, so not tracked) | Identical `package.json`; keeps the worktree clean |

## Implementation-Discovered Deferrals

- **Physical iOS Safari verification (wizard scroll + floating toolbar clearance)**:
  - **Reason**: No WebKit device or emulator in the container; headless Chromium reports `env(safe-area-inset-*)` as `0px`, and the injected `--safe-bottom` proves the CSS algebra but not WebKit's real inset reporting or the dynamic toolbar geometry. Listed under Manual Verification in `tests.md`.
- **Headless modal height probe (`90dvh`)**:
  - **Reason**: The delta spec modal scenario is verified by static CSS audit only; a Playwright modal probe was not in the task list. A follow-up can open each modal (`#modal-confirm`, `#modal-lore-card`, `#modal-system-prompt`, `#modal-barter`) and assert `box.bottom <= innerHeight`.

## Manual Verification Checklist

- [ ] **iOS Safari preset screen scroll**: open on a physical iPhone, tap `[1] Begin New Simulation`, scroll the four preset cards to the bottom, confirm `[Back]`, `[Manage Presets]`, and `[Next: Adventure Config]` sit fully visible above the Safari floating URL/tab toolbar, then tap `[Back]` directly.
- [ ] **Character & restore screen clearance**: navigate to `#character-screen` (confirm `[Launch Simulation]` visible/tappable) and `#restore-screen` (confirm `[Back]` visible/tappable) with the Safari toolbar shown.

## Empirical Execution Logs & Evidence

### Pre-patch baseline (TDD — unpatched `master`, `TestMobileScreenBottomClearance` only)

```
========================= 7 failed, 8 passed in 12.25s =========================
FAILED test_preset_screen_scroll_and_bottom_clearance[chromium-iphone-se]
FAILED test_custom_preset_screen_clearance[chromium-iphone-se]
FAILED test_character_screen_clearance[chromium-iphone-se]
FAILED test_preset_screen_scroll_and_bottom_clearance[chromium-iphone-12]
FAILED test_character_screen_clearance[chromium-iphone-12]
FAILED test_preset_screen_scroll_and_bottom_clearance[chromium-iphone-16-pro]
FAILED test_character_screen_clearance[chromium-iphone-16-pro]
```

Representative failure (375×667, iphone-se):

```
AssertionError: .app-container overflow-y is 'visible' at iphone-se
```

The 8 passing cases are the short-content restore screen (trivially clear) and the fixed
gameplay HUD guards — both expected to be invariant to this change.

### Post-patch `TestMobileScreenBottomClearance` (15/15)

```
============================= 15 passed in 12.18s =============================
```

### Full mobile regression suite

```
============================= 95 passed in 57.07s =============================
```

### Empirical geometry probe (375×667, `--safe-bottom: 34px`, post-patch)

```python
{
  'preset_back_btn':   {'bottom': 525.4, 'top': 478.8, 'innerH': 667,
                        'hitIsSelf': True,  'hitDesc': 'btn btn-back',
                        'appScrollH': 1084, 'appClientH': 667, 'appOverflowY': 'auto'},
  'manage_presets_btn':{'bottom': 525.4, 'top': 478.8, 'innerH': 667,
                        'hitIsSelf': True,  'hitDesc': 'btn-manage-presets',
                        'appScrollH': 1084, 'appClientH': 667, 'appOverflowY': 'auto'},
  'preset_next_btn':   {'bottom': 0.0, 'top': 0.0, 'innerH': 667,
                        'hitIsSelf': False, 'hitDesc': 'app',   # hidden until a card is selected
                        'appScrollH': 1084, 'appClientH': 667, 'appOverflowY': 'auto'}
}
```

Pre-patch the same footer measured `footerBottom: 819.5` at `innerHeight: 667` — fully
clipped off-screen. Post-patch `bottom: 525.4 <= 667 − 34 + 0.5 = 633.5` and the topmost
hit target at each button center is the button itself. The scroll owner (`#app`) reports
`scrollHeight 1084 > clientHeight 667` with `overflow-y: auto`, confirming bounded
scroll containment is engaged.