## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing tests asserting `DEFAULT_SYSTEM_PROMPT` and `web/static/js/app.js` both contain the status mandate ("Location field MUST name the new place when the player moves") and the style directive (Requirement: Status-Line Fidelity / Stable Narrator Style)
- [x] 1.2 Write failing tests for the `[NARRATOR STYLE]` block: registered, renders when a style is set, excluded when absent, strip-eligible via `sanitizeForHistory` (Requirement: Pinned Style Context)
- [x] 1.3 Write a failing mock-mode integration asserting a scripted narrator that advances its status-line location produces a growing room graph

## 2. Prompt Contract

- [x] 2.1 Add the status mandate + style directive to `DEFAULT_SYSTEM_PROMPT` (`engine/index.js`)
- [x] 2.2 Add the same mandate + directive to the four story presets (`engine/storyPresets.js`)
- [x] 2.3 Update the zero-build frontend default prompt literal (`web/static/js/app.js`) to match (keeps the source-text pin green)

## 3. Pinned Style Block

- [x] 3.1 Add `[NARRATOR STYLE]` to `engine/contextBlocks.js` (header / enabled / build) backed by a session style value
- [x] 3.2 Capture the adopted style on the opening/first turns and hold it in state (auto-detect with optional explicit override)
- [x] 3.3 Confirm the registry-derived sanitizer covers the new block (no second edit)

## 4. Regression & Verification

- [x] 4.1 Run `npm run test:unit` — new tests green, no unit regressions
- [x] 4.2 Run `npm run test:all` — full pytest suite green (status-parsing, MCP, spatial)
- [ ] 4.3 Run one live-LLM natural playtest (Wanderer) and confirm the map grows to > 3 rooms when the narrator moves the player
- [x] 4.4 Update `engine/ARCHITECTURE.md` (status mandate + style block)
