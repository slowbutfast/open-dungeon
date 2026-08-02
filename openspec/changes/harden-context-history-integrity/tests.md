## Automated Tests

- `python3 -m pytest tests/test_shared_status_parser.py -v`: already covers the shared parser (uppercase, trailing content, Moveless line) — extend if the engine's buffered path needs new cases.
- **New — engine status parsing unit tests** (extend `tests/test_shared_status_parser.py` or a new `tests/test_engine_status_parsing.py`): assert that after a streamed response with a status line followed by trailing content, the engine commits location/score/moves (parses the last status line), and the raw status line is not in history.
- **New — engine fragmented-buffered test**: simulate the mock-mode fragmented stream (`cantina.\n[Status:` split across chunks) and assert the buffered branch commits the status via the shared parser (this was the MCP-change divergence finding).
- **New — history sanitization tests**: given an assistant response that echoes `[CURRENT STATUS]`/`[CURRENT INVENTORY]` blocks and a `[Status: ...]` line, assert `state.history` contains only sanitized narration and the save file matches.
- **New — moves single-owner test**: two consecutive turns with status lines missing `Moves` → committed `moves` increments exactly once per turn and matches `dungeon_inspect_state`.
- **New — prompt contract test**: assert all five prompt definitions (`engine/index.js` + four `engine/storyPresets.js` presets) specify the same status-line format the shared parser expects.

## Manual Verification

- **Sanitized history live check**:
  - **WHEN** playing via the web UI or MCP and taking an action that makes the model echo an inventory block (e.g., `list your current status and inventory`), then opening `dungeon_inspect_history` and the save file
  - **THEN** the echoed `[CURRENT STATUS]`/`[CURRENT INVENTORY]` blocks and raw `[Status: ...]` line do not appear in history or the save file, and the next turn does not replay them as context
- **Moves consistency**:
  - **WHEN** playing several turns, some where the model omits `Moves` on the status line
  - **THEN** `dungeon_send_action.moves` and `dungeon_inspect_state.moves` agree after every turn
