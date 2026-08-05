## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing tests for Scripted Narration via MOCK_SCRIPT_FILE: a probe spawned with a script of 2+ distinct locations emits varying status-line locations across successive `/api/action` turns, and holds the last line on exhaustion — against a mock probe server (MOCK_LLM=1)
- [x] 1.2 Write failing tests for the default-path guard: with `MOCK_SCRIPT_FILE` unset, narration output is byte-identical to the pre-change canned line (existing status-contract/probe-runner tests stay green, no new failures)
- [x] 1.3 Write failing tests for the unreadable-script fallback: a missing file or malformed JSON `MOCK_SCRIPT_FILE` falls back to canned narration and does not crash the server on startup or first narration
- [x] 1.4 Write failing tests for Engine Remains Score/Moves Owner: with scripted `Score: 0`/`Moves: N` lines, committed `score`/`moves` via `GET /api/state` come from the engine's single-owner path, not the script
- [x] 1.5 Write failing tests for Runner Env Passthrough: a probe spawned with `MOCK_SCRIPT_FILE` configured gets the var in its env and serves scripted narration; without it, the var is absent and canned narration is served
- [x] 1.6 Confirm the new tests fail (red) before implementation — `MOCK_LLM=1 python3 -m pytest tests/test_probe_runner.py -v -k "scripted"` shows failures

## 2. Mock Implementation (engine/mockOpenAI.js)

- [x] 2.1 Add `MOCK_SCRIPT_FILE` reading to the mock: read the file (lazily on first narration use) as a JSON array of status-line strings; when the env var is unset or unreadable, leave behavior exactly as today
- [x] 2.2 Branch the `narration` intent: when a script is loaded, serve the next scripted line per turn via the existing chunked stream shape (prose-free or minimal prose + the scripted canonical status line), advancing an index and holding the last line on exhaustion
- [x] 2.3 Ensure non-narration intents (`opening_scene`, `suggestion`, `event_extraction`, etc.) keep their existing canned behavior — the script only affects `narration`
- [x] 2.4 Handle bad script input deterministically: log a clear warning and fall back to canned narration on missing/invalid files, never crashing startup or the first narration call
- [x] 2.5 `node --check engine/mockOpenAI.js` passes

## 3. Runner Passthrough (tests/probe_runner.py)

- [x] 3.1 Add a `MOCK_SCRIPT_FILE` option to `Probe`/`environment()` so a configured script path is passed through to the spawned server's env; omitted by default
- [x] 3.2 Wire the option through the CLI (`run` subcommand) so an operator can point probes at `game/playtest/scripts/<probe>.json`
- [x] 3.3 `python3 -m py_compile tests/probe_runner.py` passes

## 4. Sample Script Fixture

- [x] 4.1 Add a small gitignored sample script (e.g. `game/playtest/scripts/sample.json`) with distinct canonical status lines for the smoke tests and manual verification to reference
- [x] 4.2 Confirm `git check-ignore game/playtest/scripts/sample.json` reports it ignored

## 5. Verification

- [x] 5.1 Run the new scripted test suite green: `MOCK_LLM=1 python3 -m pytest tests/test_probe_runner.py -v -k "scripted"`
- [x] 5.2 Run the default-path regression gate: `MOCK_LLM=1 python3 -m pytest tests/ -q --ignore=tests/test_cli_behavior.py --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py --ignore=tests/test_live_llm.py` — green with `MOCK_SCRIPT_FILE` unset (proves byte-identical default)
- [x] 5.3 Manual verification (tests.md): run a scripted probe, confirm varying locations and teardown; run without the env var, confirm canned narration; point at a bad path, confirm fallback + warning, no crash
