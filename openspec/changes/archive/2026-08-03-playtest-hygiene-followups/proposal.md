## Why

Playtesting the two just-landed batches surfaced two real defects they did not cover: (1) the auto-summarized `state.summary` is committed raw and replayed as `[ADVENTURE SUMMARY]` context, so a status line in the summary leaks into the context stream — the exact failure the batch-1 sanitization spec forbids; and (2) the session-bound `open-dungeon` MCP server ran against production saves and a real LLM backend because the env block was declared where OpenCode does not apply it. This change fixes both, hardens the MCP server startup against silent misconfiguration, and adds a project-level playtest subagent so feature verification is repeatable.

## What Changes

- **Sanitize `state.summary` before commit.** `engine/context.js` passes the summarizer output through the shared `sanitizeForHistory`, so the save file and the `[ADVENTURE SUMMARY]` context injection never carry raw status lines or echoed context blocks. Add regression tests asserting no metadata tokens anywhere in the save file, including the `summary` field.
- **Fix the MCP env wiring.** Move `SAVE_DIR`/`MOCK_LLM` into the documented per-server `environment` block of `mcp.open-dungeon` in `.opencode/opencode.jsonc`; align the session env and the root `.mcp.json` copy; default to `MOCK_LLM=1` (mock-first, zero cost) for autonomous playtesting.
- **Harden `mcp/server.js` startup.** Warn loudly on stderr when `SAVE_DIR` is unset or resolves into the production `game/adventures` tree, and when `MOCK_LLM != "1"` (real backend = API cost). Warning only, not a hard fail.
- **Add a project-level playtest subagent** (`.opencode/agents/playtest.md`): `mode: subagent`, `model: opencode-go/deepseek-v4-flash`, `edit: deny`, scoped bash, `open-dungeon_*` MCP tools allowed, system prompt = trimmed merge of the two playtest skills plus a feature-verdict report contract and the invariant checklist.

## Capabilities

### New Capabilities
<!-- None — tooling/config/agent changes do not introduce a game capability. -->

### Modified Capabilities
- `game-engine`: modify `Sanitized History Commit` — the sanitization scope SHALL include the auto-summarized `state.summary` (save file + `[ADVENTURE SUMMARY]` context injection).

## Impact

- `engine/context.js` — summary sanitization (`sanitizeForHistory` import + commit)
- `tests/test_engine_status_parsing.py` — new `TestSummarySanitization`
- `.opencode/opencode.jsonc` — per-server `environment` block + session env (mock-first)
- `.mcp.json` — aligned env copy for non-OpenCode clients
- `mcp/server.js` — startup guard warnings
- `.opencode/agents/playtest.md` — new project-level playtest subagent (loads on next session)
- No new dependencies.

## Impact / Retrospective note

This change is opened AFTER implementation; all tasks are recorded as done and the artifacts document verified work (see tests.md for the gates that ran).
