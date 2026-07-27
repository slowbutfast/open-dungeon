## Why

Running test suites can result in the deletion or mutation of production game sessions stored in `game/adventures/`. Tests and process teardowns must be strictly isolated to dedicated temporary test directories to prevent session deletion and test artifact pollution.

## What Changes

- **Isolate E2E Test Directory**: Update `TEST_SAVE_DIR` in `tests/e2e/test_menu_navigation.py` from `tests/adventures` to `tests/adventures_e2e_test` so presets and save files do not pollute `tests/adventures` or main directories.
- **Teardown Guardrails**: Add strict path assertions in test cleanup hooks (`tearDownClass`, `shutil.rmtree`) to ensure cleanup is scoped to `tests/adventures_*` and explicitly aborts if `SAVE_DIR` resolves to `game/adventures`.
- **Gitignore Test Artifacts**: Update `.gitignore` to ignore all temporary `tests/adventures_*` and `tests/presets.json` files.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `test-suite`: Isolate all automated test save environments from production save directories and prevent production game data deletion during test execution.

## Impact

- Affected files: `tests/e2e/test_menu_navigation.py`, `tests/test_api_endpoints.py`, `tests/test_memory_features.py`, `.gitignore`.
- No breaking API changes.
