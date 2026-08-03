## Source material

### Architecture deepening review, candidate #2 (2026-08-03)

The memory store's schema is owned by no single module, and that is leaking three distinct defects:

**1. Barter tables are declared and referenced from three modules.**
- `barterEngine._initSchema` (`engine/memory/barterEngine.js:10-33`) creates `barter_offers` / `quest_goals`.
- `structuredStore` hard-codes those same tables in its own deletes (`engine/memory/structuredStore.js:289-290`).
- `memoryManager` runs a raw `SELECT id FROM quest_goals ...` for goal dedup (`engine/memory/memoryManager.js:250-252`).
- `barterEngine` reaches past `structuredStore`'s methods into the raw `db` handle (`this.store.db.prepare(...)`) for most of its queries.

**2. Two matching regimes answer "do I hold this item?".**
- Exact case-insensitive SQL: `structuredStore.hasItem` / `executeTrade` (`structuredStore.js:159-175`).
- Canonical JS matching: `barterEngine._findHeldItem` / offer lookup via `itemNames.js`.
- Consequence: `completeGoal` validates with exact `hasItem(goal.required_item)` — so a goal spelled "the Gem" fails against a held "Gem", while a narrated trade with the same spelling resolves via canonical matching. `executeBarter` bridges the gap by feeding the canonical match's stored name back into exact-match `executeTrade`, which is fragile.

**3. Rollback only covers events + inventory.**
- `structuredStore.rollbackTurn` (`structuredStore.js:247-267`) deletes `events` and `inventory` rows, rewinds the watermark. It does NOT touch `lore`, `barter_offers`, or `quest_goals`, all of which `_extractAndStore` writes at the same `turn_index` (`memoryManager.js:117-299`).
- `memoryManager.rollbackTurns` (`memoryManager.js:412-438`) awaits the in-flight flush, deletes vector items, rewinds the in-memory watermark, filters the buffer. The coordination is centralized correctly — it is just incomplete in scope.
- Since `fix-score-progression`, score is recomputed after undo and is therefore undo-safe — which makes the lore/offers/goals gap the last hole in the recorded undo contract (`make-undo-and-trades-consistent`).

**Construction defect.** Two `BarterEngine` instances are constructed per engine: `memoryManager.js:19` builds one, then `engine/index.js:69` builds a second and reassigns `this.memory.barter = this.barter`, orphaning the first. The wiring suggests uncertainty about where the barter engine actually lives.

### Raised but not acted on

- **Whether `quest_goals`/`barter_offers` should move into `structuredStore` schema wholesale** — decided yes in principle (single schema boundary), details deferred to design.
- **Whether the event-id content hash should include `endTurnIndex`** — the current hash (`memoryManager.js:119-120`) omits the turn index, so two identical summaries collapse to the first turn's row and a later rollback won't delete it. Flagged; needs a decision.
- **Whether offers/goals should gain their own `turn_index` column for rollback** — tables currently have no turn column, so "delete rows with turn_index >= N" needs a schema addition or a batch-tracked write.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| schema boundary | A single module that declares a table and its access methods | A raw `db` handle shared between modules |
| canonical matching | Item-name equality via `normalizeItemName` / `itemNamesMatch` (`itemNames.js`) | Case-insensitive SQL `LOWER()` equality |
| rollback surface | The set of stores a turn write can touch (events, inventory, lore, offers, goals) | Only the two tables rollback touches today |
| undo contract | The recorded contract in `make-undo-and-trades-consistent`: rollback must undo everything a turn wrote | Undoing only history |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — in-repo SQLite work; no external code) | — | — | 2026-08-03 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| `structuredStore` owns barter/quest tables + canonical matching methods | Adopt | One place for "do I hold this item?" and "what tables exist"; kills the raw-`db` reach-ins | 2026-08-03 |
| `barterEngine` becomes a thin state machine over the schema | Adopt | Keeps goal/trade semantics without hand-rolled SQL | 2026-08-03 |
| Add `turn_index` to offers/goals/lore for rollback | Open | Needed for full-surface rollback; schema migration cost to assess | 2026-08-03 |

## Patterns adopted

From prior in-repo work: `structuredStore.executeTrade`'s atomic-transaction pattern (`#7`, archived `2026-07-27-harden-inventory-sqlite-rag`) and the single `rollbackTurns` entry point from `make-undo-and-trades-consistent`. `itemNames.js` is the shared leaf both matching regimes should route through.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Two `BarterEngine` instances per engine | `memoryManager.js:19` and `engine/index.js:69`; the second reassigns `this.memory.barter` | Code read | 2026-08-03 | stable |
| `quest_goals`/`barter_offers` SQL in three modules | `barterEngine.js:10-33`, `structuredStore.js:289-290`, `memoryManager.js:250-252` | Code read | 2026-08-03 | stable |
| `barterEngine` queries via raw `db` handle | `this.store.db.prepare(...)` across `barterEngine.js` | Code read | 2026-08-03 | stable |
| `hasItem`/`executeTrade` use exact `LOWER()` equality | `structuredStore.js:159-175` | Code read | 2026-08-03 | stable |
| `_findHeldItem`/offer lookup use canonical `itemNames` | `barterEngine.js:63,82-87` | Code read | 2026-08-03 | stable |
| `rollbackTurn` touches only `events` + `inventory` | `structuredStore.js:247-267` | Code read | 2026-08-03 | stable |
| `_extractAndStore` writes lore/offers/goals at the same batch turn | `memoryManager.js:117-299` | Code read | 2026-08-03 | stable |
| Score recompute makes undo score-safe | `engine/index.js:187` after `rollbackTurns` | Code read | 2026-08-03 | stable |

## Unverified assumptions

- **That `completeGoal` can fail on spelling mismatch today.** Derived from code read (exact `hasItem`), not reproduced live. A quick goal-with-"the X" repro belongs in the test scaffolding (TDD) before implementation.
- **That no existing row in `game/data/*.db` depends on the current two-regime matching.** Migrations for existing adventures are out of scope for the change but must be checked before shipping.

## Superseded claims

- **"Rollback and undo are consistent."** Superseded by code read: rollback covers events+inventory only; lore/offers/goals written at the same turn survive an undo. The `make-undo-and-trades-consistent` tests only assert events/inventory/RAG, so the gap is invisible to the suite.

## Links out

- `engine/memory/structuredStore.js:159` — `hasItem` / `:166` `executeTrade`
- `engine/memory/structuredStore.js:247` — `rollbackTurn`
- `engine/memory/barterEngine.js:10` — `_initSchema`
- `engine/memory/barterEngine.js:63,82` — canonical matching
- `engine/memory/memoryManager.js:19` — first `BarterEngine`
- `engine/memory/memoryManager.js:250` — raw goal dedup SQL
- `engine/index.js:69` — second `BarterEngine`
- `engine/memory/itemNames.js` — canonical matching leaf
- `openspec/changes/make-undo-and-trades-consistent/research.md` — recorded undo contract
- `openspec/specs/barter-system/spec.md`, `openspec/specs/inventory-system/spec.md` — capabilities
