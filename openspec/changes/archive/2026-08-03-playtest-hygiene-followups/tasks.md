## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing summary-sanitization tests: `state.summary` and the save-file `summary` field must be stripped of raw `[Status: ...]` / `[CURRENT ...]` lines (prose preserved) — confirmed red against the pre-fix code
- [x] 1.2 Verify the summary tests go green after the `engine/context.js` sanitize fix

## 2. Summary Sanitization

- [x] 2.1 Apply `sanitizeForHistory` to the summarizer output before it is committed to `state.summary` (`engine/context.js`)
- [x] 2.2 Confirm the sanitized summary reaches the save file and the `[ADVENTURE SUMMARY]` context injection

## 3. MCP Env Wiring & Startup Guard

- [x] 3.1 Add the documented per-server `environment` block to `mcp.open-dungeon` in `.opencode/opencode.jsonc` (`SAVE_DIR`, `MOCK_LLM=1`)
- [x] 3.2 Align the session `environment` block and the root `.mcp.json` copy
- [x] 3.3 Add `mcp/server.js` startup warnings for production-save resolution and non-mock backend; verify both warn/no-warn paths

## 4. Playtest Subagent

- [x] 4.1 Add `.opencode/agents/playtest.md` (mode `subagent`, model `opencode-go/deepseek-v4-flash`, `edit: deny`, `open-dungeon_*` tools allowed, playtest contract + invariant checklist + report format)

## 5. Verification

- [x] 5.1 Run `node --check` on `engine/context.js` and `mcp/server.js`
- [x] 5.2 Run the MCP + status-parsing + scoring + engine-status suite and confirm green (124 passed, 8 subtests)
- [x] 5.3 Run the broad suite and confirm green (271 passed, 12 subtests)
- [x] 5.4 Manual: MCP server startup guard warnings verified for unset vs sandboxed `SAVE_DIR`
- [x] 5.5 Deferred (needs session restart): confirm `dungeon_get_debug_info` resolves sandboxed saves + mock backend, and `@playtest` registers
