## Why

The engine commit path is unified on the canonical three-field status line
`[Status: <Location Name> | Score: <Current Score> | Moves: <Moves>]`
(`harden-context-history-integrity` + `fix-score-progression` landed), but the
producers/consumers OUTSIDE `engine/llm.js` still carry the two-field variant
or duplicated contract text, so the format still does not have one parser AND
one producer:

1. **Frontend strip is non-canonical.** `web/static/js/ui/renderers.js:49`
   strips with a two-field regex `/\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\]$/m`
   that doesn't know `Moves` exists — the last consumer that can disagree with
   what the engine committed (the engine keeps a three-field line; the browser
   would render its `Score:` half if the format ever drifts).
2. **Producers emit the two-field variant.** `engine/mockOpenAI.js:51,57,85`
   and the fallback opening scene `web/routes/game.js:349` emit
   `[Status: X | Score: N]` — not the canonical line every prompt declares. The
   parser tolerates a missing `Moves`, which is exactly why the drift is
   invisible: mock mode passes while real mode declares three fields.
3. **The contract string is duplicated.** The format text lives in all four
   presets (`engine/storyPresets.js`), `DEFAULT_SYSTEM_PROMPT`
   (`engine/index.js`), and the frontend default custom-prompt textarea
   (`web/static/js/app.js:148`). Any single edit without the others is a silent
   drift.

The deletion test confirms this is a real deepening target: delete the shared
`STATUS_FORMAT` constant and every producing site reverts to its own copy of
the contract string with no single owner left to keep them in agreement.

## What Changes

- **Introduce one shared `STATUS_FORMAT` constant** (`engine/statusFormat.js`)
  exporting the canonical three-field line. This is the single definition of
  the status-line contract (prerequisite for #28's LLM-adapter work).
- **Prompts reference the constant.** `DEFAULT_SYSTEM_PROMPT`
  (`engine/index.js`) and the four presets (`engine/storyPresets.js`)
  interpolate `${STATUS_FORMAT}` into the composed prompt text, so the literal
  still appears in the final prompt but is owned by one definition.
- **Producers emit the canonical line.** `engine/mockOpenAI.js` (all 3 canned
  sites) and the fallback opening scene `web/routes/game.js:349` emit the
  three-field `[Status: Cantina | Score: 5 | Moves: 0]` / `[Status: Starting
  Location | Score: 0 | Moves: 0]` lines.
- **The frontend strip knows `Moves`.** `web/static/js/ui/renderers.js` match
  and replace regexes become the canonical three-field shape.
- **The frontend default prompt matches.** `web/static/js/app.js:148` declares
  the identical three-field literal (the frontend is zero-build native ESM and
  cannot import from `engine/`; agreement is tested by source-text, mirroring
  the presets test).
- **MCP re-parse stays.** `mcp/tools/gameplay.js:66` re-parses the already
  sanitized narration and is now vestigial, but #26's "turn returns committed
  metrics" did NOT land, so it stays as the fallback path. NOT removed.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `game-engine`: modify `Generate Response Stream` (the status-line format is
  produced by one shared `STATUS_FORMAT` constant; producers emit the canonical
  three-field line; the frontend strip matches the same shape).

## Impact

- `engine/statusFormat.js` — NEW: exports `STATUS_FORMAT`, the canonical
  three-field status-line literal.
- `engine/index.js` — `DEFAULT_SYSTEM_PROMPT` interpolates `${STATUS_FORMAT}`.
- `engine/storyPresets.js` — the four preset `system_prompt` strings interpolate
  `${STATUS_FORMAT}`.
- `engine/mockOpenAI.js` — 3 canned narration sites emit the three-field line.
- `web/routes/game.js` — fallback opening scene emits the three-field line.
- `web/static/js/ui/renderers.js` — status strip regexes match the three-field
  shape.
- `web/static/js/app.js` — default custom-prompt textarea declares the
  three-field literal.
- `mcp/tools/gameplay.js` — untouched (vestigial re-parse retained).
- Tests: `tests/test_engine_status_parsing.py` source-text contract tests pin
  every producer/consumer to the canonical format.
- No behavior change to the shared parser or sanitizer; no new dependencies.
