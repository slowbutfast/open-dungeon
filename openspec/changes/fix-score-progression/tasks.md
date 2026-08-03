## 1. Test Scaffolding (TDD)

- [ ] 1.1 Write failing tests: `scoreRule(events, priorScore)` accumulates deterministic score over typed extractor events, without double-counting duplicate milestones
- [ ] 1.2 Write failing test: a multi-turn mock session completing a quest ends with `dungeon_inspect_state.score > 0`, independent of narrator status-line wording
- [ ] 1.3 Write failing test: score round-trips through save/load (non-zero score restored)
- [ ] 1.4 Write failing test: 10+ turn session does not end with frozen `score: 0` (regression for #19)

## 2. Scoring Rule

- [ ] 2.1 Implement `engine/scoring.js` with per-type milestone weights (`discovery`/`quest`/`combat`/`trade`), deduped by distinct milestone
- [ ] 2.2 Wire score computation into the turn/commit path so it advances deterministically

## 3. Commit & Persistence

- [ ] 3.1 Commit engine-computed score through the shared status-line path (engine authoritative over narrator claim)
- [ ] 3.2 Verify score round-trips through save/load (existing serialization already includes `score`; confirm no regression)

## 4. Verification & Coordination

- [ ] 4.1 Run `python3 -m pytest tests/test_mcp_*.py tests/test_scoring.py -v` and confirm green
- [ ] 4.2 Run the non-integration suite and confirm green
- [ ] 4.3 Live check: replay the Datachip Run arc and confirm score is non-zero at lift-off
- [ ] 4.4 Coordinate with `harden-context-history-integrity` (#12) — score commits ride on the shared parser; land that first
- [ ] 4.5 Coordinate with `validate-memory-extraction` (#14) if scoring derives from extractor events — the event taxonomy must be stable
