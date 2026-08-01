# Target Context Map

Anchored by file (location-based anchors avoid the brittleness of line ranges that shift as edits land):

| File Path | Anchor / Region | Purpose |
| --- | --- | --- |
| `pytest.ini` | new file at repo root | Marker registration (`unit`, `integration`, `e2e`) via `markers =` block. Suppresses `PytestUnknownMarkWarning`. |
| `tests/conftest.py` | `pytest_configure` hook | Inject fallback `SAVE_DIR=tests/.tmp_saves/default` before any test collects. Currently only registers an `atexit` MCP cleanup handler. |
| `tests/test_helpers.py` | new `safe_rmtree` helper, alongside existing `assert_save_dir_is_safe` | Permission-aware `shutil.rmtree` wrapper. Existing guard **unchanged**. |
| `tests/mcp_client.py` | `_build_env` method, `start` method | Add `assert_save_dir_is_safe(save_dir)` calls around the existing `tests/mcp_test_data` path computation. |
| `package.json` | `scripts` block | Add `test:fast`, `test:e2e`, `test:all` (with `--ignore` flags for deprecated CLI tests). |
| `tests/ARCHITECTURE.md` | all sections | Document new fallback, `safe_rmtree`, marker tier matrix, deprecated-CLI exclusion, current MCP/E2E catalog. |

---

## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing test in a new `tests/test_test_helpers.py` (or extend `tests/test_helpers.py` with self-tests) verifying the fallback directory `tests/.tmp_saves/default` is selected when `os.environ["SAVE_DIR"]` is unset, and that an explicit per-suite `os.environ["SAVE_DIR"] = ...` set after `pytest_configure` takes precedence.
- [x] 1.2 Write failing test verifying `safe_rmtree` successfully removes a directory tree containing read-only files (created via `os.chmod(path, stat.S_IREAD)`) without raising `PermissionError`.
- [x] 1.3 Write failing test verifying Pytest markers (`unit`, `integration`, `e2e`) correctly filter test suites (e.g. `pytest -m unit` selects only `@pytest.mark.unit` tests in a scratch fixture file, and emits zero `PytestUnknownMarkWarning`).

## 2. Global Conftest Fallback & Teardown Guard

- [x] 2.1 Add `pytest_configure(config)` hook in `tests/conftest.py` that sets `os.environ.setdefault("SAVE_DIR", os.path.join(tests_dir, ".tmp_saves", "default"))` so the fallback applies only when not already configured by the operator. Use `setdefault` so per-suite overrides set later in `setUp` (or pre-exported in the shell) take precedence.
- [x] 2.2 Add `safe_rmtree(path)` helper to `tests/test_helpers.py` invoking `shutil.rmtree(path, onerror=_chmod_retry)` where `_chmod_retry(func, p, exc_info)` calls `os.chmod(p, stat.S_IWRITE)` then retries `func(p)`. Keep existing `assert_save_dir_is_safe` untouched.
- [x] 2.3 Add `assert_save_dir_is_safe(save_dir)` invocation inside `tests/mcp_client.py` `_build_env` (after computing `save_dir`) and inside `start` (after `os.makedirs`). Existing `SAVE_DIR = tests/mcp_test_data` behavior preserved.

## 3. Tiered Test Execution Setup

- [x] 3.1 Create `pytest.ini` at repo root with:
  ```
  [pytest]
  markers =
      unit: pure component tests, no spawned Node.js / MCP subprocess
      integration: API / MCP / memory tests that spawn Node.js or MCP stdio subprocess
      e2e: Playwright browser tests executing against a test backend
  ```
- [x] 3.2 Apply marker decorators per the **fixed mapping table** below. (Deprecated tests still receive markers for archival completeness but are excluded from `test:all` via `--ignore` — see task 3.3.)

  | Test File | Marker | Rationale |
  |---|---|---|
  | `tests/test_cli_behavior.py` | `unit` | Pure CLI modules in isolation, no server. **(Deprecated — excluded from `test:all`)** |
  | `tests/test_api_endpoints.py` | `integration` | Spawns Node Express server on port 5001. |
  | `tests/test_memory_features.py` | `integration` | Spawns Node Express server on port 5002; SQLite + vector indexes. |
  | `tests/test_mcp_*.py` (10 files: barter, diagnostics, gameplay, memory, protocol, session, state, tools, etc.) | `integration` | Each spawns the MCP stdio subprocess. **Classified as `integration`, not `unit`** — they spawn a subprocess. |
  | `tests/test_barter_engine.py` | `unit` | Pure barter logic, no server. |
  | `tests/test_memory_features.py` (if any sub-modules are pure) | `integration` | Spawns server — kept `integration` to avoid marker ambiguity. |
  | `tests/test_live_llm.py` | `integration` | Requires live LLM; spawns server. |
  | `tests/test_openrouter_models.py` | `integration` | Network-dependent. |
  | `tests/e2e/test_menu_navigation.py` | `e2e` | Playwright browser, spawns Node server on port 5001. |
  | `tests/test_pty_integration.py` | `integration` | **(Deprecated — excluded from `test:all`)** |
  | `tests/simulate_playtest.py` | `integration` | **(Deprecated — excluded from `test:all`)** |

- [x] 3.3 Add `npm` scripts to `package.json`:
  ```
  "test:fast": "python -m pytest -m unit",
  "test:e2e":   "python -m pytest -m e2e",
  "test:all":   "python -m pytest tests/ -v --ignore=tests/test_cli_behavior.py --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py"
  ```
  The `--ignore` flags enforce the deprecation policy from `AGENTS.md` at the script layer: deprecated tests still receive markers (for archival completeness) but are not exercised by `test:all`.

## 4. Test Architecture Documentation

- [x] 4.1 Update `tests/ARCHITECTURE.md` to document:
  - **Storage isolation rules**: existing per-suite dir table (preserved) + new global fallback sandbox `tests/.tmp_saves/default/` + explicit precedence rule.
  - **Teardown handlers**: new `safe_rmtree` helper (alongside existing `assert_save_dir_is_safe`).
  - **Tiered execution commands**: `pytest -m unit/integration/e2e` and the corresponding npm scripts; the marker → file mapping table from task 3.2.
  - **Deprecated-CLI exclusion**: explicit note that `test:all` skips deprecated tests via `--ignore`.
  - **Operator warning**: manual `node web/server.js` launches bypass the global default and fall back to `game/adventures/` — operators must pass `SAVE_DIR` explicitly for non-production sessions.
  - **Catalog refresh**: add MCP test files (`test_mcp_*.py`) and E2E test files currently missing from the catalog table.

## 5. Verification

- [x] 5.1 Run `python -m pytest -m unit` and verify execution completes without spawning Node.js / MCP subprocesses, in single-digit seconds (target, not pass criterion — actual runtime depends on test body size).
- [x] 5.2 Run `python -m pytest -m integration` and verify API endpoint and MCP stdio protocol tests pass under per-suite `SAVE_DIR` overrides.
- [x] 5.3 Run `python -m pytest -m e2e` (equivalently `python -m pytest tests/e2e/`) and verify Playwright browser tests run in isolation without polluting `game/adventures/`.
- [x] 5.4 Run `npm run test:all` and verify **all non-deprecated tests** pass (deprecated CLI/PTY/playtest tests are explicitly ignored) with zero stale directory leaks under `tests/.tmp_saves/default/` (or any per-suite dir after teardown).
- [x] 5.5 Verification of precedence: in a scratch test, set `os.environ["SAVE_DIR"] = "tests/adventures_precedence_test"` *after* `pytest_configure` runs, then assert the engine resolves to that path (not the global fallback).