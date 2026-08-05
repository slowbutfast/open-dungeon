## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing `tests/unit/contextBlocks.test.mjs` asserting every injected block is registered with a unique header, `enabled`, and `build` (Requirement: Declarative Context Block Registration)
- [x] 1.2 Write failing test asserting the registry-composed message for a fixed state snapshot produces the byte-identical `[CURRENT STATUS]` block and overall message equal to the pre-change `buildSystemMessage` output (Requirement: Composed Narrator Context)
- [x] 1.3 Write failing tests asserting `sanitizeForHistory` strips an echoed copy of every registered block, including `[ADVENTURE SUMMARY]`, `[WORLD INFO & LORE]`, `[RECALLED MEMORIES]` (Requirements: Sanitization Derives from the Registry / Sanitization Scope Covers All Injected Blocks)
- [x] 1.4 Write failing test asserting gating: a block with a false `enabled` predicate is excluded, and `[RECALLED MEMORIES]` is absent when RAG returns nothing
- [x] 1.5 Write failing test asserting the status-line shape regex still strips `[Status: ...]` lines independently of the block registry (Requirement: Unchanged Status-Line Contract)

## 2. Registry Module

- [x] 2.1 Create `engine/contextBlocks.js` exporting `CONTEXT_BLOCKS` with `CURRENT STATUS`, `CURRENT INVENTORY`, `ADVENTURE SUMMARY`, `WORLD INFO & LORE`, `RECALLED MEMORIES` — each with `header`, `enabled`, and `build` — preserving today's conditional inclusion and emit order
- [x] 2.2 Ensure the `CURRENT STATUS` builder emits exactly `- Location: <location>\n- Score: <score>\n- Moves: <moves>` with the same `\n\n[HEADER]\n` framing used today

## 3. Composed Narrator Context

- [x] 3.1 Rewire `LlmOrchestrator.buildSystemMessage` (`engine/llm.js:297`) to keep the `[PLAYER INPUT]` framing prefix and then iterate `CONTEXT_BLOCKS`, emitting each enabled block's header and body
- [x] 3.2 Confirm the composed system message for identical inputs is byte-identical to the pre-change output (contract tests in 1.2 green)

## 4. Sanitizer Derivation

- [x] 4.1 Refactor `sanitizeForHistory` (`engine/llm.js:137`) to derive its block strip-set from the registry headers at module load, replacing the hardcoded `[CURRENT STATUS]`/`[CURRENT INVENTORY]` alternation regex
- [x] 4.2 Preserve the existing block-strip shape logic (header line + following `- ` bullets, tolerating a `> ` role-play prefix) so prose containing only the tokens is untouched
- [x] 4.3 Keep the status-line shape regex separate and unchanged

## 5. Regression & Verification

- [x] 5.1 Run `npm run test:unit` — all new `contextBlocks.test.mjs` cases pass and no existing unit tests regress
- [x] 5.2 Run `npm run test:all` — `test_injection_defense.py`, `test_engine_status_parsing.py`, `test_shared_status_parser.py`, the MCP suites, and the frontend-literal source-text pin all stay green
- [x] 5.3 Run a live/mock narration spot-check: confirm history and save JSON contain no echoed registered-block headers, and the status strip still commits location/score/moves correctly
- [x] 5.4 Update `engine/ARCHITECTURE.md` §2/§4d to describe the block registry and derived strip-set
