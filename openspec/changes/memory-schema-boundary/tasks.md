# memory-schema-boundary — tasks

TDD-first promotion of program candidate #27. Guardrails from
`architecture-deepening-sequence/specs/refactor-program/spec.md` apply.

## 1. Test Scaffolding (TDD)

- [x] 1.1 Reference the committed unit-seam tests as the failing TDD floor:
      `tests/unit/structuredStore.test.mjs` (full-surface rollback: lore /
      offers / goals removed by `rollbackTurn`) and `tests/unit/barterEngine.test.mjs`
      (single `BarterEngine` instance per `AdventureEngine`). The single-matching
      regime tests already pass — they pin the canonical contract
- [x] 1.2 Add the guarded-migration tests (`tests/unit/migration.test.mjs`):
      legacy-schema DB (no `turn_index`) upgraded on construction; idempotent
      second construction; legacy rows survive with NULL `turn_index`
- [x] 1.3 Confirm the TDD red state: `npm run test:unit` shows the 4 committed
      #27 tests AND the 2 new migration tests failing (read-through tests stay
      green)

## 2. Schema ownership (StructuredStore + BarterEngine)

- [x] 2.1 Move `barter_offers` / `quest_goals` schema into `StructuredStore._initSchema`
      (with `turn_index`) and add the guarded `ALTER TABLE` migration for
      existing DBs
- [x] 2.2 Add the store access methods: `insertOffer`, `getOffersForTrader`,
      `getAllOffers`, `createQuestGoal`, `getGoalById`, `getActiveGoals`,
      `getAllGoals`, `acceptQuestGoal`, `failQuestGoal`, `completeQuestGoal`,
      `findGoalByNpcAndTitle`
- [x] 2.3 Rewrite `BarterEngine` as a thin state machine over the store (no
      `this.store.db` reach-ins); retain `_initSchema` as the construction-
      counting no-op seam; preserve the public method names used by
      `engine/index.js` and `memoryManager`
- [x] 2.4 Route all "do I hold this item?" checks through the canonical leaf:
      `hasItem`/`executeTrade`/offer lookups/`completeGoal` (exact SQL fast
      path, canonical fallback); drop `_findHeldItem` in favor of `hasItem`

## 3. Full-surface rollback + turn attribution

- [x] 3.1 Add `turn_index` to `lore`; `_extractAndStore` passes the batch
      `endTurnIndex` to narrated offers / goals / lore
- [x] 3.2 `rollbackTurn` deletes events + inventory + lore + barter_offers +
      quest_goals for `turn_index >= N` (offers/goals with `IS NOT NULL`);
      watermark rewind and vector `deleteItems` unchanged
- [x] 3.3 Fix the event-id hash in `_extractAndStore` to include `endTurnIndex`;
      replace the raw goal-dedup SQL with `findGoalByNpcAndTitle`

## 4. Single instance + verification

- [x] 4.1 Remove the second `BarterEngine` construction in `engine/index.js`;
      expose `this.barter = this.memory.barter` (shared instance over
      `engine.memory.structuredStore`)
- [x] 4.2 Tier 1: `npm run test:unit` — the 4 #27 tests + 2 migration tests
      pass (23/23 seam tests green)
- [x] 4.3 Tier 2: `npm run test:fast` green
- [x] 4.4 Tier 3: integration tier green
      (`python3 -m pytest -m integration --ignore=tests/test_live_llm.py --ignore=tests/test_openrouter_models.py --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py -q`)
- [x] 4.5 Tier 4: full pytest green
      (`python3 -m pytest tests/ -q --ignore=... --deselect=tests/test_mcp_protocol.py::TestMcpProtocolCompliance::test_tool_invoke_with_missing_required_param`)
- [x] 4.6 Deletion test: delete `BarterEngine`'s methods and the barter tables'
      ownership is unlocated across three modules — the complexity now
      concentrates in `StructuredStore` (schema + access + rollback)
- [x] 4.7 Update `engine/ARCHITECTURE.md` (memory/schema section + Consistency
      Contract block) and `tests/ARCHITECTURE.md` per AGENTS.md
