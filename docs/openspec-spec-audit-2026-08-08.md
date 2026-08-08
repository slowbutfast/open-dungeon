# OpenSpec ↔ Codebase Audit (2026-08-08)

Audit of all 20 spec domains in `openspec/specs/` against the live codebase
(`engine/`, `web/`, `mcp/`, `tests/`, `game/`), including the active change
deltas in `openspec/changes/`.

**Headline findings up front:**

- Two active change deltas are spec'd as landed but have **zero implementation**
  (`make-undo-and-trades-consistent`, `playtest-diagnostics-hygiene`).
- One stale runtime data file (`game/presets.json`) silently overrides hardcoded
  presets and breaks the prompt-fidelity contract (`RESPONSE_SHAPE`) at runtime,
  while tests validate only source, not runtime data.

---

## 1. barter-system

- **Implemented & Verified:** Universal barter trade execution (atomic SQLite swap,
  `structuredStore.js:336-377`; `[SYSTEM EVENT]` at `game.js:552-556`), unowned-item
  rejection ($0 LLM cost, `barterEngine.js:43-46`), ambiguity disambiguation
  (`llm.js:520-532`), quest goal state machine (`NOT_STARTED/IN_PROGRESS/COMPLETED/FAILED`),
  action chips 💬/🔄/📜 (`actionChips.js:47-97`), NPC-from-lore detection, Barter UI Modal.
  All match.
- **Spec Drift:**
  - **[P0]** Delta `make-undo-and-trades-consistent` — undoing a trade **strands the sold
    item in `traded` limbo** and leaves the granted item held (granted item inserted with
    `acquired_turn = NULL`, `structuredStore.js:363-373`; `rollbackTurn` only deletes by
    `acquired_turn >= N`, `:725-727`). No `status_turn` column exists. Tests
    `test_undo_consistency.py:169-203` fail.
  - **[P1]** Narrated trade without a registered offer bypasses `executeBarter` possession
    check (`memoryManager.js:216-225`).
  - **[P1]** `[SYSTEM EVENT]` goes to the SSE client, not the LLM prompt context
    (`game.js:552-553`); MCP `dungeon_execute_trade` emits none.
- **Unmapped:** `POST /api/memory/inventory/add`, `POST /api/trade/offer`, `POST /api/goals`,
  one-click modal trade flow, quantity>1 trade decrement, duplicate-sale refusal,
  trader-keyword taxonomy.
- **Action:** P0 — implement D5 status rollback; P1 — spec the no-offer fallback semantics +
  `[SYSTEM EVENT]` scope; P2 — cover the manual endpoints.

## 2. game-engine

- **Implemented & Verified:** Adventure init/persistence, undo (history/events/lore/offers/goals/
  rooms/visits/vector rollback — **except inventory status**), streaming through unified adapter,
  shared `parseStatusLine`, sanitized history commit, engine-owned moves/score, forged-status
  guard, spatial reconciliation, mobile responsiveness. Mostly solid.
- **Spec Drift:**
  - **[P0]** Undo does NOT roll back inventory status mutations or re-acquisitions — base spec
    (`spec.md:31-33`) and delta both violated. `structuredStore.js:725-727`, `280-298`. 2/10 unit
    tests red.
  - **[P1]** Pre-action barter gate uses substring matching, not canonical `hasItem()`
    (`llm.js:503-513`).
  - **[P2]** Mock + web fallback hardcode the status literal instead of composing from
    `STATUS_FORMAT`; stale "mock two-field line" example in Moves scenario.
- **Unmapped:** retry/regenerate semantics (re-increments `moves`!), `continue` action type,
  `editTurn`, spatial map inspection surface, card lifecycle, auto-summary triggers, RAG recall,
  `POST /api/state`/`/api/memory/inventory/add` mutation surface (bypass engine invariants).
- **Action:** P0 — implement D5; P1 — route gate through `hasItem`, spec retry; P2 — spec the
  mutation HTTP surface + unmapped features.

## 3. inventory-system

- **Implemented & Verified:** Sync SQLite CRUD, quantity canonicalization, atomic status swap,
  canonical `itemNamesMatch` regime, read-through freshness, full-surface rollback (non-inventory
  surfaces).
- **Spec Drift:**
  - **[P0]** `status_turn`/status-mutation rollback absent — delta `spec.md:12-14` unlanded;
    `executeTrade` granted rows survive rollback.
  - **[P1]** "3-Tiered Hybrid Item Matching" not implemented — no Levenshtein, no item embeddings,
    `findItemMatches` is dead code (`structuredStore.js:309-318`).
  - **[P1]** No SQL indexes despite "indexed" claims; "container scoping" and "post-stream
    acquisition regex" don't exist.
  - **[P1]** `_resolveTurnIndex` (`:441-446`) defeats the "non-narration rows survive rollback"
    scenario.
  - **[P2]** `dungeon_inspect_inventory` tool description is the inverse of behavior
    (`memory.js:48-50` vs `structuredStore.js:301-305`); stack-quantity re-acquire resets to 1
    (`:286`); `consumed` isn't a stored status.
- **Action:** P0 — implement D5 or rewrite delta; P1 — align 3-tier matcher wording, fix rollback
  contract; P2 — tool description, quantity semantics.

## 4. mcp-server

- **Implemented & Verified:** All 20 tools registered and functional (session, gameplay, state,
  memory, barter, diagnostics, map); SAVE_DIR sandbox; read-through freshness; Zod schema
  validation; stdio + SSE transports; error envelopes.
- **Spec Drift:**
  - **[P1]** Tool count "18" is stale (`spec.md:121`) — code registers **20**.
  - **[P2]** `dungeon_list_saves` scenario claims "timestamp" (field doesn't exist);
    `dungeon_init_session` claims `summary` param (doesn't exist); `dungeon_inspect_inventory`
    claims traded/dropped items returned (they're excluded).
  - **[P0]** Delta `playtest-diagnostics-hygiene` entirely **unlanded**: blank-action rejection
    absent (`gameplay.js:38`), `llmTracker` is process-global with zero reset callers, complete
    cost accounting absent (non-narration calls never `recordUsage`).
- **Unmapped:** `/health` endpoint, startup guards, `continue` action_type, `mock_llm`/
  `memory_db_path`/`save_dir` in backend_status, mock canned memory recall.
- **Action:** P0 — implement the delta; P1 — fix 18→20; P2 — reconcile the three scenario
  overstatements.

## 5. spatial-map

- **Implemented & Verified:** Entire spec green — room graph tables, turn-commit reconciliation,
  reverse inference, self-healing edges, portal/time kinds, canonical matching, undo-consistent
  rollback. All tests pass.
- **Spec Drift:** Minor — canonical matching is a *room-specific* stem regime, not the same as
  item names; NULL-direction edges undocumented; "never breaks the turn" has an 8.1 degrade nuance.
- **Unmapped:** `computeRegions` (walk-only union — the load-bearing concept with **zero** spec
  coverage), `getMap`/`getRoom` proxies, `GET /api/map`.
- **Delta status:** `spatial-map-visualization-pathfinding` is a **clean proposal, 0% implemented**
  (no `pathfinding.js`, no `getPath`, no `/api/path`, no `dungeon_path_to`, no map panel). Every
  prerequisite still holds at HEAD — keep as active change; do **not** promote to a spec yet.
- **Action:** P1 — add Region Groupings requirement; P2 — cover inspection surface; fix 18→20 in
  mcp-server.

## 6. llm-routing

- **Implemented & Verified:** Backend selection, client construction (OpenRouter/LM Studio/mock),
  model auto-detection. Matches.
- **Spec Drift:**
  - **[P1]** Failover scenario overstates behavior — OpenRouter re-query returns the same model so
    fallback always rethrows (`llm.js:617-630`); LM Studio re-selects the failed model.
  - **[P1]** Web defaults to **mock** (`web/server.js:20-22`), not LM Studio as the spec preamble
    implies.
  - **[P0]** Delta `playtest-diagnostics-hygiene`: per-session tracking and complete cost
    accounting unimplemented (global `llmTracker.js`, single `recordUsage` call site at
    `llm.js:680`).
- **Unmapped:** narration budget/clamping, system prompt assembly, narrator-style pinning, status
  parsing/sanitization/injection defenses, placeholder-key→mock fallback, temperature routing (no
  API to change it).
- **Action:** P0 — implement delta or mark pending; P1 — reword failover; P2 — cover the unmapped
  surface.

## 7. lore-cards

- **Implemented & Verified:** Card management, keyword triggers, prompt injection, validation.
  Mostly match.
- **Spec Drift:**
  - **[P0]** Disabled cards still auto-inject — `getActiveCards` never checks `enabled`
    (`context.js:11-25`); toggle writes `enabled` but renderer reads `active`.
  - **[P0]** Manual + `/api/scan` cards bypass trigger validation (spec says validation is
    universal; it only applies to auto-extraction).
  - **[P1]** Manual/scan cards never persist to the SQLite `lore` store — `dungeon_inspect_lore`
    and `dungeon_delete_lore_card` can't see them (two disjoint sources of truth).
  - **[P2]** Trigger-scan source is broader than spec (includes prior assistant narration);
    card-type enum un-pinned (extractor allows `faction`, UI doesn't).
- **Unmapped:** `update`/`toggle` API actions, `POST /api/scan`, sync dedup-by-name divergence,
  hash-id upsert semantics.
- **Action:** P0 — fix enabled-gating + validation parity; P1 — clarify store-backedness; P2 — pin
  the enum.

## 8. narrator-context

- **Implemented & Verified:** Declarative block registry (`contextBlocks.js`), composed context,
  registry-derived sanitization, status-line contract. All match.
- **Spec Drift:**
  - **[P1]** `[PLAYER INPUT]` is injected but NOT a registry block (`llm.js:388`) — violates
    "every injected block is registered"; its echo is unstripped.
  - **[P1]** Sanitizer only strips bullet-bodied echoes — prose-bodied `[ADVENTURE SUMMARY]`/
    `[RECALLED MEMORIES]` echoes partially survive (`llm.js:244-258`).
  - **[P2]** Stale "mock two-field line" reference.
- **Unmapped:** RAG recall mechanics (topK=5, no threshold, mock canned memory), lore trigger
  matching driving the WORLD INFO block.
- **Action:** P1 — carve out `[PLAYER INPUT]` + correct sanitizer scope wording; P2 — fix stale
  references + add RAG defaults.

## 9. narrator-fidelity

- **Implemented & Verified:** Status-line fidelity, stable style capture/pinning, stale-status
  recovery, response-shape examples. Strong match.
- **Spec Drift:**
  - **[P1]** "A CHANGED status line SHALL always be honored" is unconditional in spec — code has a
    forged-status carve-out (`llm.js:708-709`).
  - **[P2]** Stale-echo recovery has an unstated `roomNamesMatch` guard (`llm.js:739`); stale
    two-field mock references.
- **Unmapped:** simple-action budget floor (the enforcement half of "status line always emitted"),
  truncated `[Status:` fragment stripping, **the simple-action "15 words or less" prompt suffix**
  (zero coverage anywhere), `setNarratorStyle` (dead API).
- **Action:** P1 — align "changed status" wording with game-engine guard, close the
  missing-status integration test gap; P2 — spec the prompt suffix.

## 10. narrator-response-shape

- **Implemented & Verified:** Single `RESPONSE_SHAPE` constant, interpolated by default + presets +
  frontend, tone-neutral grounded examples. Matches at source level.
- **Spec Drift:**
  - **[P1]** **Runtime drift:** on-disk `game/presets.json` (gitignored, stale) **overrides**
    hardcoded presets at load (`storyPresets.js:85-102`) and carries the **legacy** exemplar — no
    RESPONSE SHAPE marker, no final-line rule, no location mandate. Tests validate source, not
    runtime.
  - **[P2]** Example 2 is third-person, violating the spec's "second-person prose" clause.
- **Unmapped:** parser contract, sanitization, forged-status guard, stale-status recovery, engine
  ownership of Moves/Score, streaming buffer, frontend strip asymmetry.
- **Action:** P1 — spec the presets persistence layer / reseed policy; P2 — fix Example 2 wording +
  cover the enforcement consumers.

## 11. openrouter-model-catalog

- **Implemented & Verified:** Curated list, env-model-first + dedup, captions array, dropdown
  slug—caption rendering, default selection. Match.
- **Spec Drift:**
  - **[P0]** Spec requires `deepseek/deepseek-chat` — code ships `deepseek/deepseek-v4-pro`
    (`openrouterModels.js:3`); spec and tests disagree.
  - **[P1]** Catalog `cost` field is display-only — `llmTracker` hardcodes `$0.40/$1.10` DeepSeek
    V4 rates for every model (`llmTracker.js:5-8`), matching no catalog entry.
  - **[P2]** Default-selection precedence isn't strictly `data.model` (engine state/prior selection
    win).
- **Unmapped:** model-switch persistence (`POST /api/settings`), "Custom model" caption fallback,
  euryale entry.
- **Action:** P0 — fix slug; P1 — spec the pricing gap; P2 — reword selection precedence.

## 12. context-compression

- **Implemented & Verified:** Auto-summarization trigger, 4-turn merge+archive, second-person
  mandate, sanitized summary, read-through memory sync. Match.
- **Spec Drift:**
  - **[P1]** "A system message indicates compression is running" — no such client-visible event
    exists (debug log only, `context.js:32`); the trigger is a fire-and-forget IIFE.
  - **[P2]** Configurable threshold is state-persisted but has **no API/MCP surface** to set it.
- **Unmapped:** event extraction / memory condensation as a second compression layer, RAG recall,
  undo-vs-summarization interplay (summary permanently trims the undo chain).
- **Action:** P1 — emit a system event or amend scenario; P2 — spec the extraction/RAG layers +
  threshold access.

## 13. diagnostics-suite

- **Implemented & Verified:** The three Python scripts (chat/diagnose_network/list_models) match —
  but only for the legacy LM Studio path.
- **Spec Drift:**
  - **[P1]** Spec is LM Studio-only while the deployment is OpenRouter (`chat.py` hardcodes
    `api_key="lm-studio"`).
  - **[P1]** "Session cost" is neither scoped nor complete (global tracker, narration-only usage).
- **Unmapped:** The entire JS diagnostics surface — `llmTracker`, `dungeon_get_debug_info`,
  `GET /api/debug/info`, `GET /api/cost`, `/api/ping` cost block, frontend debug dashboard, SSE
  cost event. ~90% of the domain is unspec'd.
- **Action:** P0 — expand spec to the actual surfaces or rescope to CLI-only; P1 — align the web
  vs MCP diagnostics contracts.

## 14. mock-narration-scripting

- **Implemented & Verified:** `MOCK_SCRIPT_FILE` loading, per-turn advance, exhaustion-holds-last,
  intent dispatch, canonical status line, runner env passthrough. All four requirements match.
- **Spec Drift:**
  - **[P1]** Script shape is not validated (only non-empty strings, `mockOpenAI.js:19-20`);
    scripted turns deliver no prose — narration collapses to `"Done."` because the sole status line
    is sanitized away.
  - **[P1]** Script advances per *narration call*, so `retry` consumes an extra line; `_scriptIndex`
    never resets across sessions in a long-lived process.
- **Unmapped:** `suggestion` intent (nondeterministic, test-only), `MockEmbeddings`,
  `MockModels`→`mock-gemma`, gitignored script fixtures.
- **Action:** P1 — document the `"Done."` narration + validation + retry/session semantics;
  P2 — pin the mock internals.

## 15. parallel-playtest-runner

- **Implemented & Verified:** Server lifecycle, readiness wait, teardown, crash recovery + resume,
  concurrency cap, JSON action mode, HTTP driver, save isolation. Match.
- **Spec Drift:**
  - **[P1]** "Concurrent probes never share save files" is false at the memory layer — all probes
    share one `memory.db` + one `indexes/` dir under `game/playtest/adventures/data/`
    (`engine/index.js:55`). Multi-process SQLite writes = latent `SQLITE_BUSY`.
  - **[P2]** "Explicit LLM_BACKEND" and "operator port/SAVE_DIR override" claims don't match the
    CLI (no port/--save-dir flags).
  - **[P3]** Crash detection is reactive (request-failure only), `max_restarts=3` cap unspec'd.
- **Unmapped:** `probe-state.json` resume bookkeeping, result/reporting schema, full CLI surface,
  MCP autoplay tooling (`tests/autoplay_runner.js`, `sample_session.js`).
- **Action:** P1 — fix or document memory-store sharing; P1 — spec recovery + result contract.

## 16. preset-management

- **Implemented & Verified:** 3-step wizard, preset CRUD, character customization, stream error
  logging. Match.
- **Spec Drift:**
  - **[P0]** Persisted `presets.json` overrides hardcoded `STORY_PRESETS` and is **stale** (no
    RESPONSE SHAPE). `dungeon_init_session`/`/api/init` serve non-conforming prompts. Tests read
    source, not runtime.
  - **[P1]** "Alerts the user on critical failures" — parse failures are console-only
    (`streaming.js:124-127`).
  - **[P1]** Adventure-Config edits are silently discarded unless "Customize Story" was clicked
    first (`presets.js:298-302`).
- **Unmapped:** `PUT /api/presets/:index`, MCP `preset_index` wiring, custom-adventure default
  roster.
- **Action:** P0 — reseed/migrate stale presets.json + spec precedence; P1 — fix the two UX
  contracts.

## 17. refactor-program

- **Implemented & Verified:** Strong-set candidates #26 (read-through freshness), #27 (schema
  boundary), #28 (adapter unification), #32 (status-line residue), plus injection-backdoor closure
  and score progression all landed and test-enforced. Guardrails met.
- **Spec Drift:** **[P1]** stale "18 tools" (`spec.md:22`, also in `mcp/server.js:7,95`,
  `tests/test_mcp_tools.py:2`); **[P1]** VectorStore named in the Unit Seam but has no
  `vectorStore.test.mjs`.
- **Residue (deferred candidates, as documented):** 3× SSE forwarders + 20/16/12 MCP envelope
  boilerplate; zombie `web/static/js/state.js` + `Object.assign(window,…)` bridge; 5 facade
  reach-ins (`web/routes/memory.js:57`, `mcp/tools/state.js:113`, etc.); **web→MCP layering
  inversion** (`web/routes/game.js:7` imports `forceFlushBeforeRead` from `mcp/tools/memory.js`).
- **Action:** P1 — fix tool count + VectorStore seam; P2 — de-invert the layering, clean stale test
  headers.

## 18. terminal-cli

- **Verdict: the entire spec describes a frozen, deprecated surface.** Every implementing file is
  the pre-refactor Python CLI (last commit 2026-06-09). The spec has never been marked deprecated
  despite `AGENTS.md`, `tests/ARCHITECTURE.md`, and archived changes all deprecating it.
- **Spec Drift:** the char-by-char typewriter is **dead code** (`aidungeon_cli.py:24-30`, never
  called); status-line pattern is stale 2-field vs shared 3-field `STATUS_FORMAT`.
- **Unmapped:** 12 CLI slash-commands beyond the spec's 3; the actual live successor surfaces (web
  slash-command interceptor, MCP tools, probe infra).
- **Action:** P0 — mark spec DEPRECATED + fix stale README/SKILL docs; P1 — fold live successors
  into a spec or defer to game-engine/mcp-server.

## 19. test-suite

- **Implemented & Verified:** Save-dir isolation (fallback + precedence + `safe_rmtree`), tiered
  markers, `npm run test:*` scripts, deprecated-CLI exclusion from `test:all`.
- **Spec Drift:**
  - **[P0]** `test_barter_engine.py` is marked `unit` but **spawns a Node server** — `pytest -m
    unit`/`test:fast` violates the "no spawned servers" scenario.
  - **[P1]** `spec.md:30` references archived `tasks.md §3.2` mapping that predates ~10 test files;
    deprecated `test_cli_behavior.py` runs in the `unit` tier (can make fast tier red).
  - **[P1]** `safe_rmtree` mandate only partially honored — most teardowns use raw
    `shutil.rmtree(ignore_errors=True)`.
  - **[P2]** ARCHITECTURE.md fact errors (port 5001 vs 5004, wrong save dirs, missing 4 unit test
    files); unmarked node-probe/self-test files only run under `test:all`.
- **Unmapped:** the entire `npm run test:unit` node:test tier (14 files), the node-probe pattern,
  shared status-parser test, `.mcp.json` env contract.
- **Action:** P0 — reclassify `test_barter_engine.py`; P1 — inline the marker mapping, resolve
  deprecated-in-fast-tier; P2 — cover the unit seam.

## 20. ai-lore-scanner

- **Implemented & Verified:** `/api/scan` LLM extraction, JSON parsing + name-based dedup, card
  persistence. Mostly match.
- **Spec Drift:**
  - **[P1]** Within-batch duplicate bug — `existingNames` never updated in the loop
    (`context.js:155-167`).
  - **[P1]** Scan-path trigger words unvalidated (violates the `lore-cards` spec's validation
    requirement); no type enum enforcement.
  - **[P1]** **Scan cards never reach SQLite** — invisible to `dungeon_inspect_lore`/
    `dungeon_delete_lore_card`.
- **Unmapped:** the entire newer auto-extraction pipeline (lore-fact extraction during batch flush,
  schema validation, trigger filtering, deterministic sha256 IDs, store sync) — the scan spec
  describes only the legacy path while the extractor is the primary lore source.
- **Action:** P0 — document the two-pipeline split; P1 — fix the dedup bug + validation parity +
  persistence divergence.

---

## Active change delta status

| Delta | Status |
|---|---|
| `make-undo-and-trades-consistent` | **Spec'd as landed, NOT implemented** (P0). Tests intentionally red; `tasks.md` marks §7 done. |
| `playtest-diagnostics-hygiene` | **Entirely unlanded** (P0). All tasks unchecked; 3 requirements drift. |
| `spatial-map-visualization-pathfinding` | Clean proposal, 0% implemented; prerequisites all present. Do NOT promote yet. |
| `fix-mobile-view-responsiveness` | Implemented and verified (game-engine delta matches). |
| `integrate-online-database` | Proposal-only, 0% implemented, no stale claims. |

## Consolidated action items

### P0 — spec integrity / unlanded deltas

1. Implement `make-undo-and-trades-consistent` (D5 `status_turn` rollback) or rewrite the delta as
   pending — affects 3 spec domains, 4+ red test files.
2. Implement or park `playtest-diagnostics-hygiene` (blank-action rejection, tracker scoping,
   complete cost accounting) — affects llm-routing + mcp-server.
3. Reseed/version-stamp `game/presets.json` (stale file overrides hardcoded presets, breaks
   RESPONSE_SHAPE contract at runtime) — affects preset-management + narrator-response-shape.
4. Fix disabled-lore-card firing + manual/scan trigger validation parity — lore-cards.
5. Fix `test_barter_engine.py` unit→integration misclassification — test-suite.
6. Mark `terminal-cli` spec + docs as deprecated.
7. Fix `deepseek/deepseek-chat` stale slug — openrouter-model-catalog.

### P1 — spec accuracy

- MCP tool count 18→20 (mcp-server + refactor-program + code comments).
- Pre-action gate via `hasItem()`; `dungeon_inspect_inventory` description fix.
- `[PLAYER INPUT]` non-registry carve-out; sanitizer prose-body limitation.
- Runtime presets coverage (test loaded output, not source).
- Memory-store sharing in probe sandbox isolation.
- Failover scenario reworded to actual behavior.
- Scripted-narration `"Done."` + retry/session semantics documented.

### P2 — spec coverage for unmapped features

- HTTP mutation surfaces (`/api/state`, `/api/memory/inventory/add`), card update/toggle/scan,
  spatial map inspection + `computeRegions`, RAG recall, node:test unit seam, diagnostics web/MCP
  surfaces, event-extraction compression layer, `continue`/`editTurn`/retry semantics,
  cost-tracking per-model pricing.

### Biggest systemic gaps

1. Two P0 deltas that are fiction vs. HEAD.
2. `presets.json` runtime overrides silently defeating prompt-fidelity contracts while tests
   validate only source.
3. `dungeon_inspect_inventory`'s false "traded/dropped" claim mirrored in both spec and tool
   description.
4. The pre-action barter gate's divergent matching regime vs. canonical `hasItem()`.
