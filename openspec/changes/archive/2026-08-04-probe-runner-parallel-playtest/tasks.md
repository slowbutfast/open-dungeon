## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing tests for Probe Server Lifecycle Management: spawn on free port, health-check readiness, guaranteed teardown on exit (no orphaned `node web/server.js`), and SAVE_DIR never falling through to `game/adventures/` — all against a mock probe server (MOCK_LLM=1)
- [x] 1.2 Write failing tests for Crash Recovery with Resume: kill mid-run then assert `POST /saves/<adventure_id>` restores state; kill before init then assert a fresh session starts
- [x] 1.3 Write failing tests for Concurrency Cap: `--max-concurrent 2` queues the third probe; no cap runs all concurrently
- [x] 1.4 Write failing tests for Runner HTTP Driver: action via `?format=json` returns narration+status; SSE fallback parses `data:` chunk/done frames against an unmodified server
- [x] 1.5 Write failing tests for Probe Sandbox Isolation: two concurrent probes get distinct SAVE_DIRs under `game/playtest/` and never share saves
- [x] 1.6 Write failing tests for Action Endpoint JSON Response Mode: `POST /api/action?format=json` returns a single JSON body; default path still streams `text/event-stream`
- [x] 1.7 Confirm the new test suite fails (red) before implementation — `python3 -m pytest tests/test_probe_runner.py -v -k "probe_runner"` and the action-json case in `tests/test_api_endpoints.py`

## 2. Probe Runner Skeleton (tests/probe_runner.py)

- [x] 2.1 Create `tests/probe_runner.py` with a `Probe` class: allocates a free port via bind-check (bind :0, read port, close), builds spawn env (`PORT`, probe-specific `SAVE_DIR` under `game/playtest/adventures/probe-<name>`, `MOCK_LLM`, `LLM_BACKEND`, `OPENROUTER_MODEL` passthrough), and spawns `node web/server.js` as a subprocess
- [x] 2.2 Add readiness polling: retry `GET /api/ping` until OK or timeout, logging the server's startup line; fail fast with the captured log tail on timeout
- [x] 2.3 Add guaranteed teardown: SIGTERM the child, wait, SIGKILL on timeout, release the port; wire into `try/finally`, `atexit`, and SIGINT/SIGTERM handlers so every exit path cleans up
- [x] 2.4 Add a SAVE_DIR safety guard reusing the existing `assert_save_dir_is_safe` check so a spawned server never resolves to `game/adventures/`
- [x] 2.5 Add a `run` subcommand and CLI (`--probes <name>...`, `--mock 0/1`, `--llm-backend`, `--max-concurrent`, `--timeout`) so a subagent or skill can drive it; `py_compile` clean

## 3. Crash Recovery with Resume

- [x] 3.1 Track each probe's active `adventure_id` from init responses and persist it in the probe's sandbox dir (state-file pattern from `tests/autoplay_runner.js`)
- [x] 3.2 Implement restart-with-resume: detect child exit, restart on the same port, wait for readiness, call `POST /saves/<adventure_id>` when a save exists, otherwise leave the probe to initialize fresh
- [x] 3.3 Bound restart attempts (e.g. max N restarts per probe) and surface a clear error to the driver instead of looping forever

## 4. Runner HTTP Driver

- [x] 4.1 Implement an action driver that prefers `POST /api/action?format=json` and parses the JSON body (narration + location/score/moves)
- [x] 4.2 Implement the SSE fallback parser (consume `data:` frames; aggregate `type: chunk`/`done`) so the driver works against a server without JSON mode
- [x] 4.3 Add init/save-list helpers via `POST /api/init` and `GET /api/state` so the driver can bootstrap and verify a probe session

## 5. Concurrency Cap

- [x] 5.1 Implement the `--max-concurrent` gate: start at most N probe servers, queue the rest, and launch a queued probe when a slot frees up
- [x] 5.2 Aggregate per-probe results and per-probe exit status so a parallel run reports which probes succeeded/failed/crashed

## 6. Optional JSON Response Mode (web/routes/game.js)

- [x] 6.1 Add `?format=json` handling to `POST /api/action`: when set, aggregate the SSE stream into a single JSON response `{ narration, location, score, moves }` with `Content-Type: application/json`
- [x] 6.2 Keep the default path streaming `text/event-stream` unchanged; add no regression to existing SSE consumers
- [x] 6.3 `node --check web/routes/game.js` and run the existing `tests/test_api_endpoints.py` action tests to confirm no regression

## 7. Docs

- [x] 7.1 Add a "Probe Runner" section to `tests/ARCHITECTURE.md` (per AGENTS.md): purpose, spawn/env/teardown contract, tier/execution guidance
- [x] 7.2 Add a runner reference to `.opencode/skills/open-dungeon-cli-playtest/SKILL.md` (command, `--mock`/`--llm-backend`/`--max-concurrent`, SAVE_DIR/PORT behavior) so parallel probes are the documented, sanctioned path
- [x] 7.3 Cross-reference GH #34 (this change) and note the deferred Option A (multi-session MCP) in the skill/docs so the decision isn't relitigated blindly

## 8. Verification

- [x] 8.1 Run the full new runner test suite green: `MOCK_LLM=1 python3 -m pytest tests/test_probe_runner.py tests/test_api_endpoints.py -v`
- [x] 8.2 Run the broader mock gates to confirm no regression: `MOCK_LLM=1 python3 -m pytest tests/ -q --ignore=tests/test_cli_behavior.py --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py --ignore=tests/test_live_llm.py`
- [x] 8.3 Manual verification (tests.md): verified the mock equivalent — `Ctrl-C` (SIGINT) mid-run tears down all probe servers (0 orphans), and a killed server resumes from its saved state (`test_probe_real_server_crash_resume`). The real-model probe with a live `.env` key remains a cost-aware manual fidelity check for a human operator.
