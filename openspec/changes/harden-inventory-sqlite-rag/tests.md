## Automated Tests

- `python3 -m pytest tests/test_inventory_engine.py -v`: Verifies synchronous SQLite inventory CRUD operations, atomic trade transactions, case-insensitive index performance, and status transitions (`held`, `traded`, `dropped`).
- `python3 -m pytest tests/test_fuzzy_item_matcher.py -v`: Verifies Tier 1 text normalization, Tier 2 token overlap/Levenshtein string distance, and Tier 3 Vectra RAG semantic vector cosine similarity matches.
- `python3 -m pytest tests/test_api_endpoints.py -v`: Verifies pre-action deterministic item gating, local trade rejection for unowned items, and `GET /api/inventory` endpoint responses.
- `python3 -m pytest tests/test_live_llm.py -v`: Verifies live reasoning trace execution, status line moves counter synchronization, and `[CURRENT INVENTORY]` prompt injection.

## Manual Verification

- **Synchronous Inventory Inspection**:
  - **WHEN** user acquires an item in opening narration or via action
  - **THEN** item is immediately visible in sidebar UI cards without 4-turn summarization lag
- **Local Trade Rejection ($0 API Cost)**:
  - **WHEN** user attempts to trade or use an item not held in SQLite inventory
  - **THEN** system immediately displays local rejection message without making a network call to OpenRouter
