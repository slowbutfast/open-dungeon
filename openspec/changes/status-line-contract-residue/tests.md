## Automated Tests

- **New — producer contract (source-text):** `tests/test_engine_status_parsing.py`
  gains `TestProducersEmitCanonicalStatusLine`, which scans
  `engine/mockOpenAI.js` and `web/routes/game.js` and asserts every
  `[Status: ...]` literal in each file matches the canonical three-field shape
  `\[Status:\s*.*\|\s*Score:\s*\d+\s*\|\s*Moves:\s*\d+\s*\]`. Red before the
  implementation (both files carry two-field literals today).
- **New — frontend contract (source-text):** `TestFrontendConsumersUseCanonicalStatusLine`
  asserts `web/static/js/ui/renderers.js` status-strip regexes all contain
  `Moves` (three-field), and `web/static/js/app.js` declares the exact
  `STATUS_FORMAT` literal. Red before the implementation.
- **New — constant probe:** `TestStatusFormatConstant` imports
  `engine/statusFormat.js` via a Node subprocess probe and asserts
  `STATUS_FORMAT` equals the canonical three-field literal. Red before the
  module exists (probe import fails).
- **Extended — prompt contract:** `TestPromptContract` keeps asserting the
  literal appears in all five prompt definitions (default + 4 presets) by
  resolving the `${STATUS_FORMAT}` interpolation exactly as the modules do, and
  gains `test_prompts_reference_shared_status_format_constant` pinning that the
  source references `${STATUS_FORMAT}`. The new reference test is red before the
  prompts reference the constant.
- **Existing guards (unchanged):** `TestEngineBufferedFragmentCommit` (two-field
  fragmented stream still commits via the parser's tolerance),
  `test_shared_status_parser.py` `mock_two_field`, and the forged-status guard
  tests are untouched — the parser/sanitizer behavior is locked.
- **Mock/real parity:** the mock-mode suite (`npm run test:fast`, the
  integration tier, and the full `tests/` run) stays green under `MOCK_LLM=1`
  after the mock's canned narration becomes three-field; `dungeon_send_action`
  and `dungeon_inspect_state` still agree on location/score/moves.

## Manual Verification

- **Web init in mock mode:** start `MOCK_LLM=1 SAVE_DIR=tests/<sandbox> node
  web/server.js`, start a game with the default prompt, take a turn, and confirm
  the console log shows the sanitized narration only — no `[Status: ... | Score:
  ... | Moves: ...]` line renders, and the status panel shows the committed
  location/score/moves.
- **Custom preset flow:** open "Customize Story" and confirm the default
  custom-prompt textarea contains the three-field
  `[Status: <Location Name> | Score: <Current Score> | Moves: <Moves>]` line.
- **Preset persistence:** load the four presets and confirm their prompts still
  carry the exact three-field format (the interpolation resolves to the literal).
