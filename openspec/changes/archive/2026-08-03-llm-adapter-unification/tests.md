## Automated Tests

- **New — adapter unit seam (`tests/unit/llmAdapter.test.mjs`):**
  - `llmCall(mockClient, 'narration', { stream: true, ... })` returns an async
    iterable (`{ stream }`) and records a `'narration'` tracker call.
  - `llmCall(mockClient, 'event_extraction', ...)` returns the canned extraction
    JSON **without** the prompt containing "JSON array of objects" — proving the
    mock dispatches by intent, not prompt substring (fails today).
  - Each intent maps to its canned response: `narration` → cantina stream,
    `summarization` → "A summary of the adventure.", `card_extraction` → the
    Korr JSON, `event_extraction` → extraction JSON, `opening_scene` → the
    Tatooine text, `suggestion` → numbered options; `llmEmbed` returns a mock
    embedding vector.
  - Run via `npm run test:unit` alongside the existing seam tests.
- **Existing guards — mock-mode suite stays green** (all under `MOCK_LLM=1`):
  - `tests/test_mcp_diagnostics.py` — tracker kind labels unchanged
    ('narration', 'summarization', 'card_extraction', 'extraction', ...).
  - `tests/test_mcp_memory.py`, `tests/test_extractor_validation.py`,
    `tests/test_injection_defense.py` — mock-mode extraction fixture unchanged.
  - `tests/test_mcp_gameplay.py`, `tests/test_engine_status_parsing.py` —
    mock narration (fragmented cantina stream + trailing three-field status
    line) unchanged.
  - `tests/test_api_endpoints.py` — SSE shapes, opening-scene canned text, and
    suggestion-path behavior unchanged.
  - `tests/test_engine_status_parsing.py::TestProducersEmitCanonicalStatusLine`
    — the re-keyed mock still emits the canonical three-field status line.
  - The node-probe suites that stub `client.chat.completions.create` directly
    (`test_extractor_validation.py`, `test_engine_status_parsing.py`,
    `test_injection_defense.py`) keep passing because the adapter calls the
    passed `client` — probes are unaffected by intent tagging.

## Manual Verification

- **Real-mode byte-identity spot check:** with `MOCK_LLM=0` and a key present,
  capture the request bodies for narration, summarization, cards, extraction,
  and the opening scene before/after the refactor and diff them — they must be
  identical (no `intent` field, same messages/params, same openrouter block).
- **Prompt-edit resilience:** edit a prompt string; the mock still returns the
  same canned response for that intent (no silent mock breakage).
