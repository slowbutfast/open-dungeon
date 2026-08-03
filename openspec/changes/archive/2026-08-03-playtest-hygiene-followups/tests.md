## Automated Tests

- `node --check engine/context.js && node --check mcp/server.js` — both pass.
- **New — summary sanitization tests** (`tests/test_engine_status_parsing.py::TestSummarySanitization`): a scripted summarizer response echoing `[CURRENT STATUS]`/`[CURRENT INVENTORY]` blocks and a raw `[Status: ...]` line must leave `state.summary` and the save-file `summary` field sanitized (prose preserved, no `[Status:`/`[CURRENT` tokens). Confirmed red against the pre-fix code (raw summary) and green after.
- **MCP + status-parsing gates:** `MOCK_LLM=1 python3 -m pytest tests/test_mcp_*.py tests/test_shared_status_parser.py tests/test_scoring.py tests/test_engine_status_parsing.py -q` — **124 passed, 8 subtests passed** (retrospective run).
- **Broad suite:** `MOCK_LLM=1 python3 -m pytest tests/ -q --ignore=tests/test_cli_behavior.py --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py --ignore=tests/test_live_llm.py` — **271 passed, 12 subtests passed** (includes the 3 new summary tests; was 268 before).
- Fixed-port / live-LLM suites (`test_live_llm.py`, `test_pty_integration.py`, `simulate_playtest.py`, `test_cli_behavior.py`) were **not** run.

## Manual Verification

- **MCP server startup guard:**
  - **WHEN** running `node mcp/server.js` with `SAVE_DIR` unset (mock mode) → **THEN** stderr shows `SAVE_DIR resolved to: .../game/adventures` plus a `[mcp] WARNING` about the production save tree.
  - **WHEN** running it with `SAVE_DIR=game/playtest/adventures` and `MOCK_LLM=1` → **THEN** only the resolved-save-dir line prints, no warning. (Both verified this session.)
- **MCP env wiring (post-restart):**
  - **WHEN** restarting OpenCode (so the per-server `environment` block and the `playtest` agent load) and calling `dungeon_get_debug_info`
  - **THEN** `save_dir` reports `game/playtest/adventures`, the backend is mock (`MOCK_LLM=1`), and no real API spend accrues. (Deferred until the session is restarted — see research "Unverified assumptions".)
- **Playtest subagent:**
  - **WHEN** invoking `@playtest` after the restart
  - **THEN** the agent runs a mock-first, sandboxed playtest and returns the feature-verdict report format (Verdict / scenarios / evidence / contract status / issues / recommendations).
