## Automated Tests

- **New — read-through freshness (unit seam 1.3, already landed, red until #26):**
  `tests/unit/memoryManager.test.mjs` asserts that `getEventLog`, `getInventory`,
  and `getStats` each reflect a buffered turn WITHOUT a caller-owned
  `flushIfReady` call. Run via `npm run test:unit`.
- **Existing guard — flush dedup:** the same file pins `isFlushing` /
  `activeFlushPromise` reuse: a second `flushIfReady` while in flight does not
  start a second extraction.
- **Existing guard — mock-mode suite stays green:** `npm run test:fast`,
  the integration tier (`python3 -m pytest -m integration --ignore=tests/test_live_llm.py --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py`),
  and `npm run test:all` all under `MOCK_LLM=1`. In particular:
  - `tests/test_scoring.py` — `dungeon_send_action`/`dungeon_inspect_state`
    score agreement after the read-through lands.
  - `tests/test_memory_features.py` — web memory routes still force-extract on
    read (`lastExtractedTurnIndex` advances on `GET /api/memory/stats`).
  - `tests/test_mcp_memory.py` — `dungeon_search_memories` freshness.
  - `tests/test_injection_defense.py` / `tests/test_extractor_validation.py` —
    turn-commit path unchanged (mock/replayable harnesses).
- **Expected still-red (owned by #27):** `tests/unit/structuredStore.test.mjs`
  full-surface rollback tests and the single-`BarterEngine`-instance test.

## Manual Verification

- **Cross-transport score agreement:** play several web turns, then compare
  `GET /api/state` `score` with the MCP `dungeon_send_action` /
  `dungeon_inspect_state` `score` at the same point in history — they must agree
  after each turn's flush.
- **Freshness without a caller flush:** play 1-2 web turns (below the batch of
  3), then call `GET /api/memory/inventory` / `events` / `stats` and
  `dungeon_inspect_inventory` / `dungeon_inspect_events` / `dungeon_inspect_stats`
  directly — the buffered turns' items/events/statistics appear without any
  intervening flush call.
- **RAG recall freshness:** after 1-2 turns that produced a recallable event,
  `dungeon_search_memories` returns the latest turn's material.
