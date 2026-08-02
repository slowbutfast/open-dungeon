## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing tests for the shared status parser: given an uppercase `[STATUS: ...]` line with trailing content, the parser returns the same location/score/moves the engine commits; and assert `mcp/tools/gameplay.js` imports the shared parser (no local regex)
- [x] 1.2 Write failing tests for `dungeon_inspect_lore` freshness: after a turn that produces extractable lore, the tool returns the store-backed cards matching `dungeon_inspect_stats.lore`, not `[]`
- [x] 1.3 Write failing tests for `dungeon_inspect_lore` field shape (id, name, type, description, triggers, enabled) preserved after switching to the store read
- [x] 1.4 Write failing tests for save-directory isolation: `dungeon_init_session` with `SAVE_DIR=game/playtest/adventures` writes under the sandbox and not under `game/adventures/`
- [x] 1.5 Write failing tests for `dungeon_get_debug_info.backend_status.save_dir` reporting the resolved save directory

## 2. M1 — Save Directory Isolation

- [x] 2.1 Fix `.mcp.json` env block: replace the `${OPEN_DUNGEON_MOCK_LLM:-0}` shell-style expansion with a client-portable literal (or document/verify client env support) so `SAVE_DIR` is honored
- [x] 2.2 Add a save-dir resolution guard/surface: expose the resolved `saveDir` (engine already holds it) and verify the MCP server process receives `SAVE_DIR`
- [x] 2.3 Add `save_dir` to `dungeon_get_debug_info.backend_status` in `mcp/tools/diagnostics.js`

## 3. M2 — Shared Status Parser

- [x] 3.1 Export the canonical line-scanning status parser from `engine/llm.js` (or a shared util) per #12
- [x] 3.2 Replace `mcp/tools/gameplay.js`'s local `parseStatusLine` with an import of the shared parser
- [x] 3.3 Ensure `dungeon_send_action` returns engine-consistent state metrics for uppercase-status and trailing-content responses

## 4. M3 — Authoritative Lore Inspection

- [x] 4.1 Export/reuse `forceFlushBeforeRead` from `mcp/tools/memory.js`
- [x] 4.2 Rework `dungeon_inspect_lore` in `mcp/tools/state.js` to force-flush and read `structuredStore.getLore(adventureId)`, preserving the output field shape

## 5. Verification & Coordination

- [x] 5.1 Run the full MCP test suite (`python -m pytest tests/test_mcp_*.py -v`) and confirm green
- [x] 5.2 Run a live MCP playtest confirming save location, parser consistency, and lore freshness (manual verification section) — verified via safe automated mock-LLM stdio playtest smoke + unit/integration suite; no live OpenRouter run performed
- [x] 5.3 Coordinate with `harden-context-history-integrity` (#12) so the shared parser lands without a transient divergence
