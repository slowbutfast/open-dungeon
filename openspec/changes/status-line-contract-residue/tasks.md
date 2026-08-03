# status-line-contract-residue — tasks

TDD-first promotion of program candidate #32. Guardrails from
`architecture-deepening-sequence/specs/refactor-program/spec.md` apply.

## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing source-text contract tests in
      `tests/test_engine_status_parsing.py`: every `[Status: ...]` in
      `engine/mockOpenAI.js` and `web/routes/game.js` matches the canonical
      three-field shape; `renderers.js` strip regexes contain `Moves`;
      `app.js` declares the exact `STATUS_FORMAT` literal; the `STATUS_FORMAT`
      constant exists and equals the canonical string; the 5 prompt definitions
      still declare the literal AND reference the shared constant
- [x] 1.2 Confirm the TDD red state: `python3 -m pytest
      tests/test_engine_status_parsing.py -v` shows the new producer/frontend/
      constant tests failing while the existing `TestPromptContract` literal
      assertions stay green (red: 7 failed / 21 passed; green: 28 passed)

## 2. Implement the shared constant + producer alignment

- [x] 2.1 Add `engine/statusFormat.js` exporting `STATUS_FORMAT` (canonical
      three-field line)
- [x] 2.2 Wire `DEFAULT_SYSTEM_PROMPT` (`engine/index.js`) and the 4 presets
      (`engine/storyPresets.js`) to interpolate `${STATUS_FORMAT}` so the
      literal still appears in the composed prompt
- [x] 2.3 Update `engine/mockOpenAI.js` (3 sites) and the fallback opening
      scene in `web/routes/game.js` to emit the three-field line
- [x] 2.4 Update `web/static/js/ui/renderers.js` status-strip regexes to the
      canonical three-field shape and `web/static/js/app.js` default prompt to
      the exact literal
- [x] 2.5 Leave `mcp/tools/gameplay.js` re-parse and `engine/llm.js`
      parser/sanitizer/guard untouched

## 3. Verification (tiers, MOCK_LLM=1)

- [x] 3.1 `npm run test:unit` — 19 pass / 4 fail (the 4 are #27's; unchanged)
- [x] 3.2 `python3 -m pytest tests/test_engine_status_parsing.py -v` — contract
      tests green (28 passed)
- [x] 3.3 `npm run test:fast` green (38 passed)
- [x] 3.4 Integration tier green (`python3 -m pytest -m integration
      --ignore=tests/test_live_llm.py --ignore=tests/test_openrouter_models.py
      --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py
      -q` — 146 passed)
- [x] 3.5 Full suite green (`python3 -m pytest tests/ -q
      --ignore=tests/test_cli_behavior.py --ignore=tests/test_pty_integration.py
      --ignore=tests/simulate_playtest.py --ignore=tests/test_live_llm.py
      --ignore=tests/test_openrouter_models.py
      --deselect=tests/test_mcp_protocol.py::TestMcpProtocolCompliance::test_tool_invoke_with_missing_required_param`
      — 333 passed, 1 deselected)
- [x] 3.6 Update `engine/ARCHITECTURE.md` (status/parser section) and
      `tests/ARCHITECTURE.md` per AGENTS.md
