## 1. Test Scaffolding (TDD)

- [ ] 1.1 Write failing tests: blank/whitespace-only `dungeon_send_action` errors with no LLM call and no history turn
- [ ] 1.2 Write failing tests: `dungeon_get_debug_info` is scoped to the current adventure (new session shows no prior calls/cost/logs)
- [ ] 1.3 Write failing tests: session cost includes extraction/summarization/embedding token usage (or is honestly labeled)

## 2. Input Validation

- [ ] 2.1 Reject empty/whitespace-only action text in `dungeon_send_action` before request build (error, no LLM call, no history push)
- [ ] 2.2 Mirror the check in the engine's `formatUserInput` (or entry point) so non-MCP callers are covered too

## 3. Tracker Scoping

- [ ] 3.1 Add per-adventure scoping to `llmTracker` (`setAdventure(id)` / `reset()`), applied on `newAdventure` and `load`
- [ ] 3.2 Make `getCalls`/`getSessionCost`/`getDebugLogs` read the current scope
- [ ] 3.3 Scope or reset `debug_logs` the same way

## 4. Cost Accounting

- [ ] 4.1 Capture token usage in `eventExtractor.extractEvents` (extraction)
- [ ] 4.2 Capture token usage in `context.summarizeOldTurns` (summarization)
- [ ] 4.3 Capture token usage in `embeddings` calls (embedding / embedding_batch)
- [ ] 4.4 If usage capture proves unreliable, relabel/break out the report by call type instead

## 5. Verification & Coordination

- [ ] 5.1 Run `python3 -m pytest tests/test_mcp_*.py -v` and confirm green
- [ ] 5.2 Run the non-integration suite and confirm green
- [ ] 5.3 Live check: blank action rejected; debug info session-scoped; cost includes non-narration calls (manual verification section)
- [ ] 5.4 Coordinate with `harden-context-history-integrity` (#12) on the mock two-field status line (`engine/mockOpenAI.js`) — align when the parser lands; note this change is otherwise independent
