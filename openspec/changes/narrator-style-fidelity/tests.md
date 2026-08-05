## Automated Tests

- `npm run test:unit` — Node test runner over `tests/unit/*.test.mjs`:
  - New `tests/unit/contextBlocks.style.test.mjs` (or extend `contextBlocks.test.mjs`): the `[NARRATOR STYLE]` block is registered with a header/enabled/build; when a style is set it renders; when absent it's excluded; an echoed copy is stripped by `sanitizeForHistory`.
  - New `tests/unit/narrationBudget.test.mjs`: `computeNarrationBudget` leaves movement verbs uncapped, floors simple actions at `SIMPLE_ACTION_MIN_TOKENS` (status line must always fit), and `sanitizeForHistory` strips a truncated `[Status:` fragment.
  - The source-text pin for the default prompt literal: `DEFAULT_SYSTEM_PROMPT` and `web/static/js/app.js` both contain the status mandate ("Location field MUST name the new place") and the style directive — a source-text test asserts the pinned agreement (extend the existing pin test).
  - Existing contract tests stay green (status line byte-identity, composed-message equivalence).
- `npm run test:all` — full pytest suite stays green:
  - `tests/test_shared_status_parser.py` — status-line contract unchanged.
  - `tests/test_engine_status_parsing.py`, `tests/test_mcp_*.py` — no regressions.
  - A new mock-mode integration (like `spatialIntegration.test.mjs`): a scripted narrator that advances the status-line location each turn produces a growing room graph (guards against regression of the fixed mandate).
- **Natural-playtest regression (the acceptance gate):** run one live-LLM natural session (the Wanderer scenario) after the change; assert the map grows to > 3 rooms when the narrator moves the player (vs 1–3 before). This is the direct measure of the fix.

## Manual Verification

- **Live natural playtest:**
  - **WHEN** a player explores several distinct places naturally against the live model
  - **THEN** `/api/map` shows a room per distinct narrated place (map grows), backtracking resolves to the same nodes, and the status line's Location tracks the narration
- **Style consistency:**
  - **WHEN** a player opens in a distinct tone (e.g. whimsical) and plays ~8 turns
  - **THEN** the narrator holds that tone across turns and the `[NARRATOR STYLE]` block (visible via debug/inspect) does not change
- **Sanitizer:**
  - **WHEN** the narrator echoes a `[NARRATOR STYLE]` block
  - **THEN** history and the save file contain no echoed header
