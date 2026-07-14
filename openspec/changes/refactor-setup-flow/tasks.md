## Target Context Map

| File Path | Description | Expected Range |
|---|---|---|
| `tests/test_api_endpoints.py` | Add TDD tests for preset CRUD API endpoints | Line 105-112 |
| `engine/storyPresets.js` | Load and save presets from/to `game/presets.json` | Line 1-50 |
| `engine/index.js` | Expose getPresets and savePresets in AdventureEngine | Line 120-150 |
| `web/routes/game.js` | Add POST/PUT/DELETE endpoints for `/api/presets` | Line 10-15 |
| `web/templates/index.html` | Add screens, editor forms, and progress indicators | Line 47-150 |
| `web/static/js/app.js` | Wire up navigation, click handlers, and back buttons | Line 30-150 |
| `web/static/js/ui/screens.js` | Manage keyboard focus and progress indicator updates | Line 19-50 |
| `web/static/js/api/presets.js` | Implement frontend CRUD API calls and editor UI | Line 3-80 |

## 1. Test Scaffolding (TDD)

- [ ] 1.1 Add failing integration tests to `tests/test_api_endpoints.py` (e.g. `test_preset_crud_endpoints`) that verify creating, updating, and deleting presets via POST, PUT, and DELETE on `/api/presets`
- [ ] 1.2 Add E2E tests or placeholder assertions in `tests/e2e/test_menu_navigation.py` to verify the setup flow transitions through boundaries and character screens correctly

## 2. Backend Presets Persistence

- [ ] 2.1 Refactor `engine/storyPresets.js` to implement asynchronous loading and saving of presets from `game/presets.json`, using the hardcoded list as an initial fallback
- [ ] 2.2 Expose `getPresets()` and `savePresets()` methods on `AdventureEngine` in `engine/index.js`
- [ ] 2.3 Update `web/routes/game.js` endpoints for GET, POST, PUT, and DELETE on `/api/presets` to dynamically read/write JSON files using the active engine instance

## 3. Frontend Setup Wizard Refactor

- [ ] 3.1 Implement a retro step-by-step progress indicator in `web/templates/index.html` at the top of the `#preset-screen`, `#custom-preset-screen`, and `#character-screen` panels
- [ ] 3.2 Add `#preset-manager-screen` and `#preset-editor-screen` markup with nested character creation form lists to support CRUD actions
- [ ] 3.3 Update `web/static/js/ui/screens.js` to update progress indicators and programmatically set keyboard focus to the first active card or input on transition
- [ ] 3.4 Refactor `web/static/js/api/presets.js` and `web/static/js/app.js` to render edit/delete buttons on preset cards, manage editor modes (create vs edit vs customize), and wire up back buttons to respect `window.storyCustomized`
- [ ] 3.5 Run the test suite using `python3 -m pytest tests/` to confirm that all tests pass and verify the setup flow manually
