## Automated Tests

- **New — blank-action rejection tests** (extend `tests/test_mcp_gameplay.py`): `dungeon_send_action` with `"   "`, `""`, and `"\n"` returns an error, makes no LLM call (assert no new narration entry in history / no token usage), and does not append a user turn.
- **New — tracker scoping tests** (extend `tests/test_mcp_diagnostics.py`): after `dungeon_init_session` (A) + an action, then `dungeon_init_session` (B) + an action, `dungeon_get_debug_info` on B shows only B's calls and cost (no A calls), and `debug_logs` contains no A-era entries.
- **New — cost accounting tests**: after turns that trigger extraction/summarization/embedding, `dungeon_get_debug_info.session_cost` includes non-zero input/output tokens for those call types (or the report is labeled to exclude them).
- **Existing guard**: `python3 -m pytest tests/test_mcp_*.py -v` stays green.

## Manual Verification

- **Blank action**:
  - **WHEN** calling `dungeon_send_action` with whitespace-only text from an agent
  - **THEN** the tool errors immediately, `dungeon_get_debug_info` shows no new LLM call, and `dungeon_inspect_history` has no new turn
- **Session-scoped diagnostics**:
  - **WHEN** playing a session, starting a new adventure, then calling `dungeon_get_debug_info`
  - **THEN** the call list, cost, and debug logs reflect only the new adventure
- **Honest cost**:
  - **WHEN** checking `dungeon_get_debug_info` after a session that triggered extraction and summarization
  - **THEN** the reported cost includes those calls' tokens (or is explicitly labeled otherwise)
