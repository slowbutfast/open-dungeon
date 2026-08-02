## Why

The MCP server is the primary interface agents use to playtest this game, but three defects undermine that purpose: playtest saves silently land in the production directory (defeating #6's save isolation), `dungeon_send_action` reports state through a second, case-sensitive status parser that diverges from the engine's, and `dungeon_inspect_lore` returns stale in-memory cards instead of the authoritative SQLite store. Agents get misleading state, and playtest activity pollutes production data.

## What Changes

- **M1 — Make the playtest sandbox isolation effective.** Diagnose and fix why `SAVE_DIR` from `.mcp.json` is not reaching the MCP server process, so agent playtest sessions persist under `game/playtest/adventures/` as intended. At minimum, verify the resolution path and document/guard against the production fallback (`engine/index.js:53`) being hit by playtest processes. Resolve the `${OPEN_DUNGEON_MOCK_LLM:-0}` env-block issue that is the suspected root cause.
- **M2 — Unify status-line parsing.** Replace `mcp/tools/gameplay.js`'s standalone `parseStatusLine` with the shared parser (per #12), removing the case-sensitivity and the divergent return values. `dungeon_send_action` state metrics then agree with what the engine commits.
- **M3 — Make `dungeon_inspect_lore` authoritative and fresh.** Adopt the `forceFlushBeforeRead` pattern and read from the structured store's `lore` table (like `inspect_inventory`/`inspect_events`/`inspect_stats`), so the tool reports what actually exists and will fire.

## Capabilities

### New Capabilities
<!-- None — all changes are to the existing mcp-server capability -->

### Modified Capabilities
- `mcp-server`: modify the State Inspection Tools requirement (`dungeon_inspect_lore` must be store-backed and fresh) and the Core Gameplay Tools requirement (`dungeon_send_action` state metrics must come from a single shared status parser). Add the save-directory isolation expectation to the Session Lifecycle requirement.

## Impact

- `mcp/tools/state.js` — `dungeon_inspect_lore` reads store + force-flushes
- `mcp/tools/memory.js` — `forceFlushBeforeRead` reused (no change needed unless exported)
- `mcp/tools/gameplay.js` — imports shared parser, drops local `parseStatusLine`
- `engine/llm.js` — shared parser export (touches `:418,433` paths; coordinated with #12 batch)
- `.mcp.json` — env block corrected/verified for `SAVE_DIR`
- Tests: `tests/test_mcp_*.py` — MCP tool behavior assertions
- No new dependencies; no schema/DB migration.
