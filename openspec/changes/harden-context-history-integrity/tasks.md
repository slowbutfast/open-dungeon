## 1. Test Scaffolding (TDD)

- [ ] 1.1 Write failing test: engine commits location/score/moves from a status line followed by trailing content (parse last status line)
- [ ] 1.2 Write failing test: fragmented buffered stream (`cantina.\n[Status:` split across chunks) commits status via shared parser
- [ ] 1.3 Write failing tests: history/save sanitization strips echoed `[CURRENT STATUS]`/`[CURRENT INVENTORY]` blocks and raw status line
- [ ] 1.4 Write failing tests: `moves` increments exactly once per turn when status line omits Moves, and matches `dungeon_inspect_state`
- [ ] 1.5 Write failing test: all five prompt definitions declare the same status-line format

## 2. Parser Unification (M2 remainder)

- [ ] 2.1 Replace the non-buffered branch regex (`engine/llm.js:433`) with the shared `parseStatusLine`
- [ ] 2.2 Replace the buffered branch regex (`engine/llm.js:418`) with the shared `parseStatusLine` fed by the accumulated buffer
- [ ] 2.3 Remove the four `moves += 1` blind fallbacks in favor of a single deterministic increment

## 3. History Sanitization (#11)

- [ ] 3.1 Implement `sanitizeForHistory(text)` stripping echoed `[CURRENT STATUS]`/`[CURRENT INVENTORY]` blocks and the raw status line
- [ ] 3.2 Apply sanitization at the main history push (`engine/llm.js:499`) and the other push sites (`:219,300,314`)
- [ ] 3.3 Ensure the sanitized text (not raw) flows to history, save file, and extraction queue; keep raw only in debug/log paths

## 4. Moves Ownership

- [ ] 4.1 Define the engine as the single owner of `moves` (increment once per turn; ignore the model's Moves field)
- [ ] 4.2 Verify mock mode (two-field status line) and real mode both produce deterministic, matching counters

## 5. Verification & Coordination

- [ ] 5.1 Run `python3 -m pytest tests/test_mcp_*.py tests/test_shared_status_parser.py -v` and confirm green
- [ ] 5.2 Run the non-integration suite (`python3 -m pytest tests/ -m "not integration" -q`) and confirm green
- [ ] 5.3 Live playtest: verify sanitized history + moves consistency (manual verification section)
- [ ] 5.4 Coordinate with `close-prompt-injection-backdoor` (#15) — this change is a dependency; confirm no overlap on the sanitize step
