**GitHub Issue**: [#7 (Harden Inventory System with Synchronous SQLite Storage, Atomic Transactions, and RAG Embedding Search)](https://github.com/slowbutfast/open-dungeon/issues/7)

## Why

The current inventory engine relies on an asynchronous 4-turn background LLM summarization worker (`EventExtractor`), creating a 4-turn memory lag where newly acquired items are missing from system prompts. Furthermore, the engine lacks deterministic pre-action validation, allowing LLM hallucinations, item duplication, and unvalidated trading.

Hardening the inventory system with synchronous SQLite CRUD transactions, atomic state swaps, a 3-tiered fuzzy matching pipeline, and Vectra RAG vector embeddings fixes this fundamental flaw and establishes a reliable data foundation for future gameplay mechanics (like bartering and quest goals).

## What Changes

- **Synchronous SQLite Inventory Engine**: Move inventory CRUD from delayed background extraction to synchronous SQLite transactions with expanded `inventory` schema (`status IN ('held', 'traded', 'dropped', 'consumed', 'location')`, `quantity`, `aliases` JSON array, and `acquired_turn`).
- **Sub-Millisecond SQLite Case-Insensitive Indexing**: Add `idx_inventory_held` index for fast lookups by `adventure_id`, `status`, and `item_name`.
- **3-Tiered Fuzzy & Hybrid Matching Pipeline**:
  - Tier 1: Text Normalization & Stopword Stripping.
  - Tier 2: Token Overlap & Levenshtein String Distance (<1ms).
  - Tier 3: Vectra Hybrid RAG Semantic Vector Embedding Match (Cosine Distance) for complex synonyms (e.g. `finger band` ↔ `Silver Ring`).
- **Deterministic Action Interceptor & Edge Case Protections**:
  - Stackable quantity handling (decrement `quantity` for partial stacks).
  - Disambiguation prompts when multiple items match with equal confidence.
  - Container scoping (`status = 'held'` required for trades/uses).
  - Post-stream narrator auto-reward scanner hook (`you receive...`, `hands you...`).
  - `engine.undo()` state rollback synchronization.

## Capabilities

### New Capabilities
- `inventory-system`: Defines the synchronous SQLite data layer, 3-tiered fuzzy matching, pre-action item gating, RAG embedding sync, and inventory status transitions.

### Modified Capabilities
- `game-engine`: Updated to invoke deterministic pre-action inventory validation and synchronous SQLite state updates prior to streaming LLM narration.

## Impact

- `engine/memory/structuredStore.js`: Schema expansion, indexes, atomic transactions, and synchronous helper methods (`hasItem`, `executeTrade`, `getInventory`).
- `engine/memory/memoryManager.js`: Instant vector embedding sync for acquired/traded items.
- `engine/llm.js` & `engine/index.js`: Pre-action interceptor, system prompt injection of `[CURRENT INVENTORY]`, post-stream narrator acquisition scanner, and undo rollback hooks.
- `web/routes/game.js`: API endpoints for inventory inspection and client state sync.
