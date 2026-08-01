# Test Architecture

> **Deprecated:** The Python CLI proxy (`game/adventure_engine.py`) and its
> tests (`test_cli_behavior.py`, `test_pty_integration.py`,
> `simulate_playtest.py`) are **deprecated**. They may fail and are not
> required to pass. Focus on the Node.js backend (`engine/`) and E2E tests
> (`tests/e2e/`).

## Test Files

| File | Type | Marker | What it tests |
|------|------|--------|---------------|
| `test_api_endpoints.py` | Integration (unittest) | `integration` | REST API endpoints under `MOCK_LLM=1` — init, state, action streaming, system prompt, summary, lore CRUD. Spawns a Node.js server on port 5001. |
| `test_memory_features.py` | Integration (unittest) | `integration` | Memory extraction pipeline — inventory, events, lore, stats, and RAG search. Spawns a Node.js server on port 5002. |
| `test_barter_engine.py` | Integration (unittest) | `unit` | Barter trade execution and NPC quest goal state machine via HTTP API. Spawns a Node.js server on port 5005. |
| `test_cli_behavior.py` | Unit (unittest) | `unit` | CLI modules in isolation — layout rendering, input handling, lore menus, load/save menus, autoplay, history cycling, suggestions. No server required. **(Deprecated — excluded from `test:all`)** |
| `test_pty_integration.py` | Integration (unittest) | `integration` | CLI in a pseudo-terminal — verifies system menu clears screen. **Skipped** (CLI deprecated). **(Deprecated — excluded from `test:all`)** |
| `simulate_playtest.py` | Integration (unittest) | `integration` | Full CLI gameplay simulation through mocked menus and inputs. **(Deprecated — excluded from `test:all`)** |
| `test_live_llm.py` | Integration (pytest) | `integration` | Live OpenRouter LLM call validation. Requires `OPENROUTER_API_KEY`. |
| `test_openrouter_models.py` | Integration (unittest) | `integration` | OpenRouter model listing and selection. Network-dependent. |
| `test_mcp_barter.py` | Integration (unittest) | `integration` | MCP barter/quest tools — offers, trades, goals. Spawns MCP stdio subprocess. |
| `test_mcp_diagnostics.py` | Integration (unittest) | `integration` | MCP diagnostics tool — debug info, LLM traces, cost. Spawns MCP stdio subprocess. |
| `test_mcp_gameplay.py` | Integration (unittest) | `integration` | MCP gameplay tools — send action, undo. Spawns MCP stdio subprocess. |
| `test_mcp_memory.py` | Integration (unittest) | `integration` | MCP memory/inventory tools — inspect inventory, events, stats, search. Spawns MCP stdio subprocess. |
| `test_mcp_protocol.py` | Integration (unittest) | `integration` | MCP protocol compliance — tool discovery, schemas, error handling. Spawns MCP stdio subprocess. |
| `test_mcp_session.py` | Integration (unittest) | `integration` | MCP session tools — init, list saves, load save. Spawns MCP stdio subprocess. |
| `test_mcp_state.py` | Integration (unittest) | `integration` | MCP state tools — inspect state, history, lore. Spawns MCP stdio subprocess. |
| `test_mcp_tools.py` | Integration (unittest) | `integration` | Comprehensive MCP tool handler tests — all 17 tools. Spawns MCP stdio subprocess. |
| `e2e/test_menu_navigation.py` | E2E (pytest + Playwright) | `e2e` | Browser-based UI — keyboard nav, hotkeys, preset/character flows, launch states, save/restore, lore scan, system prompt editing. Spawns a Node.js server on port 5001. |
| `e2e/test_barter_ui.py` | E2E (pytest + Playwright) | `e2e` | Browser-based barter UI — trade offers, execution, inventory. Spawns a Node.js server. |
| `e2e/test_mobile_viewport.py` | E2E (pytest + Playwright) | `e2e` | Browser-based mobile viewport — responsive layout, touch interactions. Spawns a Node.js server. |

## Save Isolation

Every test file that creates saves uses the `SAVE_DIR` environment variable to redirect the engine's file writes to an isolated directory under `tests/`.

### Global Fallback

`tests/conftest.py` injects a **fallback default** via `pytest_configure`:

```python
os.environ.setdefault("SAVE_DIR", "tests/.tmp_saves/default")
```

This ensures that any test which forgets to set `SAVE_DIR` explicitly will write to `tests/.tmp_saves/default/` instead of `game/adventures/` (production). The `setdefault` call means per-suite overrides set in `setUp` (or pre-exported in the shell) take **precedence** over the global fallback.

### Per-Suite Overrides

| Test file | Isolated save directory |
|-----------|------------------------|
| `test_api_endpoints.py` | `tests/adventures_api_test/` |
| `test_memory_features.py` | `tests/adventures_memory_test/` |
| `test_barter_engine.py` | `tests/adventures_barter_test/` |
| `test_cli_behavior.py` | `tests/adventures_cli_test/` |
| `test_pty_integration.py` | `tests/adventures_pty_test/` |
| `simulate_playtest.py` | `tests/adventures_sim_test/` |
| `test_mcp_*.py` (all MCP tests) | `tests/mcp_test_data/` |
| `e2e/test_menu_navigation.py` | `tests/adventures/` |
| `e2e/test_barter_ui.py` | `tests/adventures_barter_e2e_test/` |
| Unconfigured fallback | `tests/.tmp_saves/default/` |

The engine derives a `data/` directory from `SAVE_DIR` as `{SAVE_DIR}/../data` (e.g. `tests/adventures_memory_test/../data` → `tests/data/`). This is where SQLite memory databases and vector indexes live during memory-feature tests.

### Operator Warning

Manual `node web/server.js` launches **bypass** the `conftest.py` global default and fall back to `game/adventures/` (production). Operators must pass `SAVE_DIR` explicitly for non-production sessions:

```bash
SAVE_DIR=tests/my_test_sandbox node web/server.js
```

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

### Teardown Helper: `safe_rmtree`

`tests/test_helpers.py` provides `safe_rmtree(path)` — a permission-aware wrapper around `shutil.rmtree` that handles read-only SQLite temp files:

```python
def safe_rmtree(path):
    shutil.rmtree(path, onerror=_chmod_retry)
```

The `_chmod_retry` error handler calls `os.chmod(path, stat.S_IWRITE)` then retries the failed operation. Teardown call sites are encouraged to migrate raw `shutil.rmtree` calls to `safe_rmtree`. All teardown paths continue to be gated by the existing `assert_save_dir_is_safe()` guard.

No test ever writes to or deletes from `game/adventures/` (production) or `game/data/` (production memory).

## Tiered Test Execution

Pytest markers registered in `pytest.ini` enable tiered execution:

| Marker | Description | Command | npm script |
|--------|-------------|---------|------------|
| `unit` | Pure component tests, no spawned Node.js / MCP subprocess | `pytest -m unit` | `npm run test:fast` |
| `integration` | API / MCP / memory tests that spawn Node.js or MCP stdio subprocess | `pytest -m integration` | — |
| `e2e` | Playwright browser tests executing against a test backend | `pytest -m e2e` | `npm run test:e2e` |
| (all) | All non-deprecated tests | `pytest tests/ -v` | `npm run test:all` |

### Marker → File Mapping

| Test File | Marker |
|-----------|--------|
| `test_cli_behavior.py` | `unit` |
| `test_barter_engine.py` | `unit` |
| `test_api_endpoints.py` | `integration` |
| `test_memory_features.py` | `integration` |
| `test_live_llm.py` | `integration` |
| `test_openrouter_models.py` | `integration` |
| `test_mcp_*.py` (8 files) | `integration` |
| `test_pty_integration.py` | `integration` |
| `simulate_playtest.py` | `integration` |
| `e2e/test_menu_navigation.py` | `e2e` |
| `e2e/test_barter_ui.py` | `e2e` |
| `e2e/test_mobile_viewport.py` | `e2e` |

### Deprecated-CLI Exclusion

`npm run test:all` explicitly passes `--ignore` flags for deprecated tests:

```bash
python -m pytest tests/ -v \
  --ignore=tests/test_cli_behavior.py \
  --ignore=tests/test_pty_integration.py \
  --ignore=tests/simulate_playtest.py
```

These files still receive marker decorators (for archival completeness) but are not exercised by `test:all`, enforcing the deprecation policy from `AGENTS.md` at the script layer.

## Historical Bugs Fixed

| Bug | Fix |
|-----|-----|
| `simulate_playtest.py` `tearDown` created `AdventureEngine()` without `SAVE_DIR`, then deleted `*.json` files from `game/adventures/` | Added `setUp` with isolated save dir + `SAVE_DIR`. Replaced file-deletion logic with `shutil.rmtree` of the test dir. |
| `test_memory_features.py` `_cleanup_data_files()` deleted `game/data/` (production memory DB and vector indexes) | Removed `_cleanup_data_files()`. Now only `shutil.rmtree` of the test-local dirs in `tearDownClass`. |
| Port-sharing: tests silently reused an existing server on port 5001 (e.g. a user's playtest session), writing mock saves to `game/adventures/` | Added port-conflict guard that raises `RuntimeError` if port is already in use. |
| `tests/data/` accumulated stale artifacts across runs | Cleanup moved to `tearDownClass` so the derived data dir is removed with the save dir. |