# llm-adapter-unification — tasks

TDD-first promotion of program candidate #28. Guardrails from
`architecture-deepening-sequence/specs/refactor-program/spec.md` apply.

## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing `tests/unit/llmAdapter.test.mjs` (node:test): the
      `event_extraction` intent returns the canned extraction JSON WITHOUT the
      prompt containing "JSON array of objects" (intent-keyed dispatch — fails
      today because the mock keys off prompt substrings); `llmCall('narration',
      …, {stream: true})` returns an async iterable and records a 'narration'
      tracker call; each intent maps to its canned response; `llmEmbed` returns
      a mock vector.
- [x] 1.2 Confirm the TDD red state: `node --test tests/unit/llmAdapter.test.mjs`
      fails, and `npm run test:unit` is still 25 pass / 0 fail on the existing
      seam before implementation.

## 2. Implement the adapter

- [x] 2.1 Add `engine/llmAdapter.js` exporting `llmCall` (+ `llmEmbed` +
      `formatUserInput`): builds the request (openrouter reasoning/stream_options
      block exactly as today), tags `intent` for the mock only, wraps the tracker
      (full wrap for non-streaming; `{ stream, callId }` for narration), and
      routes mock and real through the same `client.chat.completions.create` /
      `client.embeddings.create` call.
- [x] 2.2 Route the two narration sites in `engine/llm.js` (primary + fallback
      retry) through `llmCall`, preserving the fallback-model retry, the
      `for await (chunk of stream)` loop, `recordUsage`, `endCall(cleanedText)`,
      and the error event; the retry reuses one call record via `opts.callId`.
      Replace the local `formatUserInput` closure with the shared definition.
- [x] 2.3 Route `engine/context.js` summarization and card extraction through
      `llmCall`, preserving the summary-failure history restore and the cards
      JSON salvage/commit path.
- [x] 2.4 Route `engine/memory/eventExtractor.js` extraction through `llmCall`,
      preserving error-swallow + JSON salvage; keep the mock-mode fixture
      untouched.
- [x] 2.5 Route `web/routes/game.js` opening scene through `llmCall`, preserving
      the canned-text fallback (canonical three-field status line).
- [x] 2.6 Route both `engine/memory/embeddings.js` sites through `llmEmbed`,
      preserving response validation and the mock-vector fallback.
- [x] 2.7 Consolidate `formatUserInput` to the one definition; `engine/index.js`'s
      method delegates to it.
- [x] 2.8 Re-key `engine/mockOpenAI.js` dispatch by intent (adapter sets the
      intent field; mock returns canned per intent). Preserve the fragmented
      narration stream and the canonical three-field status line.

## 3. Verification (all MOCK_LLM=1)

- [x] 3.1 `node --test tests/unit/llmAdapter.test.mjs` green; `npm run test:unit`
      all green (25 existing + new).
- [x] 3.2 Tier 1: `npm run test:fast`
- [x] 3.3 Tier 2: integration tier
      (`python3 -m pytest -m integration --ignore=tests/test_live_llm.py
      --ignore=tests/test_openrouter_models.py --ignore=tests/test_pty_integration.py
      --ignore=tests/simulate_playtest.py -q`)
- [x] 3.4 Tier 3: `python3 -m pytest tests/ -q --ignore=tests/test_cli_behavior.py
      --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py
      --ignore=tests/test_live_llm.py --ignore=tests/test_openrouter_models.py
      --deselect=tests/test_mcp_protocol.py::TestMcpProtocolCompliance::test_tool_invoke_with_missing_required_param`
      (watch test_mcp_diagnostics kinds, mock extraction/ narration suites,
      test_api_endpoints SSE + suggestion, test_engine_status_parsing mock
      fragmented stream). Fix regressions at the catching tier. Discard E2E
      screenshot rewrites (`git checkout -- tests/e2e/screenshots/`).
- [x] 3.5 Deletion test (guardrail #8): remove `llmAdapter.js` and request
      shaping (openrouter block), mock-intent dispatch, and the tracker wrap are
      unlocated across the eight call sites — reads/callers break.
- [x] 3.6 Confirm no live test ran (`test_live_llm.py`, `npm run test:all` NOT
      run) and no production data written (`game/adventures/`, `game/data/`
      untouched); update `engine/ARCHITECTURE.md` / `tests/ARCHITECTURE.md` per
      AGENTS.md.
