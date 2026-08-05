## Automated Tests

- `python3 -m pytest tests/test_probe_runner.py -v` (MOCK_LLM=1): verifies the runner lifecycle end-to-end against a mock probe server —
  - spawns on a free port and health-checks `/api/ping` before driving (spec: Probe Server Lifecycle Management → Wait for readiness);
  - initializes a session, drives a `do` action, and reads narration + status back (spec: Runner HTTP Driver → JSON mode and SSE fallback);
  - tears down: after runner exit, no `node web/server.js` process from that run remains and the port is released (spec: Guaranteed teardown on exit);
  - isolation: two concurrent probes resolve distinct `SAVE_DIR`s under `game/playtest/` and one probe's save is not listed as another's (spec: Probe Sandbox Isolation);
  - SAVE_DIR safety: a spawned server without an explicit operator override never resolves to `game/adventures/` (spec: No probe writes to production saves), asserted via the existing `assert_save_dir_is_safe` guard.
- `python3 -m pytest tests/test_probe_runner.py -v -k "resume"` (MOCK_LLM=1): crash-recovery —
  - kill the probe server mid-run after a session is initialized, then restart and assert `POST /saves/<adventure_id>` restores location/score/moves (spec: Crash Recovery with Resume → Restart and resume after a probe server crash);
  - kill before any init and assert the runner starts a fresh session instead of attempting a nonexistent load (spec: Resume only when a save exists).
- `python3 -m pytest tests/test_probe_runner.py -v -k "cap"` (MOCK_LLM=1): concurrency cap —
  - `--max-concurrent 2` with three requested probes starts at most two servers at once and queues the third (spec: Concurrency Cap → Cap concurrent probe servers);
  - no cap runs all requested probes (spec: No cap means run all requested probes).
- `python3 -m pytest tests/test_api_endpoints.py -v -k "action_json"` (MOCK_LLM=1): JSON response mode —
  - `POST /api/action?format=json` returns a single JSON body with narration and status (spec: Action Endpoint JSON Response Mode → JSON response for an action);
  - `POST /api/action` without `format` still streams `text/event-stream` (spec: Default behavior remains SSE).
- `node --check tests/probe_runner.py` n/a — Python; instead `python3 -m py_compile tests/probe_runner.py` ensures the runner imports cleanly.
- Runner itself is exercised as a subprocess by the pytest smoke tests (matching the `_pt_runner.py` precedent), so no separate runner test harness is introduced.

## Manual Verification

- **Parallel real-model probes (fidelity check, costs money):**
  - **WHEN** the operator runs `python3 tests/probe_runner.py run --probes probe-B2 --mock 0 --llm-backend openrouter` with a real `.env` key
  - **THEN** each probe server comes up on its own port, `GET /api/ping` reports `status: online`, and actions stream narration; after `Ctrl-C`, `ps aux | grep "web/server.js"` shows no probe servers left running.
- **Crash recovery on a real server:**
  - **WHEN** a probe's server is killed mid-session (`kill -9 <pid>`) and the runner is left running
  - **THEN** the runner restarts the server and the probe's next action continues from the restored `location`/`score`/`moves` rather than a fresh "West of House".
- **Port reuse:**
  - **WHEN** two probes run back-to-back with the same probe name
  - **THEN** the second run binds a free port (same or different) without `EADDRINUSE`, and the first run's port is fully released.
- **CLI skill documentation:**
  - **WHEN** the operator follows the updated `open-dungeon-cli-playtest/SKILL.md` runner section
  - **THEN** the documented command runs a probe end-to-end and the skill's SAVE_DIR/PORT table matches the runner's behavior.
