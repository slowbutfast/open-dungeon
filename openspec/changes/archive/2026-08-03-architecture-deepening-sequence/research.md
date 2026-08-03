# Architecture Deepening Sequence — research

## Source material

### Seven research-only deepening candidates (2026-08-03, `d27c42f`)

Landing `d27c42f` ("docs(openspec): research artifacts for seven architecture
deepening candidates") created one research-only change folder per candidate
(each `schema: tdd-rnd` in the *research* phase only — `.openspec.yaml` +
`research.md`). Each folder's `research.md` carries the verified-facts table,
the deletion-test signal, and the "Raised but not acted on" open decisions:

| # | Candidate | Change folder | Core claim (verified in its research.md) |
|---|-----------|---------------|------------------------------------------|
| #26 | memory freshness | `memory-freshness-read-through/` | Reads only work if callers remember to flush first; the two `forceFlushBeforeRead` twins already diverge (web uses `engine.model`, MCP awaits `engine.getLoadedModel()`, one propagates errors, the other swallows them); `dungeon_search_memories` and in-narration RAG recall skip the ritual entirely; web `/api/state` returns score with no flush. |
| #27 | memory schema boundary | `memory-schema-boundary/` | No module owns the schema: `quest_goals`/`barter_offers` SQL lives in three modules; two matching regimes answer "do I hold this item?" (exact `LOWER()` SQL vs canonical `itemNames`) so `completeGoal` can fail a goal spelled "the Gem" against a held "Gem"; `rollbackTurn` covers only events+inventory so lore/offers/goals survive an undo; two `BarterEngine` instances are constructed per engine (`memoryManager.js:19`, `engine/index.js:69`). |
| #28 | LLM adapter | `llm-adapter-unification/` | "Talk to the LLM" is six `chat.completions.create` sites (narration, fallback retry, summarization, cards, extraction, opening scene) each repeating the tracker/error dance; the mock dispatches on **prompt substrings**, so a prompt edit silently changes test behavior; `formatUserInput` exists twice. |
| #29 | engine facade | `seal-engine-facade/` | `AdventureEngine` is a shallow seam: callers reach *through* it into internals (`web/routes/memory.js:66` three hops to `upsertInventoryItem`, `mcp/tools/state.js:111` to `getLore`, `diagnostics.js:37` pokes the sqlite handle, `llm.js:280` pre-gate); wiring is done by mutable-field mutation (`context.memoryManager = this.memory`). |
| #30 | transport collapse | `collapse-transport-layer/` | The same engine call is expressed twice per concept (HTTP route + MCP tool); three SSE forwarders in `web/routes/game.js`; the `/trade` and `/goals/complete` SSE streams are computed server-side and dropped (frontend checks `res.ok` only); 17 `isError` envelopes + 13 "No active adventure" guards across MCP tools. |
| #31 | frontend state | `frontend-state-unification/` | The pub/sub store is a zombie: `updateState`/`subscribe` have no callers; the real state model is ~68 `window.*` globals bridged by `Object.assign(window, ...)`; two render paths exist for one Turn (`skipLastAssistant` + `revealAssistantText`) and the error path already drifted (renders a stale duplicate). |
| #32 | status-line residue | `status-line-contract-residue/` | The engine side is unified on the canonical three-field line, but producers/consumers outside `llm.js` still carry the two-field variant (mock ×3, fallback opening scene, frontend strip regex at `renderers.js:49`); the contract string is duplicated across 4 presets + `DEFAULT_SYSTEM_PROMPT` + `app.js:148`; the MCP re-parse (`gameplay.js:66`) is now vestigial. |

### Working note: refactor guardrails + sequencing (collaborating agent, 2026-08-03)

The following sequencing note was produced by the agent that generated the
candidate report. It is the load-bearing input for this change's classification
and ordering, quoted in full:

> **Refactor guardrails + sequencing — architecture deepening (issues #26–#32)**
> You are refactoring for depth. The bar is *not* "the suite passes" — that's the floor. Enforce:
> 1. **TDD first (the repo's own `tdd-rnd` mandate).** Land the failing test that locks the new behavior *before* implementation; run it and watch it fail, then implement, then watch it pass. First task group in `tasks.md` must be "Test Scaffolding (TDD)".
> 2. **Preserve wire contracts byte-for-byte** unless the change is explicitly a separate breaking change. Locked: SSE shapes `{type: chunk|done|status|system|error|cost}` (raw `"data: {...}"` framing is asserted), MCP tool names + arg schemas, the status-line format, and the `make-undo-and-trades-consistent` / `harden-context-history-integrity` contracts (tool names, watermark semantics, single-owner moves). Do not re-litigate locked contracts.
> 3. **Mock/real parity.** If you touch prompts, mock dispatch, or call shapes, keep mock and real on the *same* code path; run `test_live_llm.py` (needs `OPENROUTER_API_KEY`) and re-verify mock-mode tests under the new keying.
> 4. **Add unit seams where the suite is blind.** `StructuredStore`, `VectorStore`, `BarterEngine`, `MemoryManager`, and the turn-commit path have no JS unit tests. Add a minimal harness (`node:test`, no new deps) with a `:memory:`/file-backed store so internals are tested at module level, not just through the wire. **Stand this up before #26/#27/#28 land** — they refactor exactly these blind spots.
> 5. **One behavior per change.** No refactor-plus-behavior-fix in one commit. Each candidate = one openspec change folder + one issue.
> 6. **Preserve env isolation.** Don't touch `SAVE_DIR` derivation, the port-conflict guard, or `conftest.py`. Leave uncommitted working-tree edits intact — coordinate, don't overwrite.
> 7. **Run the tiers in order:** `npm run test:fast` → integration tier → `npm run test:all` → `npm run test:e2e`. Fix a regression at the tier that caught it.
> 8. **Apply the deletion test to your own work.** A new module that's a pass-through isn't deepening — verify complexity concentrated in it, not moved.
>
> **Sequencing — what to tackle now (in order):**
> - **#26 memory freshness first.** It's the one with a live, self-inflicted wound: `dungeon_send_action` had to add a flush to report a score that `/api/state` reports stale — two transports, divergent guarantees for the same value. Smallest, most contained, pure correctness. Its read-through path is also the natural home for #32's "turn returns committed metrics."
> - **#32 status-line residue alongside #26.** Small mop-up of the landed work (frontend two-field strip, mock/fallback two-field emit, contract string ×6). Cheap, finishes what's already done. The contract-string constant it introduces is a prerequisite for #28.
> - **#27 schema boundary + full-surface rollback next.** Completes the `make-undo-and-trades-consistent` contract (lore/offers/goals survive undo today) and fixes the double-`BarterEngine` + matching regimes. Touches `memoryManager`/`structuredStore`, same files #26 just deepened — sequence so #26 lands first.
> - **#28 LLM adapter last of the Strongs.** Highest leverage but largest blast radius, and it changes prompts/mock dispatch — the exact mock-parity hazard in guardrail #3. Only start once (a) #26/#27 landed so `llm.js`/`memoryManager.js` are stable, and (b) the unit harness from guardrail #4 exists.
> - **#29 facade, #30 transport, #31 frontend — anytime, mechanical.** Don't prioritize them over the correctness work. Note #30 subsumes the flush-twin collapse and the SSE forwarder dedup, so it's cleanest after #26; #29's constructor-DI overlaps #27's single-`BarterEngine` wiring.
>
> **Defer, don't drop:** anything that re-litigates the locked undo/status contracts (guardrail #2), and any refactor that can't show a failing test first.
>
> That ordering gets the correctness wins (score/undo freshness) before the big structural play (#28), and stands up the test seams the refactors actually need.

### Raised but not acted on

- **Where the guardrails should live.** The note asks "drop the whole thing into
  `docs/refactor-guardrails.md` or `AGENTS.md`?" Decision for this change: an
  OpenSpec change is the better home — it is trackable (tasks.md is the program
  tracker), links to the per-candidate research folders, and stays out of the
  global agent rules. `AGENTS.md` is intentionally untouched (changing it would
  alter every future session's behavior, which is beyond this coordination work).
- **The note's guardrail #6 names specific uncommitted files** (`engine/context.js`,
  `mcp/server.js`, `tests/test_engine_status_parsing.py`). The working tree at the
  time of writing this change has only `.opencode/opencode.jsonc` modified (the
  MCP env-block hardening from `playtest-hygiene-followups`). The rule is kept in
  its general form (preserve any uncommitted WIP; coordinate, don't overwrite),
  not tied to those filenames.
- **Whether #28 becomes a thin `llmCall(kind, messages, opts)` helper or a full
  `LLMAdapter` class.** Both are defended in `llm-adapter-unification/research.md`;
  the note's own guardrail #4 requires the unit seam first either way. Left open
  for #28's own design phase.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Strong set | Candidates this program commits to implementing (#26, #32, #27, #28) | All seven candidates |
| Defer set | Candidates deliberately not scheduled (#29, #30, #31) — mechanical, dev-facing, no live correctness hole | Dropped or rejected forever |
| blast radius | The number of modules/tests a refactor touches and how much of the wire contract it risks | The size of the diff |
| unit seam | A module-level test harness (`node:test`, `:memory:`/file-backed store) covering internals the wire tests can't see | Another end-to-end test file |
| deletion test | The proof a seam is real: delete the abstraction and complexity must concentrate nowhere (reads silently break) | A metric on the new module's length |
| wire contract | Byte-level external behavior: SSE event shapes, MCP tool names/schemas, the status-line format, undo/watermark/moves semantics | Internal function signatures |
| mock/real parity | Mock and real LLM paths share one code path; mock dispatch is intent-keyed | Prompt-substring mock dispatch |
| full-surface rollback | Undo rolls back every store a turn can write (events, inventory, lore, offers, goals) | Undoing only events + inventory |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — in-repo coordination of existing research artifacts; no external code) | — | — | 2026-08-03 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| `node:test` built-in harness for the unit seam | Adopt | No new dependencies (guardrail #4); matches the repo's "no build step, minimal deps" posture | 2026-08-03 |
| A new unit-test framework (e.g. Vitest/Jest) for the seam | Reject | Adds a dependency and a build step for work `node:test` covers | 2026-08-03 |
| `docs/refactor-guardrails.md` as the home for the guardrails | Reject | Not trackable as a change; no task list, no apply phase | 2026-08-03 |
| `AGENTS.md` as the home for the guardrails | Reject | Would change global agent behavior for every future session | 2026-08-03 |
| An OpenSpec change as the program container | Adopt | Trackable tasks, links to candidate research, archived when the program completes | 2026-08-03 |

## Patterns adopted

- The repo's `tdd-rnd` workflow itself (research → proposal → specs → architecture
  → tests → tasks), re-used here for a coordination change rather than a code change.
- The `parseStatusLine` shared-module discipline (from `harden-context-history-integrity`,
  #12) — one definition, enforced by a source-text test (`tests/test_shared_status_parser.py`)
  — as the template for wire-contract preservation in guardrail #2.
- The `engine/scoring.js` pure-module pattern (from `fix-score-progression`, #19) —
  extracted for testability — as the model #28's adapter should mirror.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| The seven candidates are research-only (`.openspec.yaml` + `research.md`, no proposal/specs/tasks) | `ls` of each candidate folder | File read, 2026-08-03 | stable |
| Each candidate carries a verified-facts table and a deletion-test signal | Content of each `research.md` | File read, 2026-08-03 | stable |
| `#26` is the only candidate with a live, cross-transport correctness wound (score reported stale by `/api/state` vs fresh by `dungeon_send_action`) | `memory-freshness-read-through/research.md` "Verified facts" | Code read + research record | stable |
| `#27` is the only candidate that completes a locked contract (`make-undo-and-trades-consistent`: lore/offers/goals survive undo today) | `memory-schema-boundary/research.md` "Superseded claims" | Code read | stable |
| `#28` changes prompts and mock dispatch — the mock-parity hazard | `llm-adapter-unification/research.md` "Unverified assumptions" | Code read | stable |
| `#32`'s contract-string constant is a stated prerequisite for `#28` | `status-line-contract-residue/research.md` "Candidate tech" | Research record | stable |
| `StructuredStore`, `VectorStore`, `BarterEngine`, `MemoryManager`, and the turn-commit path have no JS unit tests | Grep for `node:test`/JS unit test files in `tests/` + the note's guardrail #4 | Code search | stable |
| `npm run test:fast` / `test:e2e` / `test:all` are the defined tiers | `package.json` scripts | File read, 2026-08-03 | stable |

## Unverified assumptions

- **That the unit seam (guardrail #4) can be stood up without touching env
  isolation.** The seam runs `node:test` against a `:memory:`/file-backed store;
  whether `MemoryManager` construction needs a `SAVE_DIR` at all is unverified.
  Design phase must keep `SAVE_DIR` derivation and `conftest.py` untouched.
- **That #28's mock re-keying is a bounded cost.** The note and
  `llm-adapter-unification/research.md` both flag ~10 test files exercise the mock
  contract. The exact re-keying surface is unquantified.
- **That deferring #29/#30/#31 carries no hidden correctness debt.** Their research
  shows dev-facing seams only; none has a live gameplay-visible defect. If a new
  defect appears in those seams, a candidate should be promoted early.

## Superseded claims

- **"Tackle the deepening candidates in tracker order."** Superseded by the
  sequencing note and this change's triage: scale/risk/ordering, not availability,
  decides the sequence. The note's order (#26 → #32 → #27 → #28) replaces any
  naive left-to-right reading of the issue list.

## Links out

- `openspec/changes/memory-freshness-read-through/research.md` — #26
- `openspec/changes/memory-schema-boundary/research.md` — #27
- `openspec/changes/llm-adapter-unification/research.md` — #28
- `openspec/changes/seal-engine-facade/research.md` — #29
- `openspec/changes/collapse-transport-layer/research.md` — #30
- `openspec/changes/frontend-state-unification/research.md` — #31
- `openspec/changes/status-line-contract-residue/research.md` — #32
- `openspec/changes/make-undo-and-trades-consistent/` — the undo/trade batch #27 completes
- `openspec/changes/archive/2026-08-03-harden-context-history-integrity/` — locked status/parser contract
- `openspec/changes/archive/2026-08-03-fix-score-progression/` — score authority
- `tests/test_shared_status_parser.py` — the wire-contract-preservation model
- `engine/scoring.js` + `tests/test_scoring.py` — the deep-module pattern
