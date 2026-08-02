## Why

The memory layer (SQLite structured store + vector index) is written as a side effect of turns but never rolled back when history is mutated. Undo reverts history and leaves orphaned events, inventory rows, and an extraction watermark ahead of history; RAG then recalls retracted turns. And narrated trades never release the sold item reliably — the correct atomic path (`executeBarter`) is unreachable from narrative play, and the barter/goal tables are only written by two HTTP endpoints, so the entire offers/goals surface is invisible during normal play.

## What Changes

- **Make undo a transaction across history + structured store + vector index.** Revert inventory/event/lore rows and the vector index for undone turns; rewind `last_extracted_turn_index` to match history; decrement `moves` to the pre-undo value.
- **Give the extractor a way to express item removal** (consumed/traded/dropped) so a `trade` event resolves both sides, and route narrated trades through `executeBarter` (which already does the atomic swap) instead of the add-only extraction path. This also closes the duplicate-sale exploit.
- **Wire narration to offers and goals.** Extend the extractor's output schema to emit `offers` and `goals` so an NPC's "bring me X, I'll give you Y" registers an offer and "find my daughter's locket" creates a goal — the tables then feed the existing `dungeon_inspect_offers` / `dungeon_execute_trade` / `dungeon_inspect_goals` / `dungeon_complete_goal` surface.
- **Normalize item names** when resolving narrated trades (shared with `validate-memory-extraction`).

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `game-engine`: modify `Undo Action` (transactional undo across store + vector + watermark + moves).
- `barter-system`: modify `Universal Barter Trade Execution` (narrated trades route through `executeBarter`) and `NPC Quest Goal State Machine` (goals created from narration).
- `inventory-system`: modify `Synchronous SQLite Inventory Storage` / `Edge Case Protection and Undo Synchronization` (extraction removal semantics + undo rollback).
- `context-compression`: modify `On-Demand Memory Sync` (watermark rewind semantics on undo).

## Impact

- `engine/index.js:171` — undo entry point
- `engine/state.js:129` — history revert
- `engine/memory/memoryManager.js` — watermark rewind + store rollback on undo
- `engine/memory/eventExtractor.js` — output schema gains removal + offers/goals
- `engine/memory/barterEngine.js` — registerOffer/createGoal reachable from narration
- `web/routes/game.js` — offer/goal writers (unchanged; now also fed by narration)
- Tests: undo rollback, trade resolution, offer/goal extraction, duplicate-sale regression
- No new dependencies.
