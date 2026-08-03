## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing tests: `scoreRule(events, priorScore)` accumulates deterministic score over typed extractor events, without double-counting duplicate milestones
- [x] 1.2 Write failing test: a multi-turn mock session completing a quest ends with `dungeon_inspect_state.score > 0`, independent of narrator status-line wording
- [x] 1.3 Write failing test: score round-trips through save/load (non-zero score restored)
- [x] 1.4 Write failing test: 10+ turn session does not end with frozen `score: 0` (regression for #19)

## 2. Scoring Rule

- [x] 2.1 Implement `engine/scoring.js` with per-type milestone weights (`discovery`/`quest`/`combat`/`trade`), deduped by distinct milestone
- [x] 2.2 Wire score computation into the turn/commit path so it advances deterministically

## 3. Commit & Persistence

- [x] 3.1 Commit engine-computed score through the shared status-line path (engine authoritative over narrator claim)
- [x] 3.2 Verify score round-trips through save/load (existing serialization already includes `score`; confirm no regression)

## 4. Verification & Coordination

- [x] 4.1 Run `python3 -m pytest tests/test_mcp_*.py tests/test_scoring.py -v` and confirm green
- [x] 4.2 Run the non-integration suite and confirm green
- [x] 4.3 Live check: replay the Datachip Run arc and confirm score is non-zero at lift-off (mock-mode regression test `test_score_not_frozen_after_ten_turns` passes in its place; a live-LLM replay needs a human/real LLM)
- [x] 4.4 Coordinate with `harden-context-history-integrity` (#12) — score commits ride on the shared parser; land that first
- [x] 4.5 Coordinate with `validate-memory-extraction` (#14) if scoring derives from extractor events — the event taxonomy must be stable (note only: taxonomy keyed on the four milestone types in `engine/scoring.js`; #14 not landed, so no cross-change work done here)
