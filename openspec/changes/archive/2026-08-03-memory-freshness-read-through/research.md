## Source material

### Architecture deepening review, candidate #1 (2026-08-03)

The engine's Memory Extraction is batched: `memoryManager.bufferTurnPair` queues a turn, and `flushIfReady` only runs `_extractAndStore` once ≥3 turns accumulate (`memoryManager.js:51-81`). That makes every memory *read* only correct if the caller flushes first. The freshness obligation is not enforced by any module — it is a caller ritual, and it has already started drifting.

**Divergent flush twins.** Two independent `forceFlushBeforeRead` implementations exist:
- `web/routes/memory.js:6-10` — guards on `engine.memory && engine.state`, passes `engine.model` straight through, propagates errors.
- `mcp/tools/memory.js:18-31` — guards on `engine.adventureId`, awaits `engine.getLoadedModel()`, swallows errors.

Same concept, different model-resolution, different error policy. The MCP copy is now shared across `gameplay.js` and `state.js`; the web copy is still private to `web/routes/memory.js`.

**Skipped consumers.** Two RAG reads bypass the ritual entirely:
- In-narration recall `engine/llm.js:314` → `contextManager.getRAGContext` → `memoryManager.recallRelevantMemories`, with no flush before it.
- `dungeon_search_memories` in `mcp/tools/memory.js` — the only memory tool with no flush call while its three siblings all flush.

**Score is derived state, and it exposes the same hole.** Since `fix-score-progression` landed, `state.score` is engine-computed over extracted milestone events at flush time (`memoryManager.js:301` in `_extractAndStore`) and at undo (`engine/index.js:187`). The narrator's `Score:` claim is advisory and ignored. Consequences observed in the current tree:
- MCP `dungeon_send_action` had to add `forceFlushBeforeRead(engine)` (`mcp/tools/gameplay.js:57`) just to report a score consistent with `dungeon_inspect_state` — with the flush running *after* narration generation.
- Web `GET /api/state` (`web/routes/game.js:236-255`) returns `engine.score` directly, with **no flush**. Two transports, different freshness guarantees for the same value.

**Deletion test.** Delete both flush helpers and complexity does not concentrate anywhere — the reads just silently go stale. The only thing keeping reads correct today is duplicated, caller-owned, driftable ceremony. This is the signal the deepening is real.

### Raised but not acted on

- **Whether `computeScore`'s full scan (`structuredStore.getEvents(adventureId, 100000)`) should move to an incremental counter.** Flagged; the current change is about freshness, not score performance. Revisit if an adventure exceeds ~10k events.
- **Whether extraction should flush eagerly after every turn.** The 3-turn batch exists to save LLM calls; eager flush would change cost. Left as-is.
- **The precise interaction between the background flush at `llm.js:596` and a read racing it.** Partially handled (`isFlushing`/`activeFlushPromise` dedup in `flushIfReady`), but no dedicated test.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| freshness | A read reflects every turn committed to history, up to and including the last buffered turn | A read that is merely not-ancient |
| flush ritual | The caller obligation to invoke `flushIfReady(..., { force: true })` before a read | An interface guarantee |
| read-through | The Memory module flushes pending buffer as part of the read path | Caching that can serve stale data |
| derived state | `state.score` — computed from extracted store events, not adopted from narration | The narrator's `Score:` status-line claim (advisory) |
| batch size | 3 — the turn-buffer threshold that triggers `_extractAndStore` | The extraction watermark |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — in-repo consistency work; no external code) | — | — | 2026-08-03 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Flush inside every `read()` on `MemoryManager` | Adopt | Moves the guarantee behind the interface; the only place a caller can forget is eliminated | 2026-08-03 |
| A `FreshReadStore` wrapper class | Reject | Overkill; the buffering already lives in `MemoryManager`, so the read-through belongs there too | 2026-08-03 |
| Compute score lazily on the read path instead of persisting at flush | Open | Would make `/api/state` always fresh, but couples score to the same extraction freshness — investigate in the design phase | 2026-08-03 |

## Patterns adopted

From prior in-repo work: the `isFlushing`/`activeFlushPromise` dedup in `flushIfReady` is the concurrency pattern a read-through path must preserve (await the in-flight flush, then read). See `make-undo-and-trades-consistent` for the same await-in-flight-flush pattern inside `rollbackTurns`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `flushIfReady` is only called by callers, never by a store/manager read | Call sites: `llm.js:596`, `context.js:47`, `web/routes/memory.js:8`, `mcp/tools/memory.js:22` | Code read | 2026-08-03 | stable |
| Two divergent `forceFlushBeforeRead` implementations exist | `web/routes/memory.js:6-10` vs `mcp/tools/memory.js:18-31` | Code read | 2026-08-03 | stable |
| MCP copy is shared; web copy is private | Imported by `mcp/tools/gameplay.js:10`, `mcp/tools/state.js:10`; web copy local to `web/routes/memory.js` | Code read | 2026-08-03 | stable |
| In-narration RAG recall does not flush | `llm.js:314` calls `getRAGContext` → `recallRelevantMemories` with no flush | Code read | 2026-08-03 | stable |
| `dungeon_search_memories` does not flush | No `forceFlush` call in its handler (`mcp/tools/memory.js`, search tool) | Code read | 2026-08-03 | stable |
| `state.score` is computed at flush and undo only | `memoryManager.js:301`, `engine/index.js:187`; no per-turn assignment in `llm.js` commit path | Code read | 2026-08-03 | stable |
| MCP `dungeon_send_action` force-flushes before reading score | `mcp/tools/gameplay.js:57` | Code read | 2026-08-03 | stable |
| Web `/api/state` returns score without flushing | `web/routes/game.js:236-255` | Code read | 2026-08-03 | stable |
| Deleting both flush helpers concentrates no complexity | Reads would silently go stale; no module enforces freshness | Deletion test | 2026-08-03 | stable |

## Unverified assumptions

- **That flush-before-read is cheap enough to make unconditional.** Every `read()` on the Memory module would trigger extraction at most once per 3 turns in the worst case; real cost is a single LLM extraction call. Not benchmarked.
- **That no consumer intentionally wants stale memory** (e.g. in-narration recall tolerating a 2-turn lag). The `llm.js:314` skip may be deliberate — the design phase must confirm whether to flush there or keep the skip explicit and documented.
- **That `getLoadedModel()` vs `engine.model` divergence has no behavioral impact.** Both should resolve to the same model in practice; untested under model-swap.

## Superseded claims

- **"The two flush helpers are identical."** Superseded by code read: they guard on different fields, resolve the model differently, and differ on error propagation.

## Links out

- `engine/memory/memoryManager.js:51` — `flushIfReady` definition
- `engine/memory/memoryManager.js:301` — score recompute at flush
- `engine/index.js:187` — score recompute at undo
- `web/routes/memory.js:6` — web flush twin
- `mcp/tools/memory.js:18` — MCP flush twin
- `mcp/tools/gameplay.js:57` — MCP send_action flush
- `web/routes/game.js:236` — `/api/state` (no flush)
- `engine/llm.js:314,596` — RAG recall (no flush) / background flush
- `openspec/specs/game-engine/spec.md` — scoring/state capability
- `openspec/specs/inventory-system/spec.md` — memory capability
