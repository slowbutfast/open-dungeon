## Automated Tests

- `npm run test:unit` — Node test runner over `tests/unit/*.test.mjs`. New `tests/unit/contextBlocks.test.mjs` verifies:
  - **Registry contract**: every injected block is registered with a header, `enabled`, and `build`; headers are unique.
  - **Byte-identical `[CURRENT STATUS]`**: composing the message for a fixed state snapshot produces exactly the pre-change `[CURRENT STATUS]\n- Location: …\n- Score: …\n- Moves: …` block.
  - **Composed message equivalence**: for a fixed state + inventory + cards + RAG snapshot, the registry-composed message equals the pre-change `buildSystemMessage` output (regression guard against accidental reordering/framing drift).
  - **Gating**: blocks with a false `enabled` predicate are excluded; `[RECALLED MEMORIES]` is absent when RAG returns nothing.
  - **Derived strip-set**: `sanitizeForHistory` strips an echoed copy of every registered block (header + `- ` bullets), including `[ADVENTURE SUMMARY]`, `[WORLD INFO & LORE]`, and `[RECALLED MEMORIES]` — the formerly-leaking three.
  - **Unchanged status-line handling**: a `[Status: …]` line is still stripped by the status-line shape regex independent of the registry.
- `npm run test:all` — full pytest suite must stay green, with special attention to:
  - `tests/test_injection_defense.py` — the prompt-injection defense regression gate; the sanitizer refactor must not open a backdoor.
  - `tests/test_engine_status_parsing.py`, `tests/test_shared_status_parser.py` — status-line contract preserved.
  - `tests/test_mcp_*.py` — MCP surface unaffected (narration sanitized the same way).
  - The source-text pin asserting the frontend default prompt literal (`web/static/js/app.js`) — must remain unchanged and passing.
- Mock-mode parity check (covered by `test:all` in MOCK_LLM mode): the mock narrator emits status lines, never context blocks, so mock sessions produce identical history to before.

## Manual Verification

- **Live narration echo test**:
  - **WHEN** a real/OpenRouter session's narrator echoes a `[WORLD INFO & LORE]` or `[RECALLED MEMORIES]` block into its narration
  - **THEN** the rendered history and the save JSON contain no `[WORLD INFO & LORE]` / `[RECALLED MEMORIES]` header lines, and the status strip still shows the correct committed location/score/moves
- **Context composition spot-check**:
  - **WHEN** inspecting a `GET /api/debug/info` LLM call trace or the composed system message for a turn with inventory, cards, summary, and RAG all non-empty
  - **THEN** the message contains `[CURRENT STATUS]`, `[CURRENT INVENTORY]`, `[ADVENTURE SUMMARY]`, `[WORLD INFO & LORE]`, `[RECALLED MEMORIES]` in that order, each with its body
