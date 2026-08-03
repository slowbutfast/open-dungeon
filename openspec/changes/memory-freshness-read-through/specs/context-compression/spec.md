## MODIFIED Requirements

### Requirement: On-Demand Memory Sync
The game engine SHALL guarantee that every memory read reflects every turn committed to history, up to and including the last buffered turn, without a caller-owned flush ritual. The `MemoryManager` read path (`getEventLog`, `getInventory`, `getStats`, and `recallRelevantMemories`) SHALL await any in-flight flush and then force-flush the pending buffer before querying the structured store or vector index, so pending turns are extracted and their records/vector embeddings are included in the returned result.

The force-flush SHALL reuse the existing `isFlushing`/`activeFlushPromise` concurrency dedup: a read during an in-flight flush awaits the same active flush rather than starting a second extraction. The read-through flush SHALL use a manager-local state (no engine-state mutation), the manager's tracked model name, and no save callback, so a read never mutates engine score or cards as a side effect. Callers that need derived state (`engine.score`) or a direct store read flushed with engine state SHALL route through the single shared `forceFlushBeforeRead` helper.

#### Scenario: Client requests inventory, memory state, or search
- **WHEN** the client queries the active inventory, events, statistics, or semantic search API endpoints
- **THEN** any pending turns in the memory manager's buffer are immediately force-flushed and extracted to the database by the read path itself (no caller flush), and the updated records/vector embeddings are returned

#### Scenario: In-narration recall stays fresh without early extraction
- **WHEN** the narrator's context assembly invokes RAG recall or reads inventory while generating a response
- **THEN** the read flushes any buffered turns from prior turns so recall and inventory reflect them, and the currently generating turn (whose buffer enqueue runs after narration completes) is never extracted mid-generation
