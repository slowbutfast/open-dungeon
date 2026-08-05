## Why

The mock LLM (`engine/mockOpenAI.js`) emits a fixed `[Status: Cantina]` line on every narration turn (`mockOpenAI.js:37`), so mock-mode playtests can never exercise multi-room/spatial behavior — every turn proposes the same room and the spatial graph never grows. Spatial missions A–D/F (backtracking, reconciliation, portals, undo, name drift, stress) cannot run against the default mock; the only current escape is an expensive real model. The proven scripted-narrator pattern already exists in `spatialIntegration.test.mjs`; this change moves it into the mock module where narration content belongs, gated behind an env var.

## What Changes

- **`MOCK_SCRIPT_FILE` env support in `engine/mockOpenAI.js`**: when set, the `narration` intent serves lines from the file instead of the canned Cantina narrative. When unset, output is byte-identical to today — zero impact on existing mock tests.
- **Script file format**: a JSON array of canonical status lines (e.g. `["[Status: Western Clearing | Score: 0 | Moves: 1]", ...]`); each turn consumes the next line, holding the last when exhausted (matching the `spatialIntegration.test.mjs` pattern). The narration stream reuses the existing chunked generator.
- **`probe_runner.py` env passthrough**: the runner's `environment()` gains `MOCK_SCRIPT_FILE` so a probe spawn can point at `game/playtest/scripts/<probe>.json` (gitignored).
- **No BREAKING changes.** Default mock path is byte-identical; existing status-contract tests (`test_mcp_*.py`, status-parsing) stay green with the env unset.

## Capabilities

### New Capabilities
- `mock-narration-scripting`: the mock LLM SHALL serve scripted narration from `MOCK_SCRIPT_FILE` (JSON array of canonical status lines) when set, advancing one line per narration turn and holding the last when exhausted, while defaulting to byte-identical canned narration when unset.

### Modified Capabilities
- None. `llm-routing` (backend selection/client construction) and `game-engine` (status-line format contract) have no requirement changes — this is a new behavior surface, not a delta on either.

## Impact

- `engine/mockOpenAI.js` — env-gated scripted narration branch inside the existing `narration` intent case.
- `tests/probe_runner.py` — `MOCK_SCRIPT_FILE` in `environment()` (additive).
- Tests: a scripted-narration smoke test (scripted probe emits varying locations + engine-owned score/moves), plus the existing status-contract suites re-run green with the env unset.
- Docs: `game/playtest/scripts/` already gitignored (no gitignore change).
- No new dependencies; no engine, MCP, or web-server changes beyond the mock module and the runner env passthrough.
