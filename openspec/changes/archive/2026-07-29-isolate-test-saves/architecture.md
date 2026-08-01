## Context

Running pytest suites or component tests without explicit environment variable configuration presents a risk of mutating or unlinking files in the production save directory `game/adventures/`. Furthermore, teardown cleanup hooks can fail due to POSIX file permission locks on temporary SQLite databases.

This architecture establishes a global default sandbox fallback in `tests/conftest.py`, a new permission-aware teardown helper (`safe_rmtree`) in `tests/test_helpers.py`, MCP client assertions, tiered execution markers registered in `pytest.ini`, and updated test architecture documentation in `tests/ARCHITECTURE.md`.

> **Precedence rule:** A per-suite `os.environ["SAVE_DIR"] = ...` set in a test's `setUp` (or passed via subprocess env) takes **precedence** over the global default set by `pytest_configure`. The engine reads `process.env.SAVE_DIR` at `AdventureEngine` construction (`engine/index.js:50`), so the most recently assigned value wins.

## System Architecture Diagram

```mermaid
flowchart TD
    subgraph Test Execution Framework
        Pytest[Pytest Runner] --> PytestIni[pytest.ini - marker registration]
        Pytest --> Conftest[tests/conftest.py - pytest_configure]
        Conftest -->|Fallback Default| Env[os.environ.SAVE_DIR = tests/.tmp_saves/default]
    end

    subgraph Per-Suite Overrides (Precedence)
        SuiteOverride[Test setUp sets os.environ.SAVE_DIR] -->|Higher priority| Env
    end

    subgraph Process Spawns
        Env -->|Pass ENV| NodeProc[Node Express Backend Server]
        Env -->|Pass ENV| MCPProc[MCP Stdio Server Client - asserts safe path]
        Env -->|Pass ENV| E2EProc[Playwright Browser Runner]
    end

    subgraph Storage Isolation (Existing suite names preserved)
        NodeProc -->|Write Saves| TestDir[tests/adventures_<suite>_test/]
        MCPProc -->|Write Saves| MCPDir[tests/mcp_test_data/]
        E2EProc -->|Write Saves| E2EDir[tests/adventures/]
        Env -.Fallback only.-> FallbackDir[tests/.tmp_saves/default/]
    end

    subgraph Safe Teardown
        TestDir --> Teardown[shutil.rmtree + chmod Handler]
        MCPDir --> Teardown
        E2EDir --> Teardown
        Teardown --> Guard{assert_save_dir_is_safe}
        Guard -->|Verified under tests/| Clean[Directory Unlinked]
        Guard -->|Points outside tests/| Abort[Fail Loudly - Abort]
    end
```

## Goals / Non-Goals

**Goals:**
- Guarantee 100% save environment isolation for all existing and newly created tests.
- Provide automatic fallback to `tests/.tmp_saves/default` if `SAVE_DIR` is not explicitly set.
- Implement robust teardown error handling to fix POSIX permission locks on SQLite files.
- Enable Tiered Test Execution (`unit`, `integration`, `e2e`) for fast feedback loops during small edits.
- Document test architecture, environment setup, and execution tiers in `tests/ARCHITECTURE.md`.

**Non-Goals:**
- Mutating backend game engine persistence code (`engine/index.js`).
- Modifying production save locations (`game/adventures/`).

## Decisions

### 1. Global Fallback via `tests/conftest.py`
- *Decision*: Inject default `SAVE_DIR=tests/.tmp_saves/default` during pytest session initialization as a **fallback only**. Per-suite overrides (set in `setUp` or via subprocess env) take precedence per the precedence rule above.
- *Alternatives Considered*: Manual configuration in every test file. (Rejected: prone to oversight when creating new test files).

### 2. Robust Permission Repair on Teardown
- *Decision*: Add a new `safe_rmtree(path)` helper to `tests/test_helpers.py` that wraps `shutil.rmtree(path, onerror=_chmod_retry)` where `_chmod_retry` calls `os.chmod(path, stat.S_IWRITE)`. Teardown call sites are encouraged (but not strictly required) to migrate raw `shutil.rmtree` calls to `safe_rmtree`. The existing `assert_save_dir_is_safe()` guard is **unchanged** and continues to gate all teardown paths.
- *Alternatives Considered*: Ignoring deletion errors via `ignore_errors=True`. (Rejected: leaves stale files on disk).

### 3. Naming Convention: Preserve Existing Suite Dirs
- *Decision*: Keep existing per-suite directory names (`tests/adventures_<suite>_test/`, `tests/mcp_test_data/`, `tests/adventures/`). The only new directory introduced is the global fallback sandbox `tests/.tmp_saves/default/`.
- *Alternatives Considered*: Migrating all suite dirs to `tests/.tmp_saves/<suite>/`. (Rejected: pure churn — duplicates working isolation with no behavioral gain, risks merge ambiguity, and would invalidate existing `tests/ARCHITECTURE.md` references).

### 4. Pytest Markers for Tiered Execution
- *Decision*: Register `@pytest.mark.unit`, `@pytest.mark.integration`, and `@pytest.mark.e2e` in **`pytest.ini`** at the repo root (`markers =` block). `pytest.ini` is chosen over `conftest.py` because marker registration is configuration, not fixture/hook code; the ini home also silences `PytestUnknownMarkWarning`.
- *Alternatives Considered*: Splitting test files into separate directory trees. (Rejected: breaks existing test import structures).

## Risks / Trade-offs

- **[Risk]** Un-isolated background processes spawned outside of pytest (e.g. manual `node web/server.js` execution) bypass the global `conftest.py` default and fall through to `engine/index.js:53`'s production default (`game/adventures/`).
  - *Mitigation*: This risk is **out of scope** for the test-suite capability. The engine's production fallback behavior at `engine/index.js:48-57` is intentionally unchanged. Document this in `tests/ARCHITECTURE.md` so operators know manual server launches require explicit `SAVE_DIR`. (Note: an earlier draft of this change incorrectly claimed the engine "already requires explicit `SAVE_DIR`" — that is false; the engine falls back to `game/adventures/` when unset.)
- **[Risk]** Pytest marker warnings if markers are unregistered.
  - *Mitigation*: Register all three markers in `pytest.ini` (`markers =` block), which both declares them and silences `PytestUnknownMarkWarning`.
- **[Risk]** Marker mis-assignment causes `pytest -m unit` to inadvertently run slow subprocess-spawning tests.
  - *Mitigation*: The mapping table in `tasks.md` §3.2 fixes the assignment. Specifically, `test_mcp_*.py` files are classified as `integration` (they spawn an MCP stdio subprocess), not `unit`.
- **[Risk]** `test_cli_behavior.py`, `test_pty_integration.py`, and `simulate_playtest.py` are deprecated and may not pass (per `AGENTS.md`).
  - *Mitigation*: `npm run test:all` script explicitly passes `--ignore` flags for these three files so the deprecation policy is enforced at the script layer. They still receive marker decorators (`test_cli_behavior.py` → `unit`) so the markers exist for archival completeness, but they will not be exercised by `test:all`.
