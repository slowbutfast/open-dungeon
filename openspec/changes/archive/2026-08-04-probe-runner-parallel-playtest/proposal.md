## Why

Parallel playtest probes (GH #33 experiment matrix, the 2026-08-03 B1-B4 sweep) each hand-roll their own server spawn, port allocation, SSE parsing, crash recovery, and teardown — probe #13 died three times mid-turn (`EXIT_CODE=137`), never auto-restored its save, left orphaned servers running, and never returned a report. There is no supervised way to run N probes concurrently, so every parallel sweep burns budget and silently drops coverage. The web server already exposes every endpoint the fix needs (`POST /saves/:save_id` for resume, `GET /api/ping` for health) — the missing piece is a runner that orchestrates them.

## What Changes

- **New supervised probe runner** (`tests/probe_runner.py`): spawns one isolated `node web/server.js` per probe with a unique port and `SAVE_DIR` (gitignored `game/playtest/` tree), health-checks via `/api/ping`, drives actions via the HTTP API, and **guarantees teardown** on exit — no orphaned servers.
- **Port allocation from a pool** — the runner finds a free port (bind-check) and hands it to each spawned server; no more hardcoded 5101-5104.
- **Crash recovery with resume** — when a probe server dies, the runner restarts it and restores state via the existing `POST /saves/:save_id` route; probes no longer lose their session.
- **Concurrency cap** (`--max-concurrent N`) — bounds how many real-model servers run at once, so a fan-out cannot pile up unmanaged processes.
- **Optional JSON response mode on `/api/action`** (`?format=json`) — aggregates the SSE stream into one JSON body, so curl probes (and the runner) stop hand-rolling SSE parsers. The runner keeps its own SSE parser as a fallback and does NOT depend on this change.
- **Docs**: `tests/ARCHITECTURE.md` runner section + `open-dungeon-cli-playtest/SKILL.md` reference.

No engine changes. No MCP tool changes. No breaking changes.

## Capabilities

### New Capabilities
- `parallel-playtest-runner`: supervised spawn, port allocation, health-check, crash-resume, teardown, and concurrency cap for parallel probe servers; drives the existing HTTP API (including the optional JSON action mode).

### Modified Capabilities
- `mcp-server`: no requirement change. The optional JSON response mode touches `web/routes/game.js` (the HTTP action endpoint), not the MCP server; it is scoped under the new capability rather than a delta on the MCP spec.

## Impact

- `tests/probe_runner.py` — new supervised runner (port pool, spawn, health-check, resume, teardown, SSE/JSON driver, `--max-concurrent`).
- `web/routes/game.js` — optional `?format=json` aggregation on `POST /action` (~15 lines, additive).
- `tests/ARCHITECTURE.md` — document the runner and its tier in the test suite.
- `.opencode/skills/open-dungeon-cli-playtest/SKILL.md` — document the runner as the sanctioned way to run parallel probes.
- No new dependencies; Python 3 stdlib + `subprocess`/`urllib` only.
