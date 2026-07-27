## Automated Tests

- `python3 -m pytest tests/e2e/test_menu_navigation.py -v`: Verifies E2E navigation suite executes in `tests/adventures_e2e_test` without creating files in `tests/adventures` or `game/adventures/`.
- `python3 -m pytest tests/test_api_endpoints.py tests/test_memory_features.py -v`: Verifies API and memory suites execute cleanly in isolated test directories.

## Manual Verification

- **Production Directory Integrity**:
  - **WHEN** full test suite finishes execution
  - **THEN** `game/adventures/` remains untouched and no `tests/presets.json` or `tests/adventures` leftover directories exist in working tree.
