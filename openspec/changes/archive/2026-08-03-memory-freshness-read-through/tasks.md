# memory-freshness-read-through — tasks

TDD-first promotion of program candidate #26. Guardrails from
`architecture-deepening-sequence/specs/refactor-program/spec.md` apply.

## 1. Test Scaffolding (TDD)

- [x] 1.1 Reference the already-landed unit-seam read-through tests (program
      task 1.3) as the failing TDD scaffolding: `tests/unit/memoryManager.test.mjs`
      asserts `getEventLog` / `getInventory` / `getStats` reflect a buffered
      turn without a caller-owned flush
- [x] 1.2 Confirm the TDD red state: `npm run test:unit` shows the 3
      read-through tests failing (plus #27's still-red rollback/single-instance
      tests, which are not this change's)

## 2. Implement the read-through (manager)

- [x] 2.1 Add read-through flush inside `MemoryManager` public reads
      (`getEventLog`, `getInventory`, `getStats`, `recallRelevantMemories`):
      await any in-flight flush, then force-flush before querying — reusing the
      `isFlushing`/`activeFlushPromise` dedup
- [x] 2.2 Track `this.modelName` so the manager can flush without new required
      args; wire the engine (`newAdventure` / `load`) and the orchestrator
      (model-change sites in `engine/llm.js`) to keep it in sync
- [x] 2.3 Keep `recallRelevantMemories`' MOCK_LLM canned-response path working
      (flush before the `vectorStore.count` check)

## 3. Unify the flush twins + close the skipped consumers

- [x] 3.1 Reduce `web/routes/memory.js` and `mcp/tools/memory.js` inspect tools
      to thin reads (delete the web twin; drop per-read flush calls in the MCP
      tools; `await` the now-async `getStats`)
- [x] 3.2 Add an engine-state flush to web `GET /api/state` via the single
      shared `forceFlushBeforeRead` (MCP home), keeping the response shape
      byte-for-byte identical
- [x] 3.3 Update `engine/llm.js` in-narration reads (`getInventory` at the
      pre-action gate and prompt build) to await the async read; verify the
      in-flight turn is never extracted early (bufferTurnPair runs after
      narration)
- [x] 3.4 Verify `dungeon_send_action` / `dungeon_inspect_state` still agree on
      location/score/moves (both read `engine.score`; send_action drains the
      buffer with an engine-state flush first)

## 4. Verification + deletion test (guardrails #7/#8)

- [x] 4.1 Tier 1: `npm run test:unit` — the 3 read-through tests pass; #27's
      rollback-surface / single-instance tests remain red (not this change's)
- [x] 4.2 Tier 2: `npm run test:fast` green
- [x] 4.3 Tier 3: integration tier green
      (`python3 -m pytest -m integration --ignore=tests/test_live_llm.py --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py -q`)
- [x] 4.4 Tier 4: `npm run test:all` green
- [x] 4.5 Deletion test: remove the read-through and reads silently go stale —
      the obligation concentrates in the manager reads; the MCP/web flush
      surface shrank (2 divergent twins → 1 shared helper used only where
      engine-state flush is required)
- [x] 4.6 Update `engine/ARCHITECTURE.md` (memory + MCP key-design sections) and
      `tests/ARCHITECTURE.md` (unit-seam row note) per AGENTS.md
