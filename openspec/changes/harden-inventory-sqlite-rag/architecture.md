## Context

The current engine extracts inventory asynchronously during auto-summarization every 4 turns (`EventExtractor`), creating a 4-turn memory lag where newly acquired items are missing from system prompts. Furthermore, actions execute without pre-action validation, allowing item hallucinations, duplication, and unvalidated trades.

## System Architecture Diagram

```mermaid
flowchart TD
    PlayerAction[Player Action: 'trade Silver Ring for Health Potion'] --> Interceptor[Deterministic Action Interceptor]

    subgraph Synchronous SQLite Storage Engine
        Interceptor --> QuerySQLite{StructuredStore.getInventory / hasItem}
        QuerySQLite -->|Item Missing| LocalReject[Reject Action Locally - $0 LLM Cost]
        QuerySQLite -->|Item Present| AtomicSwap[BEGIN TRANSACTION: Set status='traded' + Insert 'Health Potion']
    end

    subgraph RAG & System Prompt Pipeline
        AtomicSwap --> EmbedVectra[Embed Trade Event in Vectra Vector Store]
        AtomicSwap --> InjectPrompt[ContextManager: Inject [CURRENT INVENTORY] & [SYSTEM EVENT]]
        InjectPrompt --> LLMStream[LLM Narration Stream]
    end

    subgraph 3-Tiered Fuzzy Matcher
        FuzzyQuery[Fuzzy Item Search: 'shiny silver band'] --> Tier1[Tier 1: Text Normalization & Stopword Stripping]
        Tier1 --> Tier2[Tier 2: Token Overlap & String Distance]
        Tier2 -->|Ambiguous / Synonyms| Tier3[Tier 3: Vectra Cosine Vector Distance]
        Tier3 --> MatchResolved[Resolved SQLite Item ID]
    end
```

## Architectural Options Evaluated

| Pattern | Mechanism | Latency / API Cost | Model Compatibility | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **Pattern A: LLM Tool Calling (MCP / Functions)** | LLM emits tool call mid-turn ➔ Engine runs SQLite ➔ 2nd LLM call for narration | 2x Round-trips (~3-5s), 2x Token Cost | Fails on models lacking tool calling support | **Rejected** |
| **Pattern B: Post-Stream Extraction (Current)** | LLM Narrates ──▶ Background Worker extracts items every 4 turns | 1 Round-trip, but 4-turn memory lag | All models | **Rejected** (Flawed) |
| **Pattern C: Hybrid Interceptor + Prompt Injection** | Sub-millisecond local SQLite check ──▶ Single-turn LLM narration stream | 1 Round-trip (<200ms startup), $0 cost for invalid actions | 100% Compatible (DeepSeek, Gemini, Llama, LM Studio) | **Selected** ✓ |

## Database Schema & Index Design

```sql
-- Expanded SQLite Inventory Table Schema
CREATE TABLE IF NOT EXISTS inventory (
    id              TEXT PRIMARY KEY,
    adventure_id    TEXT NOT NULL,
    item_name       TEXT NOT NULL,
    item_type       TEXT DEFAULT 'misc',
    description     TEXT,
    quantity        INTEGER DEFAULT 1,
    acquired_at     TEXT,
    acquired_turn   INTEGER,
    status          TEXT DEFAULT 'held', -- 'held', 'traded', 'dropped', 'consumed', 'location'
    aliases         TEXT -- JSON Array e.g. ["silver ring", "finger band", "shiny ring"]
);

-- Sub-Millisecond Case-Insensitive Index
CREATE INDEX IF NOT EXISTS idx_inventory_held 
ON inventory(adventure_id, status, item_name COLLATE NOCASE);
```

## Comprehensive Edge Case Matrix

| Edge Case | Danger / Failure Mode | Hardened Mitigation Strategy |
| :--- | :--- | :--- |
| **1. Stackable Quantities** | Wiping full stack on partial trade/use | Decrement `quantity -= requestedQuantity` in SQLite if `quantity > requestedQuantity`; flip `status = 'traded'` only when stack reaches 0. |
| **2. Item Ambiguity** | Dropping wrong item when player has `Rusty Dagger` and `Elven Dagger` | Detect multi-match collisions in Tier 2/3 matcher and intercept action with clarification prompt before calling LLM. |
| **3. Container Scoping** | Trading unpicked items inside unopened chests | Gate trades strictly on `status = 'held'`. Items in chests hold `status = 'location'`. |
| **4. Narrator Auto-Rewards** | Narrator gives item in text without explicit player `take` | Post-stream acquisition scanner scans final narration for acquisition patterns (`you receive...`, `hands you...`) and inserts item into SQLite. |
| **5. Item Renaming / Synonyms** | Exact match failure when DM renames item | Store JSON array of `aliases` in SQLite and search query against both `item_name` and `aliases`. |
| **6. Undo / Rollback** | Inventory out of sync after clicking Undo | Record `acquired_turn` and `status_turn` in SQLite; `engine.undo()` reverts inventory status changes made on or after undone turn. |

## Goals / Non-Goals

**Goals:**
- **Synchronous CRUD**: Update SQLite `inventory` table synchronously upon item acquisition, usage, or trade.
- **Sub-Millisecond Lookups**: Index `inventory` table on `(adventure_id, status, item_name COLLATE NOCASE)`.
- **3-Tiered Fuzzy Search**: Resolve item synonyms (`shiny ring` ↔ `Silver Ring`) using Normalization, Token Overlap, and Vectra Vector Cosine Similarity.
- **Edge Case Protection**: Handle stackable quantities, multi-match disambiguation, container scoping, narrator auto-rewards, and undo rollbacks.

**Non-Goals:**
- Out of scope: Interactive trade UI modal and NPC goal handshake state machine (handled in Phase 2, Issue #8).

## Decisions

- **Decision 1: Synchronous Interceptor over LLM Function Calling / MCP**:
  - *Rationale*: Function calling requires two LLM network round-trips per turn, doubling latency and API costs. The synchronous interceptor validates actions locally in <1ms before calling the LLM once.
- **Decision 2: 3-Tiered Hybrid Matching**:
  - *Rationale*: Combining deterministic text normalization with Vectra RAG cosine embeddings ensures 100% match resilience without failing on synonyms or capitalization.

## Risks / Trade-offs

- **[Risk]**: Narrator text introduces items without explicit player `take` command.
  - **Mitigation**: Add post-stream acquisition scanner hook to auto-upsert items into SQLite.
- **[Risk]**: Ambiguous query matches multiple items.
  - **Mitigation**: Intercept action locally and prompt player for clarification before sending to LLM.
