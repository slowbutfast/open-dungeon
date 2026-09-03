## Automated Tests

- `python -m pytest tests/ -v`: Runs the full test suite (excluding deprecated CLI/PTY/playtest tests when invoked via `npm run test:all`) and verifies overall test execution under the global `conftest.py` fallback isolation.
- `python -m pytest -m unit`: Runs pure component/unit tests (target single-digit seconds) without spawning background Node.js Express servers or MCP stdio subprocesses. Actual runtime depends on test body size — **not** a pass criterion.
- `python -m pytest -m integration`: Verifies API endpoint and MCP stdio protocol test cases under per-suite `SAVE_DIR` overrides (which take precedence over the global fallback — see precedence rule in `architecture.md`).
- `python -m pytest -m e2e`: Verifies Playwright browser tests execute in isolation against a test backend without polluting `game/adventures/` (production save directory).
- `npm run test:fast`: Shortcut command verifying fast unit test suite marker filtering.
- `npm run test:all`: Shortcut command running the full (non-deprecated) test suite. Pass criterion: **all non-deprecated tests pass** — deprecated CLI tests (`test_cli_behavior.py`, `test_pty_integration.py`, `simulate_playtest.py`) are excluded via `--ignore` per the deprecation policy in `AGENTS.md` and `tests/ARCHITECTURE.md:3-6`, so their failure does not block.

## Manual Verification

- **Environment Fallback Guard**:
  - **WHEN** running a process spawned under `pytest` without `SAVE_DIR` set in environment (and no per-suite override)
  - **THEN** the global `pytest_configure` hook in `tests/conftest.py` defaults `SAVE_DIR` to `tests/.tmp_saves/default`, the engine resolves saves to that sandbox (`engine/index.js:50-51`), and no files are written to `game/adventures/`.

- **Precedence Override**:
  - **WHEN** a test `setUp` (or operator shell export) sets `os.environ["SAVE_DIR"] = tests/adventures_<suite>_test/` **after** `pytest_configure` has run
  - **THEN** the engine resolves to the per-suite path (not the global fallback), because the engine reads `process.env.SAVE_DIR` at `AdventureEngine` construction time (`engine/index.js:48-57`) and the most recent assignment wins.

- **Manual Server Launch (Operator Warning)**:
  - **WHEN** an operator launches `node web/server.js` outside of pytest with `SAVE_DIR` unset
  - **THEN** the engine falls back to production `game/adventures/` (`engine/index.js:53`). This is intended behavior and is documented as out-of-scope for the test-suite capability. Operators must pass an explicit `SAVE_DIR` for non-production sessions.

- **Teardown & Stale Directory Cleanliness**:
  - **WHEN** running unit, integration, or E2E tests to completion (or interrupting with `Ctrl+C`)
  - **THEN** teardown hooks invoking `safe_rmtree` remove temporary test directories cleanly without leaving stale folders or `PermissionError` tracebacks, even when read-only SQLite temp files are present.

- **Architecture Documentation Accuracy**:
  - **WHEN** reviewing [`tests/ARCHITECTURE.md`](tests/ARCHITECTURE.md)
  - **THEN** the document reflects: (a) the new global fallback sandbox and precedence rule, (b) the `safe_rmtree` helper alongside the unchanged `assert_save_dir_is_safe` guard, (c) the marker tier matrix and npm script shortcuts, (d) the deprecated-CLI exclusion, (e) an up-to-date catalog including MCP and E2E test files.