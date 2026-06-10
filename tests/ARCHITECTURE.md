# Test Architecture

> **Deprecated:** The Python CLI proxy (`game/adventure_engine.py`) and its
> tests (`test_cli_behavior.py`, `test_pty_integration.py`,
> `simulate_playtest.py`) are **deprecated**. They may fail and are not
> required to pass. Focus on the Node.js backend (`engine/`) and E2E tests
> (`tests/e2e/`).

## Test Files

| File | Type | What it tests |
|------|------|---------------|
| `test_api_endpoints.py` | Integration (unittest) | REST API endpoints under `MOCK_LLM=1` — init, state, action streaming, system prompt, summary, lore CRUD. Spawns a Node.js server on port 5001. |
| `test_memory_features.py` | Integration (unittest) | Memory extraction pipeline — inventory, events, lore, stats, and RAG search. Spawns a Node.js server on port 5002. |
| `test_cli_behavior.py` | Unit (unittest) | CLI modules in isolation — layout rendering, input handling, lore menus, load/save menus, autoplay, history cycling, suggestions. No server required. |
| `test_pty_integration.py` | Integration (unittest) | CLI in a pseudo-terminal — verifies system menu clears screen. **Skipped** (CLI deprecated). |
| `simulate_playtest.py` | Integration (unittest) | Full CLI gameplay simulation through mocked menus and inputs. |
| `e2e/test_menu_navigation.py` | E2E (pytest + Playwright) | Browser-based UI — keyboard nav, hotkeys, preset/character flows, launch states, save/restore, lore scan, system prompt editing. Spawns a Node.js server on port 5001. |

## Save Isolation

Every test file that creates saves uses the `SAVE_DIR` environment variable to redirect the engine's file writes to an isolated directory under `tests/`.

| Test file | Isolated save directory |
|-----------|------------------------|
| `test_api_endpoints.py` | `tests/adventures_api_test/` |
| `test_memory_features.py` | `tests/adventures_memory_test/` |
| `test_cli_behavior.py` | `tests/adventures_cli_test/` |
| `test_pty_integration.py` | `tests/adventures_pty_test/` |
| `simulate_playtest.py` | `tests/adventures_sim_test/` |
| `test_menu_navigation.py` | `tests/adventures/` |

The engine derives a `data/` directory from `SAVE_DIR` as `{SAVE_DIR}/../data` (e.g. `tests/adventures_memory_test/../data` → `tests/data/`). This is where SQLite memory databases and vector indexes live during memory-feature tests.

## Port-Conflict Guard

Tests that spawn a Node.js server (`test_api_endpoints.py`, `test_menu_navigation.py`) check if the target port is already in use **before** starting. If it is (e.g. the user's playtest server is running), they raise a clear `RuntimeError`:

```
Port 5001 is already in use — please stop your server before running tests.
```

This prevents the test from silently reusing the user's production server, which would inject mock saves into `game/adventures/` (the production save directory).

## Cleanup Strategy

Each test is responsible for cleaning up its own isolated directories. Cleanup happens via `tearDown` (per-test) or `tearDownClass` (per-class):

- **Per-test cleanup** (`tearDown`): Removes individual JSON save files created during that test. Implemented in `test_api_endpoints.py`, `test_pty_integration.py`.
- **Per-class cleanup** (`tearDownClass`): Removes the entire save directory and derived data directory using `shutil.rmtree`. Implemented in `test_api_endpoints.py`, `test_memory_features.py`, `test_cli_behavior.py`, `simulate_playtest.py`.
- **Pytest session cleanup** (`start_server` fixture): Removes the save directory after the last E2E test finishes. Implemented in `test_menu_navigation.py`.

No test ever writes to or deletes from `game/adventures/` (production) or `game/data/` (production memory).

## Historical Bugs Fixed

| Bug | Fix |
|-----|-----|
| `simulate_playtest.py` `tearDown` created `AdventureEngine()` without `SAVE_DIR`, then deleted `*.json` files from `game/adventures/` | Added `setUp` with isolated save dir + `SAVE_DIR`. Replaced file-deletion logic with `shutil.rmtree` of the test dir. |
| `test_memory_features.py` `_cleanup_data_files()` deleted `game/data/` (production memory DB and vector indexes) | Removed `_cleanup_data_files()`. Now only `shutil.rmtree` of the test-local dirs in `tearDownClass`. |
| Port-sharing: tests silently reused an existing server on port 5001 (e.g. a user's playtest session), writing mock saves to `game/adventures/` | Added port-conflict guard that raises `RuntimeError` if port is already in use. |
| `tests/data/` accumulated stale artifacts across runs | Cleanup moved to `tearDownClass` so the derived data dir is removed with the save dir. |