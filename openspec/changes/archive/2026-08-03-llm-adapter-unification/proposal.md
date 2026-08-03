## Why

"Talk to the LLM" is six independent `chat.completions.create` call sites
(`engine/llm.js:449,472` narration + fallback retry, `engine/context.js:79,134`
summarize + cards, `engine/memory/eventExtractor.js:197` extraction,
`web/routes/game.js:326` opening scene) and two `embeddings.create` sites
(`engine/memory/embeddings.js:97,127`), each repeating the
`llmTracker.startCall → call → endCall/failCall` dance and owning its own
error/fallback policy. The openrouter `reasoning` / `stream_options` block is
duplicated across both narration sites.

Mock mode is the casualty. `mockOpenAI.js` keys canned responses off prompt
substrings ("JSON array of objects", "CHARACTER GENESIS", "compress the
following log", "suggestion"), so a prompt edit silently changes or breaks mock
behavior with no error. `formatUserInput` exists twice: an `AdventureEngine`
method (`engine/index.js:204`) shadowed by a local closure in the live turn path
(`engine/llm.js:342`).

The deletion test confirms this is a real deepening target: delete the adapter
and the request-shaping (openrouter block), mock-intent dispatch, and tracker
wrap are unlocated across eight call sites — reads/callers break rather than
complexity merely moving.

## What Changes

- **One `engine/llmAdapter.js` deep module** exporting `llmCall(client, kind,
  opts)` and `llmEmbed(client, kind, opts)`:
  - Builds the request body in one place, including the openrouter
    `reasoning = { effort }` / `stream_options = { include_usage: true }` block
    exactly as today (real-mode bodies byte-identical).
  - Tags the request with an `intent` field **in mock mode only**, so the mock
    dispatches by intent while the real request body is untouched.
  - Wraps the tracker (`startCall`/`endCall`/`failCall`) for the non-streaming
    chat sites and both embedding sites.
  - Returns `{ stream, callId }` for streaming (`narration`) so
    `generateResponseStream` keeps its `for await (chunk of stream)` generator
    semantics; the narration caller owns the semantic end (sanitized text +
    `recordUsage` + error event) and the fallback-model retry reuses one call
    record.
  - One `client.chat.completions.create` code path for mock and real — mock mode
    is a request tag, not a second call site.
- **`engine/mockOpenAI.js` re-keyed by intent.** `create(options)` reads
  `options.intent` and returns the per-intent canned response; prompt-substring
  dispatch is deleted. Narration keeps the fragmented streaming generator.
- **`formatUserInput` consolidated** to one exported definition in
  `engine/llmAdapter.js`, used by `engine/llm.js`'s live turn path and
  `engine/index.js`'s method.
- **Six call sites + two embedding sites routed through the adapter, each
  behavior preserved:** narration fallback-model retry (llm.js), summary-failure
  history restore (context.js), error-swallow + JSON salvage (eventExtractor.js),
  canned-text fallback (web/routes/game.js opening scene), mock-vector fallback
  (embeddings.js). The `EventExtractor`'s deterministic mock-mode fixture
  (history-text-keyed extraction) is kept — it predates the adapter and the
  mock-mode suite depends on it.

## Capabilities

### New Capabilities
- `game-engine`: a single LLM call adapter owning request shaping, mock-intent
  dispatch, and the tracker wrap.

### Modified Capabilities
- `game-engine`: `Generate Response Stream` now routes narration through the
  adapter; request bodies and streaming semantics are unchanged.

## Impact

- `engine/llmAdapter.js` — new deep module (`llmCall`, `llmEmbed`,
  `formatUserInput`).
- `engine/mockOpenAI.js` — intent-keyed dispatch; canned responses per intent.
- `engine/llm.js` — narration + fallback retry via `llmCall`; shared
  `formatUserInput`.
- `engine/context.js` — summarize + cards via `llmCall`.
- `engine/memory/eventExtractor.js` — real-path extraction via `llmCall`;
  mock fixture untouched.
- `engine/memory/embeddings.js` — embed/embedBatch via `llmEmbed`.
- `web/routes/game.js` — opening scene via `llmCall`.
- `engine/index.js` — `formatUserInput` method delegates to the shared
  definition.
- `tests/unit/llmAdapter.test.mjs` — new unit seam tests (intent-keyed mock,
  streaming narration, tracker kind).
- No new dependencies; tracker kind labels unchanged
  ('narration', 'summarization', 'card_extraction', 'extraction',
  'opening_scene', 'embedding', 'embedding_batch').
