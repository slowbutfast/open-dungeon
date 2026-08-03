# Architecture Deepening Sequence — tests

## Automated Tests

This change itself ships no runtime code, so its verification is the unit seam it
introduces plus the tiered suite every promoted candidate must pass. All commands
run from the repo root under `MOCK_LLM=1` (never a real model unless the check is
explicitly live).

- **Unit seam (guardrail #4)** — `node:test` harness for `StructuredStore`,
  `VectorStore`, `BarterEngine`, `MemoryManager`, and the turn-commit path, backed
  by a `:memory:`/file-backed store so internals are tested at module level:
  - `node --test tests/unit/` (or the seam's documented invocation).
  - The seam's own failing tests are observed to fail before implementation and
    pass after (TDD-first, guardrail #1).
- **Tier order (guardrail #7)** — every promoted candidate runs, in order:
  1. `npm run test:fast` (`python3 -m pytest -m unit`)
  2. Integration tier (`python3 -m pytest -m integration --ignore=tests/test_live_llm.py`)
  3. `npm run test:all` (full non-deprecated suite under `MOCK_LLM=1`)
  4. `npm run test:e2e` (`python3 -m pytest -m e2e`)
  - A regression is fixed at the tier that caught it before moving on.
- **Wire-contract guards (guardrail #2)** — the existing tests that lock the
  contracts and must stay green after every refactor:
  - `tests/test_shared_status_parser.py` — single shared status parser.
  - `tests/test_engine_status_parsing.py` — engine commit path, sanitization,
    single-owner moves, five-prompt contract.
  - `tests/test_mcp_protocol.py` — 18-tool MCP surface (names + schemas).
  - `tests/test_api_endpoints.py` — raw `"data: {...}"` SSE framing + event types.
  - `tests/test_undo_consistency.py`, `tests/test_trade_goals_consistency.py` —
    undo/watermark/barter contracts.
- **Mock/real parity (guardrail #3)** — after any prompt/mock/call-shape change:
  - Re-run the mock-mode suite above (mock dispatch re-keyed by intent).
  - `tests/test_live_llm.py` — manual, requires `OPENROUTER_API_KEY`; run only
    when a real-model check is acceptable.
- **Per-candidate tests** — each promoted candidate adds its own tests per its
  change's `tests.md`; this file is the program-level floor, not the ceiling.

## Manual Verification

- **Deletion test on own work (guardrail #8):** for every module/abstraction a
  refactor introduces, temporarily delete it and confirm reads/callers break
  (complexity is concentrated, not moved) before keeping it.
- **Byte-for-byte contract spot check:** after a refactor of the narration or MCP
  path, capture one SSE frame (`{"type":"chunk","content":...}`) and one MCP
  `tools/list` payload and diff against the pre-refactor shape.
- **Env isolation spot check (guardrail #6):** confirm `SAVE_DIR` derivation,
  the port-conflict guard, and `tests/conftest.py` are byte-identical before and
  after a candidate lands.
- **Live freshness check (#26):** play several turns, confirm
  `dungeon_send_action` and `/api/state` (or `dungeon_inspect_state`) agree on
  score/location/moves without any caller-owned flush.
