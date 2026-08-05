## Why

The narrator's system prompt is composed by ad-hoc `systemContent +=` appends in `buildSystemMessage` (`engine/llm.js:297-339`), and `sanitizeForHistory` strips echoed blocks against a hardcoded regex that only covers `[CURRENT STATUS]` / `[CURRENT INVENTORY]` (`engine/llm.js:156`). Every injected block is therefore a two-place edit (composition + sanitizer) and a fresh prompt-injection surface if the sanitizer is forgotten. Three blocks already leak today: `[ADVENTURE SUMMARY]`, `[WORLD INFO & LORE]`, and `[RECALLED MEMORIES]` are injected but not strip-eligible, so an echoed copy reaches history. The follow-up spatial-map feature needs new injected blocks; landing the structure first keeps that feature focused on the graph instead of the prompt plumbing.

## What Changes

- **Introduce a context block registry** (`engine/contextBlocks.js`) as the single source of truth for narrator context: each block declares its header, an `enabled(state, turnContext)` gate, and a `build(state, turnContext)` that returns the block body.
- **`buildSystemMessage` becomes a thin composition** over the registry — iterate enabled blocks, emit header + body. The `[CURRENT STATUS]` block renders **byte-identically** to today's text (pinned contract).
- **`sanitizeForHistory` derives its strip-set from the registry headers** instead of a hardcoded alternation. This is the coupling fix: adding a block can never again leave a stripping gap.
- **Close the existing leaks**: `[ADVENTURE SUMMARY]`, `[WORLD INFO & LORE]`, `[RECALLED MEMORIES]` join the strip-set, so echoes of any injected block are removed from history, the save file, and the extraction queue — the same scope `Sanitized History Commit` already mandates for the CURRENT blocks.
- **Gating stays declarative**: blocks are only included when their predicate passes (e.g., `[RECALLED MEMORIES]` only when RAG returned rows), keeping prompts smaller and summarization pressure down.
- **No change** to `STATUS_FORMAT`, the status-line shape regex, the two-field mock line, or the frontend status literal.

## Capabilities

### New Capabilities
- `narrator-context`: declarative composition of narrator prompt blocks and single-source sanitization — every injected block is registered once and automatically strip-eligible.

### Modified Capabilities
- `game-engine`: modify `Sanitized History Commit` so the sanitization scope covers **all** injected context blocks (derived from the registry), not only `[CURRENT STATUS]` / `[CURRENT INVENTORY]`.

## Impact

- `engine/contextBlocks.js` — new module (the registry).
- `engine/llm.js` — `buildSystemMessage` (composition over registry) and `sanitizeForHistory` (strip-set derived from registry headers).
- `engine/context.js` — unchanged; its summary path already calls `sanitizeForHistory` and inherits the widened strip-set.
- `web/routes/game.js` — unchanged; opening-scene sanitize inherits the widened strip-set.
- `engine/mockOpenAI.js` — unchanged; it emits status lines, not context blocks.
- `web/static/js/app.js` — the frontend default prompt literal is **not** changed (pinned by source-text test); the block registry only governs engine-side composition/sanitization.
- Tests: contract test that `[CURRENT STATUS]` renders byte-identically; new tests that every registered header is strip-eligible and that the three formerly-leaking blocks are now stripped when echoed; full `test_injection_defense.py` regression must stay green.
- No new dependencies.
