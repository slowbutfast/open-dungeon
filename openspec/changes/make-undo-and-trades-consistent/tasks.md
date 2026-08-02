## 1. Test Scaffolding (TDD)

- [ ] 1.1 Write failing tests: undo removes store events/inventory rows + vectors for the reverted turn, rewinds watermark, decrements moves
- [ ] 1.2 Write failing test: `dungeon_search_memories` does not recall an undone turn
- [ ] 1.3 Write failing tests: narrated trade releases the sold item (not held) and re-trading fails possession (duplicate-sale regression)
- [ ] 1.4 Write failing tests: narrated trade offer appears in `dungeon_inspect_offers` and `dungeon_execute_trade` succeeds; narrated goal appears in `dungeon_inspect_goals` and can be completed
- [ ] 1.5 Write failing test: extraction expresses item removal (trade resolves both sides deterministically)

## 2. Transactional Undo

- [ ] 2.1 Implement `memoryManager.rollbackTurns(turnIndex)` removing store rows + vector ids for undone turns and rewinding the watermark
- [ ] 2.2 Wire rollback into `engine.undo` after history revert; decrement `moves`
- [ ] 2.3 Await any pending flush before rollback (race handling)

## 3. Narrated Trade Resolution

- [ ] 3.1 Route classified narrated trades through `barterEngine.executeBarter` (possession check + atomic swap)
- [ ] 3.2 Add `traded` (removal) to the extractor's `inventory_changes[].action` and resolve both sides
- [ ] 3.3 Ensure a refused/ambiguous narrated trade returns a refusal, not a crash

## 4. Offer & Goal Creation from Narration

- [ ] 4.1 Extend the extractor output schema with `offers` and `goals`
- [ ] 4.2 Wire extraction output to `barterEngine.registerOffer` and `createGoal`
- [ ] 4.3 Validate offer/goal extraction output (ties to `validate-memory-extraction`)

## 5. Name Normalization

- [ ] 5.1 Implement the shared canonical-name matching helper
- [ ] 5.2 Use it in `executeBarter` name lookups and extraction writes (coordinate with `validate-memory-extraction`)

## 6. Verification & Coordination

- [ ] 6.1 Run `python3 -m pytest tests/test_mcp_*.py tests/test_barter_engine.py -v` and confirm green
- [ ] 6.2 Run the non-integration suite and confirm green
- [ ] 6.3 Live playtest: undo consistency, narrated trade + offers, quest goals from narration (manual verification section)
- [ ] 6.4 Coordinate name normalization with `validate-memory-extraction`; coordinate extraction-schema changes with `close-prompt-injection-backdoor` (#15) verification
