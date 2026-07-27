## Automated Tests

- `python3 -m pytest tests/test_api_endpoints.py`: Verifies that `/api/presets` returns the dynamically stored JSON templates and supports CRUD operations without breaking.
- `pytest tests/e2e/test_menu_navigation.py`: Verifies that E2E navigation, keyboard arrow cycling, hotkeys, and character launcher states remain correct with the refactored wizard screen sequence.

## Manual Verification

- **Preset CRUD Operations**:
  - **WHEN** user goes to Preset Manager, clicks "+ Create Preset Template", defines a new universe with classes, and saves it
  - **THEN** it appears dynamically in the presets grid list and can be successfully selected, edited, or deleted

- **Wizard Navigation State Preservation**:
  - **WHEN** user customizes a preset in Step 2, clicks Next, then clicks Back from Hero Genesis in Step 3
  - **THEN** they return to the Custom Boundaries screen with all their previous edits (Title, Summary, Prompt) intact

- **Progress Indicator Alignment**:
  - **WHEN** user moves through the session setup wizard screens
  - **THEN** a progress bar dynamically shows the current stage (Select Universe, Boundaries, or Hero Genesis) and highlights the active step

- **Keyboard Focus Management**:
  - **WHEN** entering the Preset Selection screen or Hero Genesis screen
  - **THEN** the first card in the grid is automatically focused and highlighted, enabling arrow-key navigation immediately without a mouse click
