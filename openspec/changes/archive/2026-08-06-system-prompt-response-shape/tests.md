## Automated Tests

- `npm run test:unit`: the new source-text pins and contract tests stay green:
  - `tests/test_engine_status_parsing.py` (extended `TestPromptContract`): `DEFAULT_SYSTEM_PROMPT` (`engine/index.js`), all four presets (`engine/storyPresets.js`), and `web/static/js/app.js` each carry the `RESPONSE SHAPE` marker and the "status line as the final line" rule — either via `${RESPONSE_SHAPE}` interpolation or the identical literal.
  - `tests/unit/statusFormat.test.mjs` (or extend the existing statusFormat probe): the `RESPONSE_SHAPE` constant exports the canonical three-example block (exploring / dialogue / simple-action), and each example's status line is the canonical three-field `STATUS_FORMAT` shape.
  - Existing contract tests stay green (status line byte-identity, composed-message equivalence, `STATUS_FORMAT` constant probe).
- `venv/bin/python -m pytest tests/ -q --ignore=<deprecated suites>`: full suite stays green (status parsing, MCP, spatial) — the prompt-text change must not regress any producer/consumer contract test.

## Manual Verification

- **Response shape is taught, not inferred:**
  - **WHEN** a fresh session is started with the default prompt and one natural turn is played against a live model
  - **THEN** the narration is in-fiction prose that ends with a canonical `[Status: ...]` line as the very last line, with no trailing question and nothing after the status line
- **Examples are present in the composed message:**
  - **WHEN** `engine.llm.buildSystemMessage(...)` is inspected for a fresh session
  - **THEN** the system content contains the `RESPONSE SHAPE` section with the exploring, dialogue, and simple-action examples
- **Tone neutrality:**
  - **WHEN** a player opens in a distinct tone (e.g. grim) and plays several turns
  - **THEN** the narrator holds the player's adopted tone, and the response-shape examples do not impose a competing default register
- **No hallucinated grounding:**
  - **WHEN** the narrator references items in its responses
  - **THEN** they are from `[CURRENT INVENTORY]` or clearly present in the current scene, matching the example discipline
- **Status-line compliance check (the real measure):**
  - **WHEN** one natural live session runs on the default model before and after this change
  - **THEN** the fraction of turns with a usable, final status line does not regress, and the map keeps growing via the recovery backstop
