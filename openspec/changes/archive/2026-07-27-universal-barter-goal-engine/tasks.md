## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing tests for Universal Barter Trade Execution (`tests/test_barter_engine.py`): barter contract creation, valid trade atomic swap, unowned item rejection, partial quantity trades
- [x] 1.2 Write failing tests for NPC Quest Goal State Machine (`tests/test_barter_engine.py`): goal creation, state transitions (`NOT_STARTED` → `IN_PROGRESS` → `COMPLETED`), reward item insertion
- [x] 1.3 Write failing API endpoint tests for `/api/trade` and `/api/goals` (`tests/test_api_endpoints.py`): valid trade SSE stream, unowned rejection stream, goal completion stream
- [x] 1.4 Write failing Playwright E2E tests for Interactive Barter UI (`tests/e2e/test_barter_ui.py`): action chip rendering, Barter Modal open/close, one-click trade execution

## 2. Barter Engine Core (`engine/memory/barterEngine.js`)

- [x] 2.1 Create `BarterEngine` class with SQLite-backed barter offer storage (`barter_offers` table: `id`, `adventure_id`, `trader_name`, `required_item`, `offered_item`, `description`)
- [x] 2.2 Implement `registerOffer(adventureId, traderName, requiredItem, offeredItem)` to upsert barter contracts
- [x] 2.3 Implement `getOffersForTrader(adventureId, traderName)` to list available trades
- [x] 2.4 Implement `executeBarter(adventureId, traderName, requiredItem)` wrapping `StructuredStore.executeTrade()` in validation + atomic swap

## 3. Quest Goal State Machine (`engine/memory/barterEngine.js`)

- [x] 3.1 Add `quest_goals` SQLite table (`id`, `adventure_id`, `npc_name`, `goal_title`, `required_item`, `reward_item`, `status`, `created_turn`, `completed_turn`)
- [x] 3.2 Implement `createGoal(adventureId, npcName, goalTitle, requiredItem, rewardItem)` with initial status `NOT_STARTED`
- [x] 3.3 Implement `completeGoal(adventureId, goalId)` with deterministic SQLite validation: check `hasItem(requiredItem)`, transition to `COMPLETED`, insert `rewardItem` as `held`
- [x] 3.4 Implement `getActiveGoals(adventureId)` returning non-completed goals

## 4. Game Engine Integration (`engine/llm.js`, `engine/index.js`)

- [x] 4.1 Add barter intent detection to pre-action gating interceptor in `engine/llm.js` (detect `trade X to Y`, `barter X for Y` patterns)
- [x] 4.2 Implement `[SYSTEM EVENT]` prompt injection after successful `executeBarter()` call
- [x] 4.3 Wire `BarterEngine` initialization into `engine/index.js` alongside existing `StructuredStore`

## 5. API Endpoints (`web/routes/game.js`)

- [x] 5.1 Add `POST /api/trade` endpoint: validate ownership, execute atomic barter, inject system event, stream LLM narration
- [x] 5.2 Add `GET /api/goals` endpoint: return active quest goals for current adventure
- [x] 5.3 Add `POST /api/goals/complete` endpoint: validate and complete goal, grant reward item

## 6. Frontend Barter UI (`web/static/js/`)

- [x] 6.1 Create `components/barterModal.js`: retro side-by-side Barter Modal displaying player inventory and trader offers
- [x] 6.2 Create `components/actionChips.js`: parse NPC/trader entities from narration and render `💬 Talk`, `🔄 Barter`, `📜 Goals` chips
- [x] 6.3 Wire action chip click handlers to open Barter Modal and fire `/api/trade` requests
- [x] 6.4 Add trade success toast notification and inventory grid re-render after completed swap

## 7. Verification & Polish

- [x] 7.1 Run full automated test suite (`pytest tests/test_barter_engine.py tests/test_api_endpoints.py -v`) and verify 100% pass
- [x] 7.2 Manual verification: action chips render below narration, Barter Modal opens, one-click trade works end-to-end
- [x] 7.3 Update `engine/ARCHITECTURE.md` and `web/FRONTEND_ARCHITECTURE.md` with barter engine documentation
