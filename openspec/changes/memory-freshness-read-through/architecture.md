## Context

`MemoryManager` buffers turn pairs and extracts them to the structured store +
vector index only when ≥3 accumulate (`flushIfReady`, `memoryManager.js:51-81`).
Every memory read was therefore correct only if the caller ran
`flushIfReady(..., {force:true})` first. That obligation is caller-owned
ceremony and has drifted into two divergent twins (`web/routes/memory.js:6-10`
and `mcp/tools/memory.js:18-31`), while two RAG consumers skip it entirely and
`GET /api/state` returns the derived `engine.score` with no flush. Since
`fix-score-progression`, `state.score` is engine-computed over extracted
milestone events at flush time (`memoryManager.js:306`) and at undo
(`engine/index.js:187`), so any read of score on the web transport can diverge
from the MCP surface. Verified in-repo; no external code.

## System Architecture Diagram

```mermaid
flowchart LR
    subgraph Callers
        MCP[(mcp/tools: memory, gameplay, state)]
        WEB[(web/routes: memory, game)]
        NARR[Narration / engine/llm.js]
    end
    subgraph Memory
        MM[MemoryManager]
        Read[getEventLog/getInventory/getStats/recallRelevantMemories]
        Flush[flushIfReady force]
        Store[(structuredStore SQLite)]
        Vec[(vector index)]
    end
    subgraph State
        State[(engine.state: score, cards, moves)]
    end

    MCP -->|"inspect tools"| MM
    WEB -->|"/api/memory/*"| MM
    NARR -->|"RAG recall / prompt inventory"| MM
    MM -->|"READ-THROUGH: flush then read"| Read
    Read --> Flush
    Flush --> Store
    Flush --> Vec
    MCP -->|"send_action / inspect_lore (score, direct store)"| Flush
    WEB -->|"GET /api/state (score)"| Flush
    Flush --> State
    Read --> Store
    Read --> Vec
```

## Goals / Non-Goals

**Goals:**
- Every `MemoryManager` read reflects every turn committed to history — no
  caller-owned flush ritual.
- One `forceFlushBeforeRead` implementation; the memory routes/tools shrink to
  thin reads.
- `dungeon_search_memories` and in-narration RAG recall are fresh.
- `GET /api/state` reports the same score as the MCP surface.
- Preserve the `isFlushing`/`activeFlushPromise` dedup: a read during an
  in-flight flush awaits it and does not start a second extraction.

**Non-Goals:**
- Not changing the batch size (3) or extraction semantics.
- Not changing `engine/scoring.js` rules or undo behavior.
- Not making `dungeon_inspect_state` itself flush (it reads `engine.score`;
  agreement is preserved because `dungeon_send_action` drains the buffer with an
  engine-state flush before reporting).
- Not computing score lazily on the read path (left open in research).
- Not adding a `getLore` read to the manager; `dungeon_inspect_lore` keeps its
  engine-state flush because it reads the store directly.

## Decisions

**D1 — Read-through flush inside `MemoryManager`'s public reads.**
`getEventLog`, `getInventory`, `getStats`, and `recallRelevantMemories` await any
in-flight flush and then force-flush the pending buffer before querying the
store/vector index. This is the single home of the freshness obligation — the
deletion test: remove the read-through and reads silently go stale again.
*Alternative rejected:* a `FreshReadStore` wrapper (overkill; the buffering
already lives in `MemoryManager`).

**D2 — The read-through flushes with a manager-local state, engine model, and
no save.**
The reads keep their existing signatures (`getInventory(adventureId)`, etc.) —
no new required args. The manager flushes with `{adventureId: currentAdventureId,
cards: []}`, `this.modelName || "local-model"`, and no `saveFn`. `state.cards`
is a throwaway so a read cannot mutate engine cards; `saveFn` is best-effort
absent (a read does not need to persist). Score computed on the throwaway state
is discarded. Engine state (`score`, `cards`) is only mutated by engine-state
flushes (`dungeon_send_action`, `dungeon_inspect_lore`, `GET /api/state`, the
post-turn background flush).

**D3 — The manager owns a `modelName`; the engine keeps it in sync.**
The manager flushes with `this.modelName` so real-mode read-through extraction
uses the loaded model (never the "local-model" fallback). The engine sets it in
`newAdventure` and `load`; the orchestrator syncs it on model changes in
`engine/llm.js`. `flushIfReady` does not record the model from its argument, so
a read-through passing the fallback cannot clobber the real model.

**D4 — Unify the twins by deletion + shared home.**
`web/routes/memory.js` drops its private `forceFlushBeforeRead`; its routes and
the MCP memory tools become thin reads (data freshness is the manager's job).
The single remaining `forceFlushBeforeRead` (the MCP copy in
`mcp/tools/memory.js`) remains for engine-state flush needs and is imported by
`web/routes/game.js` for `GET /api/state`. Net: two divergent implementations →
one shared helper; the helper is used where derived state or a direct store read
requires engine state, not as per-read ceremony.

**D5 — In-narration reads are fresh; the in-flight turn is never extracted
early.**
`recallRelevantMemories` (RAG recall in `generateResponseStream`) and
`getInventory` (prompt inventory / pre-action gate) flush via the read-through.
This is safe because the current turn's `bufferTurnPair` runs only after
narration completes — at recall/gate time the buffer holds only prior turns. The
freshness contract has no carve-out.

## Risks / Trade-offs

- **[D1 unconditional flush cost]** — every read can trigger extraction at most
  once per buffered turn; in practice reads coalesce behind the batch threshold.
  The 3-turn batch economics are intentionally preserved (constant unchanged);
  read-through flushes only the pending residue.
- **[D2 read-through does not mutate engine.score]** — a memory read between
  turns extracts pending turns and advances the watermark without updating
  `engine.score`; a subsequent `GET /api/state` whose buffer is already empty
  reports the score from the last engine-state flush. Both transports still
  agree at their own read points (send_action / inspect_state / api/state all
  flush engine state), and no test asserts score-after-memory-read.
- **[D3 model wiring]** — if `modelName` were unset, real-mode read-through
  extraction would hit the API with "local-model". Mitigated by D3; mock mode
  is unaffected.
- **[D4 helper consumers]** — `dungeon_inspect_lore` still reads the store
  directly and needs its engine-state flush; kept, not removed.
- **[flush-race at llm.js:596]** — a background flush already in flight makes a
  concurrent `flushIfReady` await it without draining a fresh batch (pre-existing
  dedup). Unchanged here; the read-through preserves the same await-in-flight
  behavior (research: raised but not acted on).

## Migration

No data migration. Behavior change: reads that previously returned stale data
now force extraction of pending buffered turns first. Callers that passed a
return value around (not awaiting) were updated: `engine/llm.js` now awaits the
async `getInventory`; `web/routes/memory.js` and `mcp/tools/memory.js` await
`getStats`.

## Open Questions

- Whether `computeScore`'s full scan (`structuredStore.getEvents(adventureId,
  100000)`) should become an incremental counter (flagged in research; revisit
  past ~10k events).
- Whether extraction should flush eagerly after every turn (left as-is; the
  read-through naturally coalesces behind the batch threshold in practice).
