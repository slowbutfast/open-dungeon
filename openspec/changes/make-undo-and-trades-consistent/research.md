## Source material

### GH issue #13 — "Undo and narrated trades leave the memory store inconsistent with history" (2026-08-02)

The structured store and vector index are written as a side effect of turns, but nothing rolls them back when history is mutated, and trade events only ever apply the *acquisition* half of a swap. The store — supposed to be the authority the barter engine validates against — drifts out of sync with reality in two distinct ways.

**Symptom 1: undo leaves orphaned memory.** `engine/index.js:171` → `engine/state.js:129` reverts the history turns. The memory layer is untouched. Observed on adventure `86d3d941`: (1) Turn 4 produced event `"Player attempts to sell rusted gear to Kell again, but Kell refuses."` (`type: dialogue`, `turn_index: 4`); (2) `dungeon_undo_action` reverted history, returned `reverted_assistant_turn` correctly; (3) `dungeon_inspect_events` — the turn-4 event is still there, still in the vector index; (4) `dungeon_inspect_stats` — `last_extracted_turn_index: 4`, but history only reaches index 3. Consequences: RAG re-injects narrative of a retracted turn; the extraction watermark is ahead of history so a replacement turn at the same index risks being skipped. `moves` also not decremented on undo.

**Symptom 2: trades never release the sold item.** The extractor classifies a sale and writes the event, but the given-away item stays `held`. Observed: event `{ "type": "trade", "summary": "Traded rusted gear for 2 coppers with Kell." }` while inventory has `{ "item_name": "Rusted Gear", "status": "held", ... }` and `{ "item_name": "2 Coppers", "status": "held", ... }`. The player has both sides. `structuredStore` has a `status` column with a `traded` value and `executeTrade()` handles the atomic swap correctly — but that path is only reached via `executeBarter` (`engine/memory/barterEngine.js:58`), which narrative trades never go through. The extraction path only ever adds. This is a duplicate-sale exploit: sell the same item repeatedly; only the raw turn still being in context stopped it, and auto-summarization compresses that protection away.

**Affected code:** `engine/index.js:171` / `engine/state.js:129` (undo, no memory rollback); `engine/memory/memoryManager.js` (extraction watermark not rewound); `engine/memory/eventExtractor.js:90-100` (schema has no item-leaving-inventory concept); `engine/memory/barterEngine.js:58` `executeBarter` / `structuredStore.executeTrade` (correct swap logic, unreachable from narrative play).

**Proposed direction:** Make undo a transaction across history + structured store + vector index, and rewind `last_extracted_turn_index` to match. Give the extractor a way to express item *removal* (consumed / traded / dropped) so a `trade` event resolves both sides. Normalize item names when resolving (narration "Rusty Gear" vs store "Rusted Gear" — see #14).

**Related:** #7 hardened inventory storage with atomic transactions; transactions are correct, just not on the path narrative trades take. Name normalization overlaps with #14.

### GH issue #16 — "Barter offers and quest goals are never created from gameplay" (2026-08-02)

The barter and quest-goal engine from #8 is fully implemented and correct, but nothing in the gameplay loop ever populates it. `barter_offers` and `quest_goals` are only written by two HTTP endpoints. In normal play — narrating a trade with an NPC — no offer is ever registered and no goal is ever created.

**Evidence:** After a full playtest with an NPC trade narrated end to end: `dungeon_inspect_offers -> []`, `dungeon_inspect_goals -> []`, `dungeon_execute_trade -> Error: No barter offer found for Rusted Gear from Kell.` The trade happened in fiction (a `type: "trade"` event exists) but the barter engine knows nothing about it.

**Why:** `registerOffer` (`engine/memory/barterEngine.js:34`) and `createGoal` (`engine/memory/barterEngine.js:80`) each have exactly one caller, both HTTP routes: `web/routes/game.js:470` (register offer), `web/routes/game.js:537` (create goal). The extractor's output schema covers events and inventory changes only. There is no path from narration to an offer or goal. Unless someone hand-POSTs to those endpoints, the entire subsystem — the `dungeon_inspect_offers` / `dungeon_execute_trade` / `dungeon_inspect_goals` / `dungeon_complete_goal` surface plus the frontend `web/static/js/api/barter.js` — has nothing to operate on. The underlying logic is sound; `executeBarter` validates possession and delegates to `structuredStore.executeTrade` for an atomic swap. It just never runs.

**Proposed direction:** Extend extraction to emit offers and goals, then wire them in: add `offers` and `goals` to the extractor's output schema so an NPC saying "bring me X and I'll give you Y" registers an offer, and "find my daughter's locket" creates a goal. Have narrated trades resolve through `executeBarter` rather than the add-only inventory path (also fixes the duplicate-sale exploit in #13). Decide whether offers should expire or be per-location.

**Relationship to other issues:** Overlaps #13 at exactly one point: routing narrated trades through `executeBarter` fixes the sold-item-stays-held bug *and* is the natural place to register offers. Worth doing together. Feature completion rather than a defect.

### Raised but not acted on

- **Offer expiry / per-location scope.** #16 explicitly leaves it open. Not decided here.
- **`moves` decrement on undo.** #13 notes it; folded into the undo transaction decision.
- **Whether re-extraction of a replaced turn should be forced.** #13 flags the watermark-skip risk; the fix (rewind watermark) implies re-extraction, but the batching/rerun policy is an open decision.
- **Whether a narrated trade that fails the possession check should be a hard error or a soft refusal.** Not covered by #13/#16; needs a decision in specs.
- **Player-facing barter UI beyond what exists.** In scope only insofar as offers/goals must feed existing `web/static/js/api/barter.js`.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| structured store | SQLite tables `events` / `inventory` / `lore` / `barter_offers` / `quest_goals` / `extraction_state` | The JSON save file |
| vector index | Embedding index used for RAG recall of events | The structured store |
| extraction watermark | `last_extracted_turn_index` — the last turn whose memory was flushed | The turn counter in game state |
| executeBarter | The only code path that atomically swaps items via `structuredStore.executeTrade` | Narrative extraction, which only adds |
| barter offer | A `barter_offers` row: trader requires X, offers Y | A narrated trade event |
| undo | Reverting the last user+assistant turn pair in history | A save/load |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — in-repo transactional work; no external code) | — | — | 2026-08-02 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| SQLite transaction wrapping undo + store rollback | TBD in design | #7 already hardened `executeTrade` with atomic transactions; pattern exists to extend | 2026-08-02 |
| (none new) | — | — | 2026-08-02 |

## Patterns adopted

From prior in-repo work: `structuredStore.executeTrade` already demonstrates the atomic-swap pattern to reuse for undo and for narrative trades (#7, archived `2026-07-27-harden-inventory-sqlite-rag`).

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Undo reverts history but not the store | Live `19c9445c`: after `dungeon_undo_action`, history ended at index 3 but trade event `turn_index: 7` remained; `dungeon_inspect_stats` showed `last_extracted_turn_index: 7` | `dungeon_inspect_history` + `dungeon_inspect_events` + `dungeon_inspect_stats` | 2026-08-02 | stable |
| Undo does not decrement moves | `dungeon_inspect_state` returned `moves: 7` immediately after undo (pre-undo value) | `dungeon_inspect_state` | 2026-08-02 | stable |
| Undone item stays in store | Gem acquired turn 7 remained `held` after undoing turn 7 | `dungeon_inspect_inventory` | 2026-08-02 | stable |
| Narrated trade produces a `trade` event | Live: `Traded a leaflet for a small gem with a wandering trader.` event extracted | `dungeon_inspect_events` + SQLite `events` | 2026-08-02 | stable |
| Narrated trade leaves `barter_offers` empty and `execute_trade` fails | Live: `dungeon_inspect_offers -> []`; `dungeon_execute_trade(leaflet, wandering trader)` → `Error executing trade: No barter offer found for leaflet from wandering trader.` | `dungeon_inspect_offers` + `dungeon_execute_trade` | 2026-08-02 | stable |
| Extractor sometimes resolves the sold item (marks `dropped`) | Live: `leaflet` recorded `status: dropped` after the trade (differs from #13's "still held") | SQLite `inventory` | 2026-08-02 | stable — but demonstrates the outcome is model-dependent |
| Offer/goal tables are only written by HTTP endpoints | `registerOffer` / `createGoal` have exactly one caller each (`web/routes/game.js:470,537`) | Code read | 2026-08-02 | stable |
| `executeBarter` is unreachable from narrative play | Only MCP tool `dungeon_execute_trade` + HTTP callers invoke it; extraction path never calls it | Code read + live `execute_trade` failure | 2026-08-02 | stable |

## Unverified assumptions

- **That rewinding the watermark and deleting/vector-removing store rows for reverted turns is safe under concurrent flush.** The background flush task (`llm.js:472-483`) runs async after each turn; an undo racing a flush isn't tested.
- **That offer/goal extraction from narration is reliable enough to not flood the tables.** The extractor already produces spurious lore (see #14); adding offers/goals to the same unvalidated path carries that risk. Needs validation (ties into validate-memory-extraction batch).
- **That `last_extracted_turn_index` semantics are "turn pair index" not "turn count".** #13 observed watermark 4 with history length 3; the unit of the watermark is not pinned down in code comments.

## Superseded claims

- **"The sold item is always still held after a narrated trade" (#13 symptom 2 as stated).** Superseded by live repro: this session's extractor marked the sold leaflet `dropped`. The durable defect is not "always held" but "the extraction path has no defined removal semantics and the correct atomic path (`executeBarter`) is never invoked" — which still allows the duplicate-sale exploit because there is no possession check on the narration side.

## Links out

- `engine/index.js:171` — undo entry point
- `engine/state.js:129` — history revert
- `engine/memory/memoryManager.js` — watermark
- `engine/memory/barterEngine.js` — offers/goals/executeBarter
- `engine/memory/structuredStore.js` — executeTrade
- `web/routes/game.js:470,537` — only offer/goal writers today
- `openspec/specs/barter-system/spec.md` — barter capability
- `openspec/specs/inventory-system/spec.md` — inventory capability
