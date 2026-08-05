## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing tests: undo removes store events/inventory rows + vectors for the reverted turn, rewinds watermark, decrements moves
- [x] 1.2 Write failing test: `dungeon_search_memories` does not recall an undone turn
- [x] 1.3 Write failing tests: narrated trade releases the sold item (not held) and re-trading fails possession (duplicate-sale regression)
- [x] 1.4 Write failing tests: narrated trade offer appears in `dungeon_inspect_offers` and `dungeon_execute_trade` succeeds; narrated goal appears in `dungeon_inspect_goals` and can be completed
- [x] 1.5 Write failing test: extraction expresses item removal (trade resolves both sides deterministically)

## 2. Transactional Undo

- [x] 2.1 Implement `memoryManager.rollbackTurns(turnIndex)` removing store rows + vector ids for undone turns and rewinding the watermark
- [x] 2.2 Wire rollback into `engine.undo` after history revert; decrement `moves`
- [x] 2.3 Await any pending flush before rollback (race handling)

## 3. Narrated Trade Resolution

- [x] 3.1 Route classified narrated trades through `barterEngine.executeBarter` (possession check + atomic swap)
- [x] 3.2 Add `traded` (removal) to the extractor's `inventory_changes[].action` and resolve both sides
- [x] 3.3 Ensure a refused/ambiguous narrated trade returns a refusal, not a crash

## 4. Offer & Goal Creation from Narration

- [x] 4.1 Extend the extractor output schema with `offers` and `goals`
- [x] 4.2 Wire extraction output to `barterEngine.registerOffer` and `createGoal`
- [x] 4.3 Validate offer/goal extraction output (ties to `validate-memory-extraction`)

## 5. Name Normalization

- [x] 5.1 Implement the shared canonical-name matching helper
- [x] 5.2 Use it in `executeBarter` name lookups and extraction writes (coordinate with `validate-memory-extraction`)

## 6. Verification & Coordination

- [x] 6.1 Run `python3 -m pytest tests/test_mcp_*.py tests/test_barter_engine.py -v` and confirm green
- [x] 6.2 Run the non-integration suite and confirm green
- [ ] 6.3 Live playtest: undo consistency, narrated trade + offers, quest goals from narration. The 2026-08-03 parallel playtest sweep already covered the MOCK-mode long-chain portion (undo/trades/goals verified via isolated servers — see research.md); the remaining manual step is a real-model spot-check (cost-aware)
- [x] 6.4 Coordinate name normalization with `validate-memory-extraction`; coordinate extraction-schema changes with `close-prompt-injection-backdoor` (#15) verification — both dependencies have landed and are archived; done

## 7. Inventory Status-Mutation Rollback (residual — 2026-08-03 playtest)

The 2026-08-03 playtest sweep found undo-after-trade is still broken in two ways
that share one root cause: `rollbackTurn` deletes inventory rows by
`acquired_turn >= N` only and never reverts status mutations made on the undone
turn to pre-existing rows. Spec D5 + the game-engine Undo Action delta define the
fix. TDD-first.

- [x] 7.1 Write failing unit-seam tests: (a) trade-undo restore — undo a narrated trade restores the sold item to `held`, not `traded` limbo; (b) re-acquire undo (#22) — undo a re-acquisition removes the item even when its original `acquired_turn` predates the undone turn
- [x] 7.2 Add assertions to `tests/test_barter_engine.py::test_undo_after_trade_restores_inventory` (currently a dead test) and write the MCP-surface equivalents in `tests/test_undo_consistency.py`
- [x] 7.3 Implement the per-turn status tracking in `upsertInventoryItem` (e.g. a `status_turn` column with a guarded `ALTER TABLE` migration, per D5) and make `rollbackTurn` (i) delete rows re-acquired on the undone turn and (ii) restore pre-existing rows whose status was mutated on the undone turn
- [x] 7.4 Verify tiers (test:unit → test:fast → integration → full non-live suite) and re-run the undo playtest scenario (`tests/adventures_pt_shared/scenarios/undo_rollback.jsonl` via `tests/adventures_pt_shared/_pt_runner.py`) — both the limbo and #22 cases must flip to PASS

### Coordination notes (slice C — docs/config only)

- This slice ships the `.opencode/opencode.jsonc` playtest sandbox `environment` block (mirrors `.mcp.json`: `SAVE_DIR=game/playtest/adventures`, `MOCK_LLM=0` as literals) plus `engine/ARCHITECTURE.md`, `tests/ARCHITECTURE.md`, and this tracking doc.
- Functional undo/barter work is owned by the parallel forks (Fork A: undo, Fork B: trades). Boxes 1.1–5.2 are marked against the shared contract card; if a fork lands a narrower scope, update the corresponding box here rather than blocking.
- 6.3 is manual playtest; 6.4 tracks cross-change coordination with `validate-memory-extraction` / `close-prompt-injection-backdoor`.
