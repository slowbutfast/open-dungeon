## Executive Summary & Environment

- **Status**: All specs verified passing. `tests/e2e/test_mobile_viewport.py` is **80 passed** (64 pre-existing + 16 new), 0 failed.
- **Date**: 2026-09-23
- **Environment**: Linux (container), Python 3.11.2 via project interpreter `./venv/bin/python`, pytest 9.1.1 + pytest-playwright 0.9.0, Node.js v22.23.2 (`node web/server.js`, `MOCK_LLM=1`, port 5007), Chromium bundled in `~/.cache/ms-playwright`.
- **Scope of verification**: Pure static CSS + template-metadata change (`web/static/style.css`, `web/templates/index.html`, `web/templates/gate.html`). No backend, engine, or data-store changes. Geometry is asserted empirically in headless Chromium; physical iOS Safari remains a manual check (see Deferrals).

## Requirement Adherence Audit Matrix

| Capability | Requirement & Scenario | Verification Method / Test File | Status |
| :--- | :--- | :--- | :--- |
| `mobile-viewport-ergonomics` | `### Requirement: Dynamic Viewport Height Sizing`<br>`#### Scenario: Dynamic browser chrome adjustment on mobile` | `tests/e2e/test_mobile_viewport.py::TestMobileViewportErgonomics::test_dynamic_viewport_height_declarations` — `body` declares `height: 100vh; height: 100dvh;` and wizard screens declare `min-height: 100vh; min-height: 100dvh;` | **PASS** |
| `mobile-viewport-ergonomics` | `#### Scenario: Mobile sidebar panel height constraint` | `test_dynamic_viewport_height_declarations` — `.sidebar-panel { max-height: 40vh; max-height: 40dvh; }` in the `<768px` block | **PASS** |
| `mobile-viewport-ergonomics` | `### Requirement: Bottom Safe-Area Inset Clearance and Token Indirection`<br>`#### Scenario: Notched mobile device clearance (34px)` | `test_gameplay_safe_area_clearance[iphone-se/iphone-12/iphone-16-pro]` — with injected `--safe-bottom: 34px`, `maxTabBottom <= innerHeight - 34` | **PASS** |
| `mobile-viewport-ergonomics` | `#### Scenario: Non-notched mobile device (0px inset)` | `test_tab_bar_token_measurement[3]` — computed `padding-bottom >= 8px` at `--safe-bottom: 0px` | **PASS** |
| `mobile-viewport-ergonomics` | `#### Scenario: Console input and action chips clearance` | `test_gameplay_safe_area_clearance` — `console-input-row` bottom `(628px) <= tab bar top (765px)`; `test_action_chip_and_input_touch_targets` — chip/utility boxes render above the fixed bar | **PASS** |
| `mobile-viewport-ergonomics` | `### Requirement: Zero Horizontal Overflow and Side Margin Preservation`<br>`#### Scenario: Compact mobile viewport (375px)` | `TestNoHorizontalOverflow::test_startup_screen_no_overflow[iphone-se]`, `test_preset_screen_no_overflow[iphone-se]`, `test_character_screen_no_overflow[iphone-se]` | **PASS** |
| `mobile-viewport-ergonomics` | `#### Scenario: Standard mobile and tablet viewports (390px - 768px)` | `TestNoHorizontalOverflow::*_no_overflow[iphone-12 / iphone-16-pro / ipad-mini]` | **PASS** |
| `mobile-viewport-ergonomics` | `#### Scenario: Mobile side margin preservation` | `test_mobile_side_padding_floor[3]` — computed `.app-container` `padding-left/right == 24px (>= 1.5rem)` with default insets; `test_mobile_side_padding_landscape_inset` — injected `--safe-left/right: 44px` at 844×390 expands padding to `44px` (landscape notch) | **PASS** |
| `mobile-viewport-ergonomics` | `### Requirement: Minimum Touch Target Accessibility`<br>`#### Scenario: Mobile navigation tabs` | `test_tab_bar_token_measurement` proves 44px tab height via `--tab-bar-h`; width is `flex: 1` across 5 tabs (≈75px at 375px). Audited in CSS (`web/static/style.css` `.mobile-tab`), not directly asserted for width | **PASS (audit)** |
| `mobile-viewport-ergonomics` | `#### Scenario: Wizard buttons, cards, and inputs` | Pre-existing `TestTouchTargetSizes::test_startup_buttons_touch_targets` / `test_preset_cards_touch_targets` (all 4 viewports) + mobile CSS `.btn`, `.preset-card`, `.char-card`, `input/textarea/select { min-height: 44px }` | **PASS** |
| `mobile-viewport-ergonomics` | `#### Scenario: Action chips and input controls` | `test_action_chip_and_input_touch_targets[3]` — `.action-chip` and visible `.btn-utility` each `>= 44px` tall | **PASS** |
| `mobile-viewport-ergonomics` | `### Requirement: Mobile Access Gate Alignment`<br>`#### Scenario: Access gate on small mobile screen` | `test_access_gate_mobile_viewport` — real `gate.html` served via `page.route` at 375×667: `scrollWidth == innerWidth`, `#gate-signin >= 44×44px`, button bottom `<= innerHeight` | **PASS** |
| `mobile-viewport-ergonomics` | `### Requirement: Virtual Keyboard Viewport Resizing (Chromium / Android)`<br>`#### Scenario: Virtual keyboard activation on Chromium` | Static audit: both templates contain `interactive-widget=resizes-content` in the viewport meta (see Empirical Logs). Behaviour on-device is not automatable in headless Chromium | **PASS (audit)** |

## Resolved Assumptions & Empirical Proof

| Assumption from research.md | How Verified in Code/Tests | Result / Value | Volatility |
| :--- | :--- | :--- | :--- |
| Core hypothesis: `100dvh` + `max(8px, var(--safe-bottom))` prevents clipping under the Safari toolbar / home indicator | Simulated in headless Chromium by injecting `--safe-bottom: 34px`; tab bottom lands exactly on `innerHeight - 34` and console input clears the bar | Mechanism proven in Chromium; physical iOS remains manual | decays (manual device check outstanding) |
| Headless Chromium reports `env(safe-area-inset-*)` as `0px` | Directly relied upon by the tests: a literal `--safe-bottom` injection is required, otherwise the `0px` env value would mask the inset | Confirmed `0px`; token indirection is the only way to test insets headlessly | stable |
| Headless WebKit safe-area reporting behaviour | Only Chromium is installed; no WebKit run performed | Unverified — deferred to physical device | decays |
| `interactive-widget=resizes-content` is harmless to iOS Safari | Static presence check in both templates; WebKit ignores the attribute per Chrome Developers/W3C reference | Metadata landed; no runtime error surface in Chromium | stable |
| `.mobile-tab-bar` current measured height 45px | Re-measured pre/post: 45px (`1 border + 44 tab + 0 padding`) → 79px at 34px inset (`1 + 44 + 34`) | Matches `--tab-bar-h` algebra exactly | stable |
| `.action-chip` ~29.8px | Mobile `min-height: 44px` added; test asserts `>= 44px` | **29.8px → 44px** | stable |
| `.app-container` mobile side padding evaluates to 0px | `max(1.5rem, env(safe-area-inset-left, 1.5rem))`; test asserts `>= 24px` | **0px → 24px** | stable |

## Nomenclature & Code Symbol Audit

| Glossary Term | Final Code Identifier | Location / File | Verified Compliant? |
| :--- | :--- | :--- | :--- |
| `--safe-bottom` | `--safe-bottom: env(safe-area-inset-bottom, 0px)` | `web/static/style.css` `:root` | Yes |
| `--tab-bar-h` | `--tab-bar-h: 45px`, consumed by `.mobile-tab` and `.game-dashboard` | `web/static/style.css` `:root`, mobile block | Yes |
| `100dvh` | `height: 100dvh` (`body`), `min-height: 100dvh` (wizard screens) | `web/static/style.css` | Yes |
| `40dvh` | `max-height: 40dvh` | `web/static/style.css` `.sidebar-panel` mobile block | Yes |
| `interactive-widget=resizes-content` | viewport meta content attribute | `web/templates/index.html`, `web/templates/gate.html` | Yes |
| Safari Bottom Floating Tab Bar clearance | `max(8px, var(--safe-bottom))` on `.mobile-tab-bar`; `calc(var(--tab-bar-h) + max(8px, var(--safe-bottom)))` on `.game-dashboard` | `web/static/style.css` | Yes |
| 44×44 touch floor | `.action-chip`, `.btn-utility`, `.mobile-tab`, `.suggestion-chip` `min-height` | `web/static/style.css` | Yes |

## Landed Tech Footprint & Patterns

| Adopted Pattern / Package | Implementation File(s) | Verification Command / Suite |
| :--- | :--- | :--- |
| CSS token indirection (`--safe-bottom`, `--tab-bar-h`) | `web/static/style.css` (`:root`) | `TestMobileViewportErgonomics::test_tab_bar_token_measurement` |
| Dual-layer bottom clearance with 8px floor | `web/static/style.css` (`.mobile-tab-bar`, `.game-dashboard`) | `test_gameplay_safe_area_clearance` |
| `vh → dvh` cascade | `web/static/style.css` (`body`, wizard screens, `.sidebar-panel`) | `test_dynamic_viewport_height_declarations` |
| `max()`-wrapped side insets (`--safe-left/right`, base `.app-container`) | `web/static/style.css` (base rule + `:root` tokens) | `test_mobile_side_padding_floor`, `test_mobile_side_padding_landscape_inset` |
| `interactive-widget=resizes-content` | `web/templates/index.html`, `web/templates/gate.html` | static grep (Empirical Logs) |
| Playwright `--safe-bottom` injection seam | `tests/e2e/test_mobile_viewport.py` (`gameplay_page`, `TestMobileViewportErgonomics`) | `pytest tests/e2e/test_mobile_viewport.py -v` |

## Invalidated Hypotheses & Mid-Build Adjustments

| Original Belief | What Proved Wrong | Final Resolution | Rationale |
| :--- | :--- | :--- | :--- |
| The mock narrator would render `.action-chip` elements so the touch-target test could measure them directly. | Mock narration produced no `#action-chips` content, and the `#action-chips` wrapper itself carried `.hidden` (`display: none !important`), so an injected chip measured as `None`. | `test_action_chip_and_input_touch_targets` now removes `.hidden` from `#action-chips` before injecting a `button.action-chip`. | Keeps the 44px contract deterministic without depending on narration output. |
| Iterating all `.btn-utility` bounding boxes was safe. | Some utility buttons are hidden in the mock-gameplay state; `bounding_box()` returned `None` and subscripting threw `TypeError`. | Locator scoped to `.btn-utility:visible`. | Only visible controls carry a real touch-target obligation. |

## Implementation-Discovered Deferrals

- **Physical iOS Safari verification (Tab Bar / Single Tab / landscape)**:
  - **Reason**: No WebKit device or emulator in the CI container; headless Chromium reports `env(safe-area-inset-*)` as `0px`, and the injected `--safe-bottom` proves the CSS algebra but not WebKit's real inset reporting. Listed under Manual Verification in `tests.md`.
- **Tablet `768–1023px` `.sidebar-panel` still uses `40vh`**:
  - **Reason**: Spec scenario scopes the dynamic-height sidebar constraint to viewports `< 768px`; the tablet block was intentionally left unmodified to stay within the spec. A future change can extend `40dvh` there if tablet browser chrome causes the same crowding.

## Manual Verification Checklist

- [ ] **Android Chrome Virtual Keyboard Audit**: Open on Android Chrome with the virtual keyboard raised; confirm `interactive-widget=resizes-content` maintains input visibility and console scrollability without visual clipping.
- [ ] **iOS Safari (Tab Bar / Single Tab / landscape)**: Confirm bottom tab-bar and home-indicator clearance plus landscape notch insets on a physical device (see `tests.md` Manual Verification).

## Empirical Execution Logs & Evidence

### RED — pre-implementation failure (task 1.2 / step 2)

Command:
```bash
./venv/bin/python -m pytest tests/e2e/test_mobile_viewport.py -k test_gameplay_safe_area_clearance -v
```

Verbatim result (3 failed, 76 deselected):
```
tests/e2e/test_mobile_viewport.py::TestMobileViewportErgonomics::test_gameplay_safe_area_clearance[iphone-se-chromium] FAILED
tests/e2e/test_mobile_viewport.py::TestMobileViewportErgonomics::test_gameplay_safe_area_clearance[iphone-12-chromium] FAILED
tests/e2e/test_mobile_viewport.py::TestMobileViewportErgonomics::test_gameplay_safe_area_clearance[iphone-16-pro-chromium] FAILED

E       AssertionError: Tab button bottom 667px does not clear the 34px safe-area inset (viewport 667px) at iphone-se
E       assert 667 <= ((667 - 34) + 0.5)
E       AssertionError: Tab button bottom 844px does not clear the 34px safe-area inset (viewport 844px) at iphone-12
E       assert 844 <= ((844 - 34) + 0.5)
E       AssertionError: Tab button bottom 932px does not clear the 34px safe-area inset (viewport 932px) at iphone-16-pro
E       assert 932 <= ((932 - 34) + 0.5)
======================= 3 failed, 76 deselected in 4.00s =======================
```

### GREEN — full suite (task 6.1 / step 5)

Command:
```bash
./venv/bin/python -m pytest tests/e2e/test_mobile_viewport.py -v
```

Verbatim result (tail):
```
tests/e2e/test_mobile_viewport.py::TestScreenshotCapture::test_screenshot_character[chromium-ipad-mini] PASSED [ 98%]
tests/e2e/test_mobile_viewport.py::TestScreenshotCapture::test_screenshot_character[chromium-ipad-mini] PASSED [100%]

============================= 80 passed in 49.71s ==============================
```

New suite only:
```
tests/e2e/test_mobile_viewport.py::TestMobileViewportErgonomics::test_gameplay_safe_area_clearance[iphone-se-chromium] PASSED
... (16 tests) ...
============================= 16 passed in 11.17s ==============================
```

### Post-fix geometry probe (Chromium, 390×844, `--safe-bottom: 34px`)

```
PROBE: {'innerHeight': 844, 'tabBottom': 810, 'barTop': 765, 'barHeight': 79,
        'barPadBottom': '34px', 'inputBottom': 628, 'chipHeight': None, 'appPadLeft': '24px'}
```
`tabBottom == innerHeight - 34` (810), `inputBottom (628) <= barTop (765)`, `barHeight (79) == 1 border + 44 tab + 34 padding`. `chipHeight: None` confirms the mock narrator renders no chips, motivating the test's injection seam.

### Metrics & Data Invariants

This change touches layout geometry only — no records, saves, or persisted state are read, written, or deleted. The relevant deltas are geometric bounds:

| Metric / Count | Before | After | Delta / Observation |
| :--- | :--- | :--- | :--- |
| `body` width source (1920×1080) | `100vw` (scrollbar-inclusive) | `100%` | No horizontal overflow; `test_desktop_regression_layout` PASS |
| Tab button bottom @390×844, inset 34px | 844px (== viewport, clipped) | 810px (== innerHeight − 34) | 34px clearance restored |
| `.mobile-tab-bar` padding-bottom @0px inset | 0px | 8px | 8px floor enforced |
| `.mobile-tab-bar` padding-bottom @34px inset | 0px | 34px | Home-indicator clearance |
| `.mobile-tab-bar` height @34px inset | 45px | 79px | `1 + 44 + 34` |
| `.action-chip` height | ~29.8px | >= 44px | Touch target compliant |
| `.app-container` computed padding-left | 0px | 24px | 1.5rem floor preserved |
| Persisted records / saves | 0 | 0 | No data touched |

### Static metadata audit

```
$ grep -n 'interactive-widget' web/templates/index.html web/templates/gate.html
web/templates/index.html:5:    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content">
web/templates/gate.html:5:    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content">
```

## Quick Re-Verification (60-Second Audit)

```bash
./venv/bin/python -m pytest tests/e2e/test_mobile_viewport.py::TestMobileViewportErgonomics -v
```
Expected output:
```
============================= 16 passed in ~11s ==============================
```

Full-suite audit:
```bash
./venv/bin/python -m pytest tests/e2e/test_mobile_viewport.py -v
```
Expected output:
```
============================= 80 passed in ~50s ==============================
```
