## Why

The memory store's schema is owned by no single module, and that leaks three
distinct defects (verified in `research.md`):

1. **Barter tables are declared and referenced from three modules.**
   `barterEngine._initSchema` creates `barter_offers`/`quest_goals`,
   `structuredStore` hard-codes the same tables in its deletes, and
   `memoryManager` runs a raw `SELECT id FROM quest_goals ...` for goal dedup.
   `barterEngine` reaches past the store's methods into the raw `db` handle
   (`this.store.db.prepare(...)`) for most of its queries.
2. **Two matching regimes answer "do I hold this item?".** Exact case-insensitive
   SQL (`hasItem`/`executeTrade`) vs canonical `itemNamesMatch`. `completeGoal`
   validates a goal spelled "the Gem" against a held "Gem" and fails, while a
   narrated trade with the same spelling resolves. `executeBarter` bridges the
   gap by feeding the canonical match's stored name back into the exact-match
   `executeTrade` — fragile.
3. **Rollback only covers events + inventory.** `rollbackTurn` deletes `events`
   and `inventory`, rewinds the watermark. It never touches `lore`,
   `barter_offers`, or `quest_goals` — all written by `_extractAndStore` at the
   same batch turn — so undo leaves the recorded contract
   (`make-undo-and-trades-consistent`) incomplete: offers/goals/lore written by
   a turn survive an undo of that turn.

Two wiring defects compound the above: the event-id content hash omits the turn
index (two identical summaries collapse to the first turn's row, so a later
rollback can't delete the second), and two `BarterEngine` instances are built
per engine (`memoryManager.js:19` and `engine/index.js:69`, the second
orphaning the first).

The deletion test confirms the deepening target: delete `barterEngine`'s schema
methods and the barter tables' ownership is unlocated — three modules declare or
reach into the same tables.

## What Changes

- **`StructuredStore` becomes the single owner of ALL tables** — `events`,
  `inventory`, `lore`, `barter_offers`, `quest_goals` — and their access
  methods. `BarterEngine` becomes a thin state machine over the store: it
  calls `insertOffer` / `getOffersForTrader` / `getAllOffers` /
  `createQuestGoal` / `getGoalById` / `getActiveGoals` / `getAllGoals` /
  `acceptQuestGoal` / `failQuestGoal` / `completeQuestGoal` /
  `findGoalByNpcAndTitle` and never touches a raw `db` handle. Its public
  method names (`registerOffer`, `getAllOffers`, `getOffersForTrader`,
  `executeBarter`, `createGoal`, `acceptGoal`, `failGoal`, `completeGoal`,
  `getActiveGoals`) are preserved so `engine/index.js` and `memoryManager`
  callers do not change.
- **One canonical matching regime.** `hasItem`/`executeTrade`/offer lookups all
  resolve through the canonical leaf (`engine/memory/itemNames.js`). The exact
  `LOWER()` SQL stays as the indexed fast path; the canonical match is the
  correctness fallback, so `completeGoal("the Gem")` completes against a held
  "Gem".
- **Full-surface rollback.** `barter_offers`/`quest_goals`/`lore` gain a
  `turn_index` column (guarded `ALTER TABLE` migration for existing DBs).
  `_extractAndStore` writes the batch `endTurnIndex` into narration-created
  offers/goals/lore. `rollbackTurn` deletes events + inventory + lore + offers
  + goals with `turn_index >= N` (offers/goals additionally `IS NOT NULL`, so
  rows with no narration turn survive). Watermark rewind and the vector
  `deleteItems` behavior are unchanged.
- **Event-id hash fix.** The `_extractAndStore` event id payload now includes
  `endTurnIndex`, so each turn's event is its own row and a later rollback can
  delete the second occurrence of an identical summary. Score is safe:
  `scoreRule` already dedups by normalized `type:summary`.
- **Single `BarterEngine`.** The engine's second construction in
  `engine/index.js` is removed; `this.barter = this.memory.barter`. The same
  instance is exposed as `engine.barter` and `engine.memory.barter` over
  `engine.memory.structuredStore`.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `inventory-system`: modify `Synchronous SQLite Inventory Storage` (canonical
  matching as the single read regime) and `Edge Case Protection and Undo
  Synchronization` (full-surface rollback: lore/offers/goals roll back with the
  turn; narration turn attribution via `turn_index`).

## Impact

- `engine/memory/structuredStore.js` — owns `barter_offers`/`quest_goals`
  schema + access methods + the `turn_index` migration; `rollbackTurn` covers
  the full surface; `lore` gains `turn_index`.
- `engine/memory/barterEngine.js` — thin state machine; no `this.store.db`
  reach-ins; `_initSchema` retained as the construction-counting seam (no-op).
- `engine/memory/memoryManager.js` — event hash includes `endTurnIndex`; goal
  dedup uses `findGoalByNpcAndTitle`; passes `endTurnIndex` to narrated
  offers/goals/lore.
- `engine/index.js` — removes the second `BarterEngine` construction;
  `this.barter = this.memory.barter`.
- Tests: the four committed #27 tests (full-surface rollback x3 + single
  instance) and the two new migration tests go green.
- No wire-contract change: MCP tool names/schemas (18 tools), SSE shapes, the
  status line, and the undo/watermark/moves semantics are unchanged.
