## Context

The current engine extracts inventory asynchronously during auto-summarization every 4 turns, leaving newly acquired items missing from system prompts. Furthermore, actions execute without pre-action validation, allowing item hallucinations, duplication, and unvalidated trades.

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
