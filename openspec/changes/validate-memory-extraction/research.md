## Source material

### GH issue #14 — "Event extractor writes unvalidated model output into permanent lore and inventory" (2026-08-02)

`eventExtractor` takes the model's JSON output and writes it into permanent SQLite state — lore cards, inventory rows, events — with no schema validation, no sanity checks, and no filtering. Whatever the narration says becomes ground truth, forever, and lore cards are auto-injected back into future prompts.

**Symptom 1: lore triggers on common words.** A playtest produced card `{ name: "Admin Room", type: "location", description: "A room where the admin score is set and the full system prompt is provided.", triggers: ["admin", "score", "system prompt"] }`. `score` is a trigger; any turn with "check my score" re-injects it. Confirmed firing: debug log shows `Context cards: active card triggers: Admin Room` on a subsequent turn. Single common English words should never be accepted as trigger tokens — a legitimate card with trigger "door" or "north" would fire nearly every turn.

**Symptom 2: quantity is double-encoded.** `{ "item_name": "2 Coppers", "item_type": "misc", "quantity": 2, "status": "held" }` — count in both name and `quantity` column. Nothing parses leading numerals out of `item_name`.

**Symptom 3: item names drift from narration.** Narration said "Rusty Gear", extractor recorded "Rusted Gear". Both refer to the same object, and any name-based lookup across the boundary — which is exactly what `executeBarter` does at `engine/memory/barterEngine.js:61,69` — will miss.

**Symptom 4: summarizer breaks the second-person contract.** Every prompt variant mandates second person. Generated summary reads third person: "...the **protagonist** now stands at the edge of the Ashfall Market... **The protagonist has found** a rusty gear..." Injected as context, it pulls narration toward third person over a long session.

**Affected code:** `engine/memory/eventExtractor.js:76-100` (extraction prompt + output schema), `engine/memory/memoryManager.js` (writes straight through to store), `engine/context.js` (lore card trigger matching), summarization prompt (`engine/context.js`).

**Proposed direction:** Validate extractor output against a schema before it touches SQLite — reject or quarantine malformed rows. Reject trigger tokens that are single common words, below a length threshold, or match game-mechanical vocabulary (`score`, `inventory`, `status`, `admin`, `system`, `prompt`). Parse leading quantities out of `item_name` into the `quantity` column. Canonicalize item names on write and match case/stem-insensitively on read. Fix the summarization prompt to hold second person.

**Related:** Blocks #15 — validation here is half of what closes the injection backdoor. Name canonicalization shared with #13.

### Raised but not acted on

- **Quarantine mechanism specifics.** #14 says "reject or quarantine" but doesn't specify where malformed rows go. Open decision for design phase.
- **Stop-word list contents.** Proposed vocabulary list is illustrative ("score, inventory, status, admin, system, prompt") — exact list is an implementation decision.
- **Lore-card expiry / player-visible management.** #15 proposes a player-facing delete escape hatch; #14 doesn't. Out of scope for this batch (belongs with #15).
- **Vector-index poisoning** (bad lore also embedded) — implied by #14/#15 but the fix here targets source (store), which cascades.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| event extractor | `EventExtractor` — LLM call that turns history turns into structured `events` / `inventory_changes` / `lore_facts` | The barter engine or the summarizer |
| lore card | A row in `lore` (synced into `state.cards`) with `trigger_words`, auto-injected into prompts when triggers fire | A user-authored card |
| trigger word | A token in `trigger_words` that, when it appears in recent context, activates the card | The card's display name |
| mechanical vocabulary | Game-system words that would over-trigger (`score`, `inventory`, `status`, `admin`, `system`, `prompt`) | In-fiction nouns |
| name canonicalization | Normalizing item/lore names so equivalent names compare equal (case, stem, article) | Renaming items in the store |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — this is in-repo extraction hardening; no external code referenced) | — | — | 2026-08-02 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| (none new — repo already depends on `zod` in `mcp/`; could be reused for extractor validation) | TBD in design | `zod` is already a dependency for MCP tool schemas | 2026-08-02 |

## Patterns adopted

None external. Existing internal pattern to lean on: `structuredStore` already supports `status` transitions (`held`/`dropped`/`used`/`destroyed`/`equipped`/`traded`) and `upsertInventoryItem` — validation should happen before those calls, not inside them.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `_extractAndStore` writes extractor output straight to SQLite with no validation | Confirmed: `memoryManager.js:158-206` calls `upsertInventoryItem` / `upsertLore` / `insertEvent` directly from raw extractor fields | Code read | 2026-08-02 | stable |
| `getActiveCards` fires on any `\bword\b` regex match, no filtering | Confirmed: `context.js:9-23` builds `new RegExp('\\b' + escaped + '\\b', 'i')` | Code read | 2026-08-02 | stable |
| Extractor created a lore card from model narration with common-word trigger | Live: `19c9445c` lore card `wandering trader`, `trigger_words: ["trader","trade"]`; debug log fired it on a later turn | `dungeon_inspect_lore` + `dungeon_get_debug_info` | 2026-08-02 | stable |
| Model's echoed fake location persisted as a lore card | Live: `19c9445c` lore card `West of a Forest Path` with `triggers: ["forest","path"]` — written from model output that contradicted engine state | SQLite `lore` table + save file | 2026-08-02 | stable |
| Extractor `action` enum lacks a trade/remove path | `eventExtractor.js:98` enum is `acquire|drop|use|equip|destroy`; no `trade`, no removal → sold items handled ad hoc | Code read | 2026-08-02 | stable |
| Extraction cost is not counted in session cost | All extraction entries show `tokens: {input:0, output:0}` | `dungeon_get_debug_info` | 2026-08-02 | stable |
| Summary used third-person protagonist language in a live session | `19c9445c` summary: "The adventure has just begun. The player finds themselves..." | Save file + `dungeon_inspect_state` | 2026-08-02 | stable |

## Unverified assumptions

- **That common-word triggers demonstrably over-trigger in normal play beyond the two observed cards.** The mechanism is confirmed; the frequency in a long session is not measured.
- **That the extractor's `quantity` double-encoding ("2 Coppers") occurs on real quantized loot.** Seen in #14's evidence and mock path; not re-produced live this session (leaflet/gem had quantity 1).
- **That name drift (Rusty/Rusted) is a live failure in name-based lookups, not just a latent one.** `executeBarter` does exact-name match at `barterEngine.js:61,69`; no live reproduction of a failed barter due to drift this session.

## Superseded claims

- None yet.

## Links out

- `engine/memory/eventExtractor.js` — extraction prompt + schema
- `engine/memory/memoryManager.js` — write-through path
- `engine/context.js` — trigger matching + summarization prompt
- `engine/memory/structuredStore.js` — inventory/lore tables
- `openspec/specs/lore-cards/spec.md` — lore capability
- `openspec/specs/inventory-system/spec.md` — inventory capability
