## Why

The test suite (`pytest tests/`) is exposed to two latent risks around save directory isolation:

1. **Unconfigured fallback drift**: `engine/index.js` resolves the production save directory `game/adventures/` whenever `process.env.SAVE_DIR` is unset (see `engine/index.js:53`). There is currently **no global pytest safeguard** that injects a safe default — isolation depends on each test file remembering to set `os.environ["SAVE_DIR"]` in `setUp`. New tests (or test files written out-of-band) that forget this will silently target production saves.
2. **Fragile teardown**: `shutil.rmtree` can raise `PermissionError` on read-only SQLite temp files left behind by crashed processes, leaving orphan directories and aborted test runs. The existing `assert_save_dir_is_safe` guard in `tests/test_helpers.py` validates path bounds, but no permission-aware wrapper exists for the actual `rmtree` call.

Additionally, developers currently lack a clear tiered execution model to run fast component tests independently of slow Playwright E2E browser tests during small iterative edits, and the co-located test architecture documentation ([`tests/ARCHITECTURE.md`](file:///home/node/global-sandbox/projects/open-dungeon/tests/ARCHITECTURE.md)) lacks details on recent MCP and E2E additions.

GitHub Issue: #6

> **Note on existing isolation:** This change is a **hardening pass**, not a greenfield isolation effort. Per-suite `SAVE_DIR` overrides are already implemented across `test_api_endpoints.py`, `test_memory_features.py`, `test_cli_behavior.py`, `simulate_playtest.py`, `tests/e2e/test_menu_navigation.py`, and `tests/mcp_client.py` (see the table in `tests/ARCHITECTURE.md:24-31`). This change adds a **global fail-safe default** so unconfigured tests no longer silently regress to `game/adventures/`, plus a robust teardown wrapper and tiered execution. The existing `assert_save_dir_is_safe()` helper in `tests/test_helpers.py` is **unchanged** — only a new `safe_rmtree` helper is added.

## Context & Conversation History

During interactive discovery, several key trade-offs and architectural decisions were evaluated:

1. **Global Default Guard vs. Per-Test Manual Setup**:
   - *Trade-off*: Relying on individual test files to set `os.environ["SAVE_DIR"]` is error-prone when new tests are created.
   - *Decision*: Configure a global `pytest.ini` / `conftest.py` default so un-isolated processes fall back to a safe test sandbox directory instead of `game/adventures/`.

2. **Naming Convention: Reuse Existing `adventures_*_test/` Dirs vs. Migrate to `tests/.tmp_saves/<suite>/`**:
   - *Trade-off*: Introducing a new `.tmp_saves/` namespace duplicates existing suite directories (`tests/adventures_api_test/`, `tests/mcp_test_data/`, `tests/adventures/`) and risks churn/merge ambiguity.
   - *Decision*: **Keep the existing suite directory names**. The global fallback default is the *only* new path added (`tests/.tmp_saves/default/`), used exclusively for un-configured process spawns. Existing per-suite overrides continue to use `tests/adventures_<suite>_test/` (and `tests/mcp_test_data/` for MCP, `tests/adventures/` for E2E).

3. **POSIX Permission Locks & Stale Directories**:
   - *Trade-off*: SQLite memory databases and temp files can cause `shutil.rmtree` to throw `PermissionError` on read-only files during teardown.
   - *Decision*: Implement a robust error handler in `test_helpers.py` (`safe_rmtree`) using `shutil.rmtree(..., onerror=_chmod_retry)` to force read-write permissions before unlinking. Calls to `safe_rmtree` continue to be gated by the existing `assert_save_dir_is_safe()` guard.

4. **Tiered Execution Strategy**:
   - *Trade-off*: Running full E2E Playwright tests on every tiny CSS or engine tweak slows down developer velocity.
   - *Decision*: Register Pytest markers (`unit`, `integration`, `e2e`) and npm script shortcuts so developers can execute `pytest -m unit` for fast component feedback. Markers are registered in `pytest.ini` (`markers =` block) to silence `PytestUnknownMarkWarning`.

## What Changes

- **Marker Registration (`pytest.ini`, new file at repo root)**: Declare `unit`, `integration`, `e2e` markers via the conventional `markers =` block. `pytest.ini` is chosen over `conftest.py` because marker registration (not fixture/hook code) belongs in the ini configuration.
- **Global Pytest Default (`tests/conftest.py`)**: Inject `SAVE_DIR=tests/.tmp_saves/default` in `pytest_configure` as a *fallback only*. Per-suite overrides set in individual test `setUp`/`os.environ` take precedence (the engine reads `process.env.SAVE_DIR` at `AdventureEngine` construction time, so any later `os.environ["SAVE_DIR"] = ...` overrides the global default).
- **Robust Teardown Helper (`tests/test_helpers.py`)**: Add new `safe_rmtree(path)` helper invoking `shutil.rmtree(path, onerror=_chmod_retry)` where `_chmod_retry` calls `os.chmod(path, stat.S_IWRITE)`. The existing `assert_save_dir_is_safe()` helper is **unchanged**. Teardown sites may adopt `safe_rmtree` to replace raw `shutil.rmtree` calls.
- **MCP Client Hardening (`tests/mcp_client.py`)**: Add `assert_save_dir_is_safe(save_dir)` calls inside `_build_env` and `start` (around the existing `tests/mcp_test_data` path computation) so future modifications to that path are caught. Existing `SAVE_DIR` isolation behavior is preserved.
- **Marker Assignment**: Apply `@pytest.mark.unit`/`integration`/`e2e` to each test module per the mapping table in `tasks.md` §3.2.
- **Tiered Execution NPM Scripts (`package.json`)**: Add `test:fast` (`pytest -m unit`), `test:e2e` (`pytest -m e2e`), and `test:all` (`pytest tests/ -v --ignore=tests/test_cli_behavior.py --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py`). The `--ignore` flag explicitly excludes deprecated CLI tests (per `AGENTS.md` and `tests/ARCHITECTURE.md:3-6`).
- **Updated Test Architecture Documentation**: Update [`tests/ARCHITECTURE.md`](file:///home/node/global-sandbox/projects/open-dungeon/tests/ARCHITECTURE.md) to document: the new global fallback, the `safe_rmtree` helper, the marker tier matrix per the mapping table, the deprecated-CLI test exclusion, and current MCP/E2E test files missing from the existing catalog.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `test-suite`: Hardened test save isolation (global fail-safe default, permission-aware teardown wrapper, MCP client assertions), tiered execution markers, and refreshed architecture documentation.

## Impact

- **Test Infrastructure**: `tests/conftest.py`, `tests/test_helpers.py`, `tests/mcp_client.py`, plus new `pytest.ini` at repo root.
- **Test Modules**: All test files in `tests/` receive marker decorators per the mapping table.
- **Package Configuration**: `package.json` (add scripts: `test:fast`, `test:e2e`, `test:all`).
- **Documentation**: `tests/ARCHITECTURE.md`.
- **No breaking changes to backend core engine**: Changes are scoped to test environment setup, test runner configuration, and documentation. The engine's `SAVE_DIR` resolution logic in `engine/index.js:48-57` is unchanged.