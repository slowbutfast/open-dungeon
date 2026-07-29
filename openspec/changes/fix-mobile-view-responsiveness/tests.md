## Automated Tests

- `python -m pytest tests/e2e/test_mobile_viewport.py -v`: Verifies all mobile responsiveness acceptance criteria across four viewports (iPhone SE 375px, iPhone 12 390px, iPhone 16 Pro 430px, iPad Mini 768px). Tests include:
  - No horizontal overflow on any wizard screen at any mobile viewport
  - Touch target sizes meet 44x44px minimum for all buttons, cards, and inputs
  - Menu button navigation works correctly (tap to navigate between screens)
  - Console font sizes are consistent across all turn types (user, assistant, system)
  - Screenshots captured for manual review at each viewport

- `python -m pytest tests/e2e/test_menu_navigation.py -v`: Regression test to ensure desktop keyboard navigation and screen transitions remain functional after mobile changes.

- `python -m pytest tests/e2e/test_barter_ui.py -v`: Regression test to ensure barter modal and action chips remain functional after responsive style changes.

## Manual Verification

- **Startup Screen Layout**:
  - **WHEN** viewport is set to 375px width (iPhone SE) and page loads
  - **THEN** title "OPENDUNGEON" is readable and does not overflow horizontally, three menu buttons stack vertically with clear separation, no horizontal scrollbar appears

- **Startup Screen Navigation**:
  - **WHEN** user taps "Begin New Simulation" button on mobile
  - **THEN** preset screen appears with preset cards stacked vertically, back button returns to startup screen

- **Preset Screen Grid**:
  - **WHEN** viewport is 375px and preset screen is active
  - **THEN** preset cards display in single column, each card is tappable (min 44px height), tapping a card selects it (active state visible), footer buttons wrap without overflow

- **Preset Screen Tablet Layout**:
  - **WHEN** viewport is 768px (iPad Mini) and preset screen is active
  - **THEN** preset cards display in 2-column grid, cards remain tappable, footer buttons accessible

- **Character Screen Grid**:
  - **WHEN** viewport is 375px and character screen is active
  - **THEN** character cards display in single column, tapping selects a card, "Launch Simulation" button is visible and tappable

- **Custom Preset Form**:
  - **WHEN** viewport is 375px and custom preset screen is active
  - **THEN** form inputs stack vertically (label above input), all inputs have min 44px height, textarea for system prompt is scrollable if content overflows, footer buttons wrap without overflow

- **Console Font Consistency**:
  - **WHEN** gameplay screen is active and console has user, assistant, and system messages
  - **THEN** all three message types render at the same font size (0.85rem), text is legible and evenly spaced

- **Barter Modal Mobile**:
  - **WHEN** viewport is 375px and barter modal is opened
  - **THEN** modal content is constrained to 90vw/90vh, barter layout stacks vertically (not side-by-side), trade buttons are tappable (min 44px), modal content scrolls if needed

- **System Prompt Modal Mobile**:
  - **WHEN** viewport is 375px and system prompt modal is opened
  - **THEN** modal content is constrained to 90vw/90vh, textarea is scrollable, save/cancel buttons wrap without overflow

- **Safe-Area Insets**:
  - **WHEN** page is viewed on a notched device (iPhone 12/13/16 Pro) or emulated with safe-area insets
  - **THEN** wizard screen headers have padding at top, footer navigation has padding at bottom, content does not overlap with notch or home indicator

- **Desktop Regression**:
  - **WHEN** viewport is 1280px width (desktop)
  - **THEN** preset grid uses multi-column auto-fit layout, character grid uses multi-column auto-fit layout, all navigation works via keyboard and mouse, no visual regressions from mobile changes

- **Screenshot Review**:
  - **WHEN** Playwright tests complete and screenshots are saved to `tests/e2e/screenshots/`
  - **THEN** manually review each screenshot for visual issues: text overflow, misaligned elements, insufficient spacing, unreadable fonts, broken layouts
