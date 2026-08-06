## Why

Live playtests showed the narrator drops, truncates, or mangles the status line on most turns despite the mandate, and the existing prompt examples teach only the status *format*, not the full turn anatomy. Models imitate examples more reliably than prose rules, so the prompt should carry complete-turn examples — prose + status line as the final line — so the narrator stops inferring the shape and producing off-shape, hallucinated responses.

## What Changes

- Add a **`RESPONSE SHAPE`** section to the narrator system prompt (default prompt, all four presets, and the zero-build web frontend literal) containing three tone-neutral, complete-turn examples covering the response types: exploring a new place, dialogue, and a simple action.
- Each example demonstrates the full response anatomy: in-fiction second-person prose, no text written for the player, no trailing questions, and the canonical status line as the **very last line** with nothing after it.
- The examples keep the Location field consistent with the prose (advance on movement, repeat when nothing moved), and keep item/scene references grounded to avoid teaching hallucination.
- Introduce `RESPONSE_SHAPE` as a single shared constant (beside `STATUS_FORMAT`) so all five prompt producers derive the same text; the web frontend inlines the identical literal.
- **Replaces** the three existing Zork examples (`open mailbox` / `take leaflet` / `go north`) to avoid duplicating the format teaching. **BREAKING** for the prompt text only (no data, no engine logic).

## Capabilities

### New Capabilities
- `narrator-response-shape`: the narrator system prompt carries complete-turn examples that fix the expected response anatomy (prose + trailing status line, grounded, no trailing questions) so the narrator emits well-formed turns without inferring the shape.

### Modified Capabilities
- `game-engine`: the `Generate Response Stream` requirement gains the response-shape exemplar in the prompt contract (the status line MUST be the final line; complete-turn examples are provided).
- `narrator-fidelity`: the status-line fidelity requirement notes the prompt now includes complete-turn examples that reinforce the mandate.

## Impact

- `engine/statusFormat.js` — add `RESPONSE_SHAPE` constant.
- `engine/index.js` — `DEFAULT_SYSTEM_PROMPT` interpolates `${RESPONSE_SHAPE}` (replacing the three inline examples).
- `engine/storyPresets.js` — the four preset prompts interpolate `${RESPONSE_SHAPE}`.
- `web/static/js/app.js` — the zero-build default prompt literal inlines the identical text.
- `tests/test_engine_status_parsing.py` — source-text pins assert all five producers carry the `RESPONSE SHAPE` marker and the "final line" rule.
- No new dependencies; no engine-logic change.
