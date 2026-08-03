## Automated Tests

- **Committed seam — full-surface rollback (unit seam 1.2, red until #27, now
  green):** `tests/unit/structuredStore.test.mjs` asserts `rollbackTurn` removes
  events, inventory, lore, barter_offers, AND quest_goals. Run via
  `npm run test:unit`.
- **Committed seam — single instance (unit seam 1.5, red until #27, now green):**
  `tests/unit/barterEngine.test.mjs` asserts constructing an `AdventureEngine`
  builds exactly ONE `BarterEngine` (spy on `_initSchema`), that
  `engine.memory.barter === engine.barter`, and that
  `engine.barter.store === engine.memory.structuredStore`.
- **Committed seam — single matching regime (already green, kept green):**
  `barterEngine.test.mjs` `completeGoal("the Gem")` against a held "Gem" and
  `completeGoal("Rusted Gear")` against a held "Rusty Gear", plus the
  `structuredStore.test.mjs` canonical `hasItem`/`executeTrade` cases.
- **New — guarded migration (`migration.test.mjs`):** a legacy-schema
  `memory.db` (no `turn_index` on lore/offers/goals) upgraded by
  `StructuredStore` construction gains the column; the migration is idempotent
  across a second construction and preserves legacy rows (NULL `turn_index`).
- **Existing guard — read-through freshness:** the three
  `memoryManager.test.mjs` read-through tests stay green (#26).
- **Existing guards — locked undo/trade contract:** `test_undo_consistency.py`
  and `test_trade_goals_consistency.py` (events/inventory rollback, watermark
  rewind, RAG recall, narrated trade/offer/goal extraction) MUST stay green.
- **Existing guards — barter surface:** `test_mcp_barter.py` and
  `test_barter_engine.py` pin the offer/goal/trade wire surface and MUST stay
  green.
- **Regression watch — event-id hash:** adding `endTurnIndex` to the event id
  payload changes ids for cross-turn duplicate summaries. Guarded by the full
  pytest suite (memory, scoring, extractor-validation, undo).
- **Expected still-red (owned by #28):** none at this seam.

## Manual Verification

- **Migration on a fresh DB:** create a legacy-schema DB, construct a
  `StructuredStore` over it, confirm `PRAGMA table_info` shows `turn_index` on
  `lore`/`barter_offers`/`quest_goals` and pre-existing rows are intact.
- **Full-surface undo via MCP:** narrate a turn that produces a trade offer and
  a quest goal (mock triggers `"bring me"` + `leaflet`, `"find my daughter"` +
  `locket`), then `dungeon_undo_action`; `dungeon_inspect_offers` /
  `dungeon_inspect_goals` return no rows from the undone turn, and
  `dungeon_inspect_stats.lastExtractedTurnIndex` rewinds.
- **API rows survive undo:** hand-POST an offer/goal via the web routes, play a
  turn, undo it; the hand-created rows remain visible in the offer/goal
  surfaces.
