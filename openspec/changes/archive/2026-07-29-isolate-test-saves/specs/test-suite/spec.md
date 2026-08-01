## MODIFIED Requirements

> **Merge note:** The existing capability spec at `openspec/specs/test-suite/spec.md` already contains the "Test Save Environment Isolation" requirement (archived from the `isolate-test-save-directories` change). This MODIFIED block **merges new scenarios** into that requirement (fallback default + robust teardown) rather than replacing the existing scenarios, and updates the SHALL clause to reference the new global default. The two new scenarios below ("Automatic fallback for un-configured test environments" and "Robust teardown cleanup on read-only temp files") are ADDITIONS to the existing scenarios ("Isolated E2E save directory" and "Teardown path guard protection").

### Requirement: Test Save Environment Isolation
The automated test suite SHALL execute process spawns and save file operations strictly within isolated subdirectories under `tests/` and SHALL NOT mutate or delete production game saves in `game/adventures/`. On test framework initialization, the default `SAVE_DIR` SHALL automatically fall back to an isolated test sandbox (`tests/.tmp_saves/default`) if un-configured by the operator or by a per-suite override. Per-suite `SAVE_DIR` overrides set in a test's `setUp` (or via subprocess environment) SHALL take precedence over the global fallback. Teardown directory deletion SHALL handle POSIX file permission locks safely without raising unhandled errors, while continuing to gate all teardown paths behind the existing `assert_save_dir_is_safe` guard.

#### Scenario: Isolated E2E save directory
- **WHEN** Playwright E2E tests are executed
- **THEN** backend process is spawned with `SAVE_DIR` pointing to an isolated directory under `tests/`

#### Scenario: Teardown path guard protection
- **WHEN** test teardown hooks perform directory cleanup
- **THEN** system asserts target directory is strictly located inside `tests/` and aborts if path points to `game/adventures`

#### Scenario: Automatic fallback for un-configured test environments
- **WHEN** a test or process runs under pytest without an explicit `SAVE_DIR` environment variable set (and no per-suite `setUp` override)
- **THEN** the `pytest_configure` hook defaults `SAVE_DIR` to `tests/.tmp_saves/default` before any `AdventureEngine` construction occurs

#### Scenario: Per-suite override precedence
- **WHEN** a test `setUp` sets `os.environ["SAVE_DIR"]` to a per-suite path (e.g. `tests/adventures_api_test/`) after `pytest_configure` has applied the global fallback
- **THEN** the engine resolves `SAVE_DIR` to the per-suite path, not the global fallback, because the engine reads `process.env.SAVE_DIR` at construction time and the most recent assignment wins

#### Scenario: Robust teardown cleanup on read-only temp files
- **WHEN** directory cleanup is executed on test temporary directories containing read-only files (e.g. SQLite temp databases)
- **THEN** the `safe_rmtree` helper modifies file permissions to read-write via `os.chmod(path, stat.S_IWRITE)` prior to unlinking to guarantee complete removal without raising `PermissionError`

## ADDED Requirements

### Requirement: Tiered Test Execution
The test suite SHALL support tiered execution markers (`unit`, `integration`, `e2e`) registered in `pytest.ini` at the repository root, to allow running fast component/unit tests independently of slow browser integration tests. The markers SHALL be applied per a fixed module mapping (documented in `tasks.md` §3.2). Notably, MCP stdio subprocess tests (`test_mcp_*.py`) SHALL be classified as `integration`, not `unit`, because they spawn a subprocess.

#### Scenario: Running fast component unit tests
- **WHEN** developer runs `pytest -m unit` or `npm run test:fast`
- **THEN** only pure component/unit tests execute without spawning background Node.js web servers or MCP stdio subprocesses

#### Scenario: Running E2E Playwright tests
- **WHEN** developer runs `pytest -m e2e` or `npm run test:e2e`
- **THEN** Playwright browser tests execute against spawned test backend servers

#### Scenario: Excluding deprecated tests from the full suite
- **WHEN** developer runs `npm run test:all`
- **THEN** the deprecated Python CLI tests (`test_cli_behavior.py`, `test_pty_integration.py`, `simulate_playtest.py`) are excluded via `--ignore` flags per the deprecation policy documented in `AGENTS.md`, and **all non-deprecated tests** are exercised

#### Scenario: Marker registration silences unknown-mark warnings
- **WHEN** pytest collects test files decorated with `@pytest.mark.unit` / `integration` / `e2e`
- **THEN** zero `PytestUnknownMarkWarning` messages are emitted, because the markers are declared in `pytest.ini`'s `markers` block