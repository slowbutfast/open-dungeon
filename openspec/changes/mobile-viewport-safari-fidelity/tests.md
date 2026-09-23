## Automated Tests

- `python3 -m pytest tests/e2e/test_mobile_viewport.py -k "test_gameplay_safe_area_clearance" -v`:
  - **WHEN** the in-game gameplay HUD is rendered on mobile viewports (375px, 390px, 430px) and `--safe-bottom` is injected as `34px` (simulating a notched iPhone)
  - **THEN** asserts the bottom bounding edge of `.mobile-tab-bar` buttons clears the inset zone (`tab_button_bottom <= inner_height - 34`), and that `.console-input-row` sits above the tab bar top (`input_bottom <= tab_bar_top`)
- `python3 -m pytest tests/e2e/test_mobile_viewport.py -k "test_tab_bar_token_measurement" -v`:
  - **WHEN** `.mobile-tab-bar` is rendered with `--safe-bottom: 0px`
  - **THEN** asserts the measured bar height minus its bottom padding equals 45px (matching `--tab-bar-h`), and tab buttons retain at least an 8px clearance floor
- `python3 -m pytest tests/e2e/test_mobile_viewport.py -k "test_action_chip_and_input_touch_targets" -v`:
  - **WHEN** action chips (`.action-chip`) and console utility buttons are rendered on mobile
  - **THEN** asserts their bounding box heights measure $\ge 44\text{px}$
- `python3 -m pytest tests/e2e/test_mobile_viewport.py -k "test_mobile_side_padding_floor" -v`:
  - **WHEN** `.app-container` renders on mobile viewports with default safe-area insets
  - **THEN** asserts computed `padding-left` and `padding-right` evaluate to at least 24px (1.5rem)
- `python3 -m pytest tests/e2e/test_mobile_viewport.py -k "test_dynamic_viewport_height_declarations" -v`:
  - **WHEN** `web/static/style.css` is inspected in browser context
  - **THEN** asserts `body`, `#startup-screen`, `#preset-screen`, `#custom-preset-screen`, `#character-screen`, and `.sidebar-panel` include `100dvh` / `40dvh` rules
- `python3 -m pytest tests/e2e/test_mobile_viewport.py -k "test_access_gate_mobile_viewport" -v`:
  - **WHEN** `gate.html` is loaded at 375px mobile viewport
  - **THEN** asserts zero horizontal overflow (`scrollWidth === innerWidth`) and that the sign-in button bounding box is $\ge 44 \times 44\text{px}$ and fully within vertical viewport bounds
- `python3 -m pytest tests/e2e/test_mobile_viewport.py -k "test_desktop_regression_layout" -v`:
  - **WHEN** the application is loaded on a desktop viewport (1920×1080)
  - **THEN** asserts `#mobile-tab-bar` is hidden (`display: none`), sidebar tabs remain visible in the desktop multi-pane layout, and `body` width does not overflow
- `python3 -m pytest tests/e2e/test_mobile_viewport.py -v`:
  - Runs the complete mobile viewport test suite, ensuring no regressions across wizard screens, touch targets, and typography

## Manual Verification

- **Safari Dynamic Tab Bar (Bottom) Layout**:
  - **WHEN** accessing the live application on an iOS device with Safari set to "Tab Bar" mode
  - **THEN** `.mobile-tab-bar` buttons render above the floating address bar and clear the home indicator; tapping console input displays the prompt without clipping
- **Safari Single Tab (Top) Layout**:
  - **WHEN** accessing the application on an iOS device with Safari set to "Single Tab" mode
  - **THEN** the entire gameplay HUD extends to the bottom of the screen, clearing the 34px home indicator via `--safe-bottom`
- **Safari Landscape Orientation**:
  - **WHEN** rotating an iPhone to landscape mode
  - **THEN** left and right safe areas (`env(safe-area-inset-left)`, `env(safe-area-inset-right)`) prevent notch clipping and no horizontal scrolling occurs
- **Android Chromium Virtual Keyboard**:
  - **WHEN** focusing `#console-input` on Chrome for Android
  - **THEN** the layout viewport resizes via `interactive-widget=resizes-content`, keeping the input and active narration visible above the keyboard
