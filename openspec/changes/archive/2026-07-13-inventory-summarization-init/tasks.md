## 1. Test Scaffolding (TDD)

- [x] 1.1 Add test cases to `tests/test_memory_features.py` checking that querying the inventory API returns starting items right after the first move.
- [x] 1.2 Add test validation to check that the `/api/memory/stats` and `/api/memory/inventory` endpoints trigger a force-flush of pending buffered turns.
- [x] 1.3 Add test checks for optional moves counter parsing from the status line pattern `[Status: <Loc> | Score: <Sc> (optional: | Moves: <M>)]` verifying backward compatibility.

## 2. Memory Initialization & On-Demand Synchronization

- [x] 2.1 Update `/api/init` in `web/routes/game.js` to buffer the initial turn pair (`turnIndex: 1`, player as description, DM as opening scene).
- [x] 2.2 Add `isFlushing` lock and `this.activeFlushPromise` tracker, and support for `options.force` in `flushIfReady` inside `engine/memory/memoryManager.js` to prevent duplicate concurrent LLM calls while ensuring data freshness.
- [x] 2.3 Update GET `/api/memory/inventory`, GET `/api/memory/events`, and POST `/api/memory/search` in `web/routes/memory.js` to call `engine.memory.flushIfReady` with `force: true` before reading records.

## 3. Prompt & Status Line Refinement

- [x] 3.1 Update `DEFAULT_SYSTEM_PROMPT` in `engine/index.js` and presets in `engine/storyPresets.js` to output moves in the status line formatting and add explicit rules to refuse nonexistent items.
- [x] 3.2 Update status line parser in both regex call sites in `engine/llm.js` (streaming buffer path and non-buffer path) to parse location, score, and optional moves using regex: `(?:\|\s*Moves:\s*(\d+))?`.
- [x] 3.3 Implement manual increment fallback (`state.moves += 1`) if the Moves match group is missing or malformed.
- [x] 3.4 Verify moves counter increments correctly on UI updates and that tests pass successfully.
