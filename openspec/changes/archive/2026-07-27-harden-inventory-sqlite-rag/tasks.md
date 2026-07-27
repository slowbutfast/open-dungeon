## 1. Test Scaffolding (TDD)

- [x] 1.1 Create `tests/test_inventory_engine.py` to verify synchronous SQLite inventory CRUD, atomic trade transactions, case-insensitive indexing, and status transitions.
- [x] 1.2 Create `tests/test_fuzzy_item_matcher.py` to verify Tier 1 normalization, Tier 2 token overlap, and Tier 3 Vectra RAG semantic vector cosine similarity.
- [x] 1.3 Add deterministic pre-action gating test cases to `tests/test_api_endpoints.py`.

## 2. Core Implementation

- [x] 2.1 Update SQLite schema in `engine/memory/structuredStore.js` with expanded `inventory` columns (`status`, `quantity`, `aliases`, `acquired_turn`) and create `idx_inventory_held` index.
- [x] 2.2 Implement synchronous SQLite helper methods (`hasItem`, `executeTrade`, `getInventory`, `decrementQuantity`) in `engine/memory/structuredStore.js`.
- [x] 2.3 Implement 3-tiered fuzzy matching module in `engine/memory/itemMatcher.js` combining Tier 1 normalization, Tier 2 string distance, and Tier 3 Vectra RAG vector cosine similarity.
- [x] 2.4 Add pre-action item validation interceptor and prompt injection in `engine/llm.js` and `engine/index.js`.
- [x] 2.5 Add post-stream narrator acquisition scanner hook and undo rollback synchronization.
- [x] 2.6 Run full test suite (`pytest`) and verify 100% pass across unit, integration, and live tests.
