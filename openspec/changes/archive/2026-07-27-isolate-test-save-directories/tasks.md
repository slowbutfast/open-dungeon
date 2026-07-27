## 1. Test Scaffolding (TDD)

- [x] 1.1 Add directory guard helper assertion in test setup/teardown modules asserting `TEST_SAVE_DIR` is scoped under `tests/adventures_*`.

## 2. Core Implementation

- [x] 2.1 Update `TEST_SAVE_DIR` in `tests/e2e/test_menu_navigation.py` to `tests/adventures_e2e_test`.
- [x] 2.2 Add teardown assertion checks in `tests/test_api_endpoints.py`, `tests/test_memory_features.py`, and `tests/test_openrouter_models.py` rejecting non-test directory cleanup.
- [x] 2.3 Update `.gitignore` to ignore all `tests/adventures_*` and `tests/presets.json` files.
- [x] 2.4 Run full pytest suite and verify production save directory isolation.
