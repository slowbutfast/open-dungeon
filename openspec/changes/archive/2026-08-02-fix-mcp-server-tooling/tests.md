## Automated Tests

- `python -m pytest tests/test_mcp_state.py -v`: verifies `dungeon_inspect_lore` still returns an array with the required fields (id, name, type, description, triggers, enabled) after switching to the store-backed read.
- `python -m pytest tests/test_mcp_tools.py -v`: verifies `dungeon_inspect_lore` and `dungeon_send_action` tool registrations and happy-path behavior remain intact.
- `python -m pytest tests/test_mcp_gameplay.py -v`: verifies `dungeon_send_action` status metrics match engine-committed state after the parser unification; adds a case where the narrator emits an uppercase `[STATUS: ...]` line with trailing content and asserts MCP reports the engine's committed location/score/moves.
- `python -m pytest tests/test_mcp_session.py -v`: verifies `dungeon_init_session` writes save files under the configured `SAVE_DIR` and, when `SAVE_DIR=game/playtest/adventures`, asserts no file is written to the production `game/adventures/` directory.
- `python -m pytest tests/test_mcp_diagnostics.py -v`: verifies `dungeon_get_debug_info.backend_status.save_dir` reports the resolved save directory (adds a `save_dir` assertion to the existing backend-status test).
- **New test — lore freshness**: `dungeon_inspect_lore` called immediately after a turn that produced extractable lore returns cards that match `dungeon_inspect_stats.lore` (guard: force-flush path works end-to-end). Add to `tests/test_mcp_state.py`.
- **New test — parser single-source**: assert `mcp/tools/gameplay.js` imports the shared parser and no longer defines its own status regex (e.g., module-source assertion or a unit test that imports the shared parser and compares behavior for uppercase-status + trailing-content input).

## Manual Verification

- **M1 — save directory resolution**:
  - **WHEN** starting the MCP server via the project's `.mcp.json` config and calling `dungeon_init_session`, then checking `dungeon_get_debug_info.backend_status.save_dir` and listing `game/playtest/adventures/`
  - **THEN** `save_dir` resolves to the playtest sandbox, the new save appears under `game/playtest/adventures/`, and no new file appears under `game/adventures/`
- **M2 — status metric consistency**:
  - **WHEN** sending an action that makes the model echo an inventory/status block (e.g., `list your current status and inventory`), then comparing `dungeon_send_action`'s returned location/score/moves against `dungeon_inspect_state`
  - **THEN** the two agree, and the echoed `[CURRENT STATUS]`/`[CURRENT INVENTORY]`/`[STATUS: ...]` blocks are not persisted as narration in `dungeon_inspect_history`
- **M3 — lore freshness**:
  - **WHEN** playing one turn that creates a lore card, immediately calling `dungeon_inspect_lore`
  - **THEN** the new card appears in the result (not `[]`), consistent with `dungeon_inspect_stats` lore count and the SQLite `lore` table
