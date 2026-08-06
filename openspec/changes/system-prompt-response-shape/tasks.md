## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing source-text pins asserting `DEFAULT_SYSTEM_PROMPT` (`engine/index.js`), the four presets (`engine/storyPresets.js`), and `web/static/js/app.js` each carry the `RESPONSE SHAPE` marker and the "status line as the final line" rule (Requirement: Complete-Turn Response Examples)
- [x] 1.2 Write failing tests asserting `RESPONSE_SHAPE` exports the canonical three-example block (exploring / dialogue / simple-action) and each example's status line matches the canonical three-field `STATUS_FORMAT` shape (Requirement: Complete-Turn Response Examples)

## 2. Shared Constant

- [x] 2.1 Add the `RESPONSE_SHAPE` constant (three tone-neutral complete-turn examples + the intro rule) to `engine/statusFormat.js` beside `STATUS_FORMAT`
- [x] 2.2 Interpolate `${RESPONSE_SHAPE}` into `DEFAULT_SYSTEM_PROMPT` (`engine/index.js`), replacing the three inline Zork examples
- [x] 2.3 Interpolate `${RESPONSE_SHAPE}` into the four story presets (`engine/storyPresets.js`), replacing their inline examples

## 3. Frontend + Pins

- [x] 3.1 Update the zero-build frontend default prompt literal (`web/static/js/app.js`) to the identical `RESPONSE SHAPE` text (keeps the source-text pins green)
- [x] 3.2 Confirm the source-text pin tests pass and every producer still references `STATUS_FORMAT` + `RESPONSE_SHAPE` consistently

## 4. Regression & Verification

- [x] 4.1 Run `npm run test:unit` — new pins green, no unit regressions
- [x] 4.2 Run the pytest suite — status parsing, MCP, spatial contract tests green
- [x] 4.3 Inspect a composed system message to confirm the `RESPONSE SHAPE` section renders with all three examples
- [x] 4.4 Update `engine/ARCHITECTURE.md` (response-shape exemplar + the shared `RESPONSE_SHAPE` constant)
