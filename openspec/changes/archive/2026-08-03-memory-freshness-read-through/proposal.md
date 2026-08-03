## Why

Memory extraction is batched: `MemoryManager.bufferTurnPair` queues a turn and
`flushIfReady` only extracts once ≥3 turns accumulate. Every memory *read* is
therefore only correct if the caller first performs a `flushIfReady(..., {force:true})`
ritual — and that obligation is not enforced by any module, so it has already
drifted:

- Two divergent `forceFlushBeforeRead` twins exist (`web/routes/memory.js:6-10`
  vs `mcp/tools/memory.js:18-31`) with different guards, different model
  resolution (`engine.model` vs `await engine.getLoadedModel()`), and different
  error policy (propagate vs swallow).
- Two RAG consumers skip the ritual entirely: in-narration recall
  (`engine/llm.js` `getRAGContext` → `recallRelevantMemories`) and
  `dungeon_search_memories`.
- `GET /api/state` returns `engine.score` with no flush, so the web transport
  gives a different freshness guarantee than the MCP surface for the same value.

The deletion test confirms this is a real deepening target: delete both flush
helpers and no module concentrates the complexity — reads simply go stale.

## What Changes

- **Move the freshness guarantee behind the `MemoryManager` interface.** Every
  public read (`getEventLog`, `getInventory`, `getStats`,
  `recallRelevantMemories`) awaits any in-flight flush and then force-flushes
  the pending buffer before querying the store/vector index. A caller can no
  longer forget the ritual — it lives in the read path.
- **Unify the two `forceFlushBeforeRead` twins.** The web memory routes and MCP
  memory tools become thin reads (the manager read-through covers data
  freshness). The single remaining helper (the MCP copy) stays as the home for
  engine-state flushes where derived state (`score`) or a direct store read
  (`dungeon_inspect_lore`) needs the engine state: `dungeon_send_action`,
  `dungeon_inspect_lore`, and (new) web `GET /api/state`.
- **Close the skipped-consumer holes.** `dungeon_search_memories` and
  in-narration RAG recall become fresh automatically because their reads now
  flush. Care is taken that the in-flight turn (whose `bufferTurnPair` runs
  after narration completes) is never extracted mid-generation.
- **Score parity between transports.** `GET /api/state` flushes before building
  its response (mirroring the MCP surface), so `state.score` agrees with
  `dungeon_inspect_state` / `dungeon_send_action`. Response shape unchanged.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `context-compression`: modify `On-Demand Memory Sync` (freshness guaranteed by
  the `MemoryManager` read path rather than a caller-owned flush ritual).
- `game-engine`: modify `Generate Response Stream` (in-narration RAG recall and
  prompt inventory reads are fresh; the in-flight turn is never extracted early).

## Impact

- `engine/memory/memoryManager.js` — read-through flush on `getEventLog` /
  `getInventory` / `getStats` / `recallRelevantMemories`; `modelName` tracking
  so the manager can flush without new required args.
- `engine/index.js` — set `memory.modelName` on `newAdventure` / `load`.
- `engine/llm.js` — `await` the (now-async) `getInventory` reads; sync
  `memoryManager.modelName` on model changes.
- `web/routes/memory.js` — remove the private flush twin; thin reads.
- `mcp/tools/memory.js` — remove flush calls from the three inspect tools
  (reads flush internally); keep the exported `forceFlushBeforeRead` for
  engine-state flush consumers.
- `web/routes/game.js` — `GET /api/state` flushes via the shared helper before
  building the response.
- Tests: the three read-through freshness tests (unit seam 1.3) go green.
- No new dependencies; batch size and extraction semantics unchanged.
