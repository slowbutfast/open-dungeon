## Source material

Conversation (2026-08-04, explore-mode whiteboarding with the peer engineer):

- "we might need harden/optimize [the architecture of how the llm/narrator itself can ask for
  specific state, inventory, or location stores] as we build new features."
- "it might be useful to look into the underlying architecture in how the llm/narrator itself
  can ask for specific state, inventory, or location stores."
- Prior exploration established that the spatial-map feature (a follow-up change,
  `spatial-map-region-graph`) needs to inject a new prompt block (`[MAP CONTEXT]`-style) and a
  re-entry anchor block, and that every new prompt block is "a new injection surface" that must
  be added to the sanitizer's strip-set. The decision was made to land the block composition +
  sanitizer sync as a **prerequisite change** so the feature change stays focused on the graph
  itself.
- Requirement repeated by the peer: "the `[CURRENT STATUS]` block must render byte-identically"
  (pinned by the status-line contract); and "don't rebuild [the read-through freshness ceremony]
  per-tool."

### Raised but not acted on

- **Session versioning in adventure IDs** (`v2-<uuid>`): raised and decided to be left out — not
  needed for this change, planned as a separate future change.
- **Fuzzy/vector name matching** for room reconciliation: explicitly deferred to the follow-up
  feature's phase 2; this change does not touch room matching at all.
- **Undo location restore**: a real pre-existing gap (`engine/index.js` undo never restores
  `state.location`), but the mechanism belongs to the spatial-map change, not this one. Not
  addressed here.
- **Retrofitting `events.location` / `inventory.acquired_at` to room ids**: explicitly out of
  scope everywhere; these remain free-form names.
- **Reverse edge inference, time edges, portal classification**: spatial-map feature details,
  not this change.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Context block | A named, bracketed section of the narrator's system prompt (e.g. `[CURRENT STATUS]`) | A status line (`[Status: ... \| Score: ...]`); the two are parsed/stripped by different machinery |
| Block registry | A single declarative list of context blocks that both builds the prompt and derives the sanitizer strip-set | The `[CURRENT STATUS]` text itself |
| Strip-set | The set of block headers `sanitizeForHistory` removes when echoed back | The status-line shape regex |
| Inject | To place narrator context into the system message sent to the LLM | The extraction of memory/events (the reverse direction) |
| The narrator's state channel | The one-way pipeline: engine composes prompt blocks → LLM narrates → engine parses the status line → engine commits state | A bidirectional channel; the narrator cannot "ask" the engine for anything |
| `STATUS_FORMAT` | The canonical three-field status-line format defined once in `engine/statusFormat.js` | A context block |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none external — this change restructures existing in-repo seams) | | | |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| A new templating package (e.g. handlebars, ejs) | Rejected | Adds a dependency to restructure ~40 lines of string composition; the block shape is simple enough for a plain module | 2026-08-04 |
| A new injection library / prompt-engineering framework | Rejected | The codebase is dependency-light by design (zero-build frontend, vanilla JS engine) | 2026-08-04 |
| A plain `engine/contextBlocks.js` module exporting a block array | Adopted | Matches house style (`statusFormat.js`, `itemNames.js` as single-source modules); testable without a framework | 2026-08-04 |

## Patterns adopted

- **Single source of truth module** — the same pattern as `engine/statusFormat.js` (one
  canonical `STATUS_FORMAT` consumed by every producer) and `engine/memory/itemNames.js`
  (canonical name normalization shared across the memory layer). The block registry extends this
  to *both* the prompt composition and the sanitizer strip-set.
- **Declarative gating** — each block declares its own `enabled(state, turnContext)` predicate,
  mirroring how `buildSystemMessage` already conditionally appends `[CURRENT INVENTORY]` /
  `[ADVENTURE SUMMARY]` / `[WORLD INFO & LORE]` / `[RECALLED MEMORIES]`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `buildSystemMessage` composes the system prompt by sequential `systemContent +=` appends | Confirmed at `engine/llm.js:297-339` | Read source | 2026-08-04 | low (stable seam) |
| The injected block set is exactly: `[CURRENT STATUS]`, `[CURRENT INVENTORY]`, `[ADVENTURE SUMMARY]`, `[WORLD INFO & LORE]`, `[RECALLED MEMORIES]` | Confirmed | Read `engine/llm.js:306-337` | 2026-08-04 | medium (blocks may be added) |
| `sanitizeForHistory` strip-set is a hardcoded regex `[\s>]*\[CURRENT\s+(?:STATUS\|INVENTORY)\]` matching only the two CURRENT blocks | Confirmed at `engine/llm.js:156` | Read source | 2026-08-04 | low |
| `[ADVENTURE SUMMARY]`, `[WORLD INFO & LORE]`, `[RECALLED MEMORIES]` are injected but NOT in the strip-set → echoed copies would reach history | Confirmed by comparing the inject list (`llm.js:317-337`) with the strip regex (`llm.js:156`) | Read source | 2026-08-04 | low |
| `STATUS_FORMAT` is a separate, single-source constant (`engine/statusFormat.js`) distinct from the context blocks | Confirmed | Read `engine/statusFormat.js` | 2026-08-04 | stable |
| The frontend declares its own copy of the status contract literal in the zero-build default prompt | Confirmed (`web/static/js/app.js`), pinned by a source-text test per ARCHITECTURE.md §2 | Read `web/FRONTEND_ARCHITECTURE.md` + ARCHITECTURE.md | 2026-08-04 | stable |
| `sanitizeForHistory` is called from `engine/llm.js` (turn commit), `engine/context.js` (summary), `web/routes/game.js` (opening scene) | Confirmed by grep | Grep across repo | 2026-08-04 | low |
| The archive change `2026-08-03-harden-context-history-integrity` already unified the status parser and added the CURRENT-block sanitizer | Confirmed in archived proposal.md | Read archive | 2026-08-04 | stable |
| Sanitizer handles the block shape as header line + following `- ` bullet lines, tolerating a `> ` role-play prefix | Confirmed at `engine/llm.js:158-185` | Read source | 2026-08-04 | low |
| A "block" is a header line followed by `- ` bullets; prose after a non-bullet line is preserved | Confirmed | Read `engine/llm.js:171-182` | 2026-08-04 | low |

## Unverified assumptions

| Assumption | Cost to check |
| :--- | :--- |
| `[RECALLED MEMORIES]` echoes have never been observed in the wild (it is gated on non-empty RAG) | Run a real/mock session with RAG non-empty and inspect whether the model echoes the block; low cost, low urgency |
| Reordering injected blocks (e.g. moving `[WORLD INFO & LORE]` after `[RECALLED MEMORIES]`) has no measurable effect on narration quality | A/B a mock/real session; probably unnecessary but cheap to spot-check |
| No code outside `engine/llm.js` depends on the exact inter-block ordering / whitespace of the composed prompt | Grep for `CURRENT STATUS` / `ADVENTURE SUMMARY` string literals in tests and web; low cost |

## Superseded claims

| Was believed | Why it was wrong | Replaced by |
| :--- | :--- | :--- |
| (none so far) | | |

## Links out

- `engine/ARCHITECTURE.md` — status-line contract (`status-line-contract-residue`, §2) and prompt-injection defense (`close-prompt-injection-backdoor`, §4d) describe the invariants this change must preserve.
- `openspec/changes/archive/2026-08-03-harden-context-history-integrity/` — prior sanitizer/parser unification this change extends.
- `openspec/changes/make-undo-and-trades-consistent/` — the `status-line-contract-residue` spec governing the pinned format.
