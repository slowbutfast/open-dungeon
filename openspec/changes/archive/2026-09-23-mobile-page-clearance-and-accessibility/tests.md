# Tests: Mobile Wizard Clearance and Accessibility

## Automated Tests

### 1. New Test Suite: `TestMobileScreenBottomClearance`
Located in `tests/e2e/test_mobile_viewport.py`:
- `test_preset_screen_scroll_and_bottom_clearance`:
  - Parameterized across `iphone-se` (375×667), `iphone-12` (390×844), and `iphone-16-pro` (430×932).
  - Injects `--safe-bottom: 34px`.
  - Clicks `#btn-new-game` to open `#preset-screen`.
  - Scrolls `.app-container` to the bottom (`scrollTop = scrollHeight`).
  - Asserts `#preset-screen .btn-back` and `#btn-manage-presets` bounding box bottoms $\le \text{innerHeight} - 34\text{px} + 0.5\text{px}$.
  - Asserts `document.elementFromPoint(x, y)` at button centers evaluates to the button or its text span.
  - Clicks `#preset-screen .btn-back` and verifies navigation back to `#startup-screen`.
- `test_custom_preset_screen_clearance`:
  - Opens `#custom-preset-screen`.
  - Scrolls to bottom and asserts `#btn-submit-custom-preset` bounding box bottom $\le \text{innerHeight} - 34\text{px} + 0.5\text{px}$.
- `test_character_screen_clearance`:
  - Navigates through custom preset to `#character-screen`.
  - Scrolls to bottom and asserts `#btn-submit-character` bounding box bottom $\le \text{innerHeight} - 34\text{px} + 0.5\text{px}$.
- `test_restore_screen_clearance`:
  - Clicks `#btn-restore-game` on startup menu to open `#restore-screen`.
  - Scrolls to bottom and asserts `#restore-screen .btn-back` bounding box bottom $\le \text{innerHeight} - 34\text{px} + 0.5\text{px}$.
- `test_gameplay_hud_regression_clearance`:
  - Uses `gameplay_page` fixture.
  - Verifies `#mobile-tab-bar` remains pinned to the bottom and does not scroll out of view when `.app-container` is styled for mobile.

### Execution Command
```bash
./venv/bin/python -m pytest tests/e2e/test_mobile_viewport.py::TestMobileScreenBottomClearance -v
```

### Full Regression Suite Command
```bash
./venv/bin/python -m pytest tests/e2e/test_mobile_viewport.py -v
```

## Manual Verification

1. **Preset Screen Scroll & Clearance**:
   - Open app on physical iOS Safari (or mobile emulation with dynamic toolbar).
   - Tap `[1] Begin New Simulation`.
   - Scroll through all 4 story preset cards to the bottom.
   - Confirm `[Back]`, `[Manage Presets]`, and `[Next: Adventure Config]` sit fully visible above the Safari floating URL/tab toolbar.
   - Tap `[Back]` directly without needing to hide or drag the browser bar; confirm startup menu opens.
2. **Character & Restore Screen**:
   - Navigate to `#character-screen`; confirm `[Begin Adventure]` is visible and tappable.
   - Navigate to `#restore-screen`; confirm `[Back]` is visible and tappable.
