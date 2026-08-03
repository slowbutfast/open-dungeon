## Source material

### Architecture deepening review, candidate #3 (2026-08-03)

"Talk to the LLM" is not one adapter — it is six independent `chat.completions.create` call sites, each building its own `messages` array, repeating the `llmTracker.startCall → call → endCall → catch → failCall` dance, and owning its own error/fallback policy:

| Call site | Purpose | Error handling |
| :--- | :--- | :--- |
| `engine/llm.js:449` | narration (primary) | model fallback + retry |
| `engine/llm.js:472` | narration (fallback model retry) | fallback |
| `engine/context.js:79` | summarization | restores `state.history` on failure |
| `engine/context.js:134` | card extraction | throws |
| `engine/memory/eventExtractor.js:197` | event extraction | swallows errors, returns empty |
| `web/routes/game.js:326` | opening scene | canned-text fallback |

This is "one adapter = hypothetical seam, two = real" taken to its extreme: there are six real adapters.

**Mock mode is the casualty.** `MOCK_LLM` is checked in many places across `engine/` with two timing models — resolved once at client construction (`llm.js`) but re-read from `process.env` at call time (`eventExtractor.js`, `memoryManager.js`, `embeddings.js`). `mockOpenAI.js` keys canned responses off prompt substrings ("JSON array of objects", "CHARACTER GENESIS", "compress the following log", "suggestion"), so a prompt edit silently changes or breaks mock behavior with no error. A test's green light depends on prompt spelling.

**Supporting duplication.** The `formatUserInput` concept exists twice: an `AdventureEngine` method (`engine/index.js:204`) that is shadowed by a local closure in the live turn path (`engine/llm.js:282`). The tracker wrap is repeated at five call sites with subtly different `kind` labels ('narration', 'summarization', 'card_extraction', 'extraction', ...). Adding a new LLM call type currently means editing the call site *and* `mockOpenAI.js`.

**Contrast:** `engine/scoring.js` demonstrates the pattern this repo rewards — a pure, unit-tested module (`test_scoring.py`, 274 lines) extracted for testability. There is no analogous deep module for the LLM wire path.

### Raised but not acted on

- **Whether `llmTracker` should become an instance owned by the engine.** Currently a module-level singleton shared across every engine in a process; flagged but not part of the adapter collapse itself.
- **Whether embeddings (`embeddings.js:89-148`) fold into the same adapter.** The two `embeddings.create` sites share the same skeleton; decided to include in this change since the tracker/error pattern is identical.
- **Prompt-keyed mock vs behavior-keyed mock.** The adapter should key mock behavior off the intent, not the prompt string. The exact mock contract is a design-phase decision.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| LLM adapter | The deep module owning request shaping, tracker wrap, retry/fallback, mock resolution | `chat.completions.create` itself |
| intent | A declarative call-site statement ("summarize these turns", "extract events") | A bespoke messages array per site |
| prompt-substring mock | Mock dispatch keyed off prompt text | Behavior-keyed mock dispatch |
| tracker wrap | The `llmTracker.startCall/endCall/failCall` bookkeeping | Session cost aggregation (a different concern) |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — no external LLM libraries beyond the OpenAI-compatible client in use) | — | — | 2026-08-03 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Single `llmCall(kind, messages, opts)` helper owning tracker + error handling | Adopt | Removes five near-identical skeleton copies; one place to add retries | 2026-08-03 |
| Full `LLMAdapter` class with intent registry | Open | More structure than strictly needed; evaluate during design | 2026-08-03 |
| Move mock into the adapter as a mode | Adopt | Kills prompt-substring fragility | 2026-08-03 |
| Keep six call sites, just share the tracker helper | Reject | Leaves prompt/error/mock policy duplicated | 2026-08-03 |

## Patterns adopted

`engine/scoring.js` + `test_scoring.py` — the pure-function-extracted-for-testability pattern already proven in this repo. The adapter should be the same kind of unit-testable module: given an intent, assert the wire call.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Six `chat.completions.create` call sites | `llm.js:449,472`; `context.js:79,134`; `eventExtractor.js:197`; `routes/game.js:326` | Code read (grep) | 2026-08-03 | stable |
| Two `embeddings.create` sites share the same skeleton | `embeddings.js:97,127` | Code read | 2026-08-03 | stable |
| `formatUserInput` exists twice | `engine/index.js:204` (shadowed) vs `engine/llm.js:282` (live closure) | Code read | 2026-08-03 | stable |
| `mockOpenAI.js` dispatches on prompt substrings | Canned responses keyed off prompt text | Code read | 2026-08-03 | stable |
| Tracker wrap repeated with driftable kinds | `startCall/endCall/failCall` at 5+ sites | Code read | 2026-08-03 | stable |
| `scoring.js` is a pure, unit-tested module | `test_scoring.py` exists (274 lines) | Code read | 2026-08-03 | stable |

## Unverified assumptions

- **That a single adapter can serve all six call sites without contorting the streaming path.** Narration is the only streaming call; the adapter must preserve generator semantics. Needs a design sketch.
- **That moving mock dispatch to intents will not break existing mock-mode test expectations.** The mock contract is exercised by ~10 test files; each canned response must be re-keyed. Cost is real, not zero.

## Superseded claims

- **"There are five LLM call sites."** Superseded by recount: six `chat.completions.create` sites (the fallback-model retry at `llm.js:472` is a distinct site).

## Links out

- `engine/llm.js:449,472` — narration + retry
- `engine/context.js:79,134` — summarize + cards
- `engine/memory/eventExtractor.js:197` — extraction
- `web/routes/game.js:326` — opening scene
- `engine/memory/embeddings.js:97,127` — embed / embedBatch
- `engine/mockOpenAI.js` — prompt-keyed mock
- `engine/index.js:204` / `engine/llm.js:282` — `formatUserInput` duplication
- `engine/llmTracker.js` — module-level singleton
- `engine/scoring.js` — the deep-module pattern to mirror
