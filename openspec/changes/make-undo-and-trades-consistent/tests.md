## Automated Tests

- **New — undo rollback tests** (extend `tests/test_mcp_state.py` or `tests/test_mcp_memory.py`): after a turn that produced an event + inventory change, `dungeon_undo_action` leaves no event for that turn, no acquired item, `last_extracted_turn_index` <= history length, and `moves` decremented. Also: `dungeon_search_memories` no longer recalls the undone turn's narrative.
- **New — undo race test**: undo called while a flush is pending does not resurrect rolled-back rows (await flush before rollback).
- **New — narrated trade resolution test**: narrate a leaflet→gem trade; assert the sold item is no longer `held`, the gem is `held`, and re-trading the sold item fails possession.
- **New — duplicate-sale regression test**: after a narrated trade, attempting the same trade again is rejected (no duplicate acquisition).
- **New — offer/goal extraction tests**: narrate "bring me X and I'll give you Y" → `dungeon_inspect_offers` returns the offer and `dungeon_execute_trade` succeeds; narrate "find my daughter's locket" → `dungeon_inspect_goals` returns the goal.
- **Existing guard**: `python3 -m pytest tests/test_mcp_*.py -v` and `tests/test_barter_engine.py` stay green.

## Manual Verification

- **Undo consistency**:
  - **WHEN** playing 3-4 turns (some producing events/items), calling `dungeon_undo_action`, then `dungeon_inspect_events`, `dungeon_inspect_inventory`, `dungeon_inspect_stats`, `dungeon_search_memories`
  - **THEN** all memory views are consistent with the shorter history: no orphaned events/items, watermark within history, reverted turn not recalled by RAG, moves decremented
- **Narrated trade + offers**:
  - **WHEN** narrating a full trade with an NPC, then `dungeon_inspect_offers`, `dungeon_inspect_inventory`, `dungeon_execute_trade`
  - **THEN** the sold item is gone from inventory, the offer is registered, and the trade executes atomically
- **Quest goals from narration**:
  - **WHEN** an NPC states a goal in narration, then `dungeon_inspect_goals` and later `dungeon_complete_goal`
  - **THEN** the goal appears and can be completed for its reward
