## Automated Tests

- `MOCK_LLM=1 python3 -m pytest tests/test_probe_runner.py -v -k "scripted"`: scripted-narration smoke test — a probe spawned with `MOCK_SCRIPT_FILE` pointing at a script of 2+ distinct locations emits varying status-line locations across successive `/api/action` turns, and the last line holds when the script is exhausted (spec: Scripted Narration via MOCK_SCRIPT_FILE → varying locations, exhaustion holds last).
- `MOCK_LLM=1 python3 -m pytest tests/test_probe_runner.py -v -k "scripted"`: engine-owned score/moves — with a scripted narrator carrying `Score: 0`/`Moves: N`, the committed `score`/`moves` (via `GET /api/state`) come from the engine's single-owner path, not the scripted fields (spec: Engine Remains Score/Moves Owner).
- `MOCK_LLM=1 python3 -m pytest tests/test_probe_runner.py -v -k "scripted"`: runner passthrough — a probe spawned with `MOCK_SCRIPT_FILE` configured gets the var in its env and serves scripted narration; a probe spawned without it omits the var and serves canned narration (spec: Runner Env Passthrough → both scenarios).
- `MOCK_LLM=1 python3 -m pytest tests/test_probe_runner.py -v -k "scripted_bad_path"`: unreadable/invalid `MOCK_SCRIPT_FILE` (missing file, malformed JSON) falls back to canned narration and the server does not crash on startup or first narration (spec: Default Path Unchanged → unreadable script handled).
- `MOCK_LLM=1 python3 -m pytest tests/ -q --ignore=tests/test_cli_behavior.py --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py --ignore=tests/test_live_llm.py`: default-path regression — the full mock suite (status-parsing, `test_mcp_*.py`, `test_engine_status_parsing.py`, probe-runner lifecycle) stays green with `MOCK_SCRIPT_FILE` unset, proving the canned output is byte-identical (spec: Default Path Unchanged → default behavior unchanged).
- `node --check engine/mockOpenAI.js` and `python3 -m py_compile tests/probe_runner.py`: syntax gate on the touched files.

## Manual Verification

- **Scripted probe run:**
  - **WHEN** the operator writes `game/playtest/scripts/manual.json` with three distinct canonical status lines and runs `python3 tests/probe_runner.py run --probes manual --mock 1` (with `MOCK_SCRIPT_FILE` wired through the runner)
  - **THEN** successive action turns report different locations, and the probe report includes the scripted path; afterward no `web/server.js` process remains.
- **Default mock unchanged:**
  - **WHEN** the operator runs the same command without `MOCK_SCRIPT_FILE` set
  - **THEN** every turn reports the canned location, and the startup log shows no scripting warnings.
- **Bad script resilience:**
  - **WHEN** the operator points `MOCK_SCRIPT_FILE` at a nonexistent path and starts a probe
  - **THEN** the server starts, serves canned narration, and logs a clear warning rather than crashing.
