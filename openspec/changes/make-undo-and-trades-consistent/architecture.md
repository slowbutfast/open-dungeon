## Context

`engine/index.js:171` (undo) → `engine/state.js:129` reverts only history. The memory layer (`memoryManager`, structured store, vector index) is written by async flush after each turn (`llm.js` background task) and is never rewound. The extractor's output schema (`eventExtractor.js`) covers events + inventory *acquisitions* only — no removal concept. `barterEngine.registerOffer`/`createGoal` each have exactly one HTTP caller (`web/routes/game.js:470,537`); narrative play never reaches `executeBarter`, so trades only add and offers/goals tables stay empty. Live evidence: after a narrated leaflet→gem trade, the trade event was extracted, but `barter_offers` was empty and `dungeon_execute_trade` failed with "No barter offer found"; on undo the event/watermark stayed past history end.

## Landed state & residual gap (2026-08-03)

Most of this change has landed and is verified:
- **Transactional undo (D1)** — `engine.undo` → `memoryManager.rollbackTurns` removes events/inventory/lore/offers/goals rows + vectors for turns >= N, rewinds the watermark, recomputes score; awaited flush before rollback. Full-surface rollback was consolidated in #27 (`memory-schema-boundary`).
- **Narrated trades (D2)** — classified trades route through `barterEngine.executeBarter`; the sold item is released and re-trading fails possession (duplicate-sale closed).
- **Offers/goals from narration (D3)** — `offers`/`goals` extraction feeds `registerOffer`/`createGoal`; the existing tool surface operates during normal play.
- **Name normalization (D4)** — shared canonical `itemNamesMatch` used on write and read.

**Residual gap (found by the 2026-08-03 parallel playtest sweep, mock):** inventory rollback is keyed solely on `acquired_turn >= N`. Two undo-after-trade cases fail:
1. **#22** — a row re-acquired on the undone turn keeps its ORIGINAL `acquired_turn` (the `upsertInventoryItem` conflict path never refreshes it), so `DELETE ... acquired_turn >= N` misses it and the item is still held after undo.
2. **Trade-undo limbo (NEW)** — undoing a trade deletes the newly-acquired row but leaves the sold item's status as `traded` (a status mutation made on the undone turn to a pre-existing row), so the player permanently loses the item instead of getting it back.

Both stem from `rollbackTurn` never reverting **status mutations** made on the undone turn to rows that predate it.

## System Architecture Diagram

```mermaid
flowchart LR
    subgraph Play
        Turn[Turn completes]
        Flush[memoryManager.flushIfReady - async]
        Undo[engine.undo]
    end
    subgraph Memory
        Extract[eventExtractor]
        Store[(structuredStore SQLite)]
        Vec[(vector index)]
        Watermark[last_extracted_turn_index]
    end
    subgraph Barter
        BE[barterEngine]
        Offers[(barter_offers)]
        Goals[(quest_goals)]
    end

    Turn --> Flush
    Flush --> Extract
    Extract --> Store
    Store --> Vec
    Flush --> Watermark
    Undo -->|"transaction: remove rows + vectors, rewind watermark, moves--"| Store
    Turn -->|narrated trade| BE
    BE --> Offers
    BE --> Goals
    BE --> Store
```

## Goals / Non-Goals

**Goals:**
- Undo is atomic across history + store + vector + watermark + moves.
- Narrated trades resolve through `executeBarter` (possession check + atomic swap), closing the duplicate-sale exploit.
- Offers and goals are created from narration, populating the existing tool surface.
- Extraction can express item removal.

**Non-Goals:**
- Not reworking the barter UI/frontend beyond what's needed for offers/goals data.
- Not implementing offer expiry/per-location scoping (#16 explicitly left it open — decision deferred).
- Not the extractor validation/trigger filtering itself (that is `validate-memory-extraction`), though name normalization is shared.

## Decisions

**D1 — Undo as a transaction in `memoryManager` (new `rollbackTurns(turnIndex)`).**
Called from `engine.undo` after history revert. Removes events/inventory/lore rows with `turn_index >= undoneTurn`, deletes their vector ids, and sets `last_extracted_turn_index = undoneTurn - 1`. `moves` decremented by the caller. *Alternative rejected:* full snapshot/restore — heavier and risks divergence; targeted row removal matches the per-turn storage model.

**D2 — Narrated trades route through `executeBarter`.**
When the extractor classifies a trade, invoke `barterEngine.executeBarter` (validate possession, atomic swap) instead of the add-only upsert. This is the single change that fixes both the sold-item-retention and offer-registration gaps. *Alternative:* teaching extraction to remove directly — doesn't validate possession, so it wouldn't close the exploit.

**D3 — Extend the extractor output schema with `offers`, `goals`, and removal-capable inventory changes.**
`inventory_changes[].action` gains `traded` (removal); new top-level `offers`/`goals` arrays feed `registerOffer`/`createGoal`. Reuses the validation from `validate-memory-extraction`. *Risk:* the extractor may over-emit offers/goals → mitigated by validation and by the observed-narration gating in the extraction prompt.

**D4 — Name normalization helper shared with `validate-memory-extraction`.**
One canonical-match helper used by both `executeBarter` lookups and extraction writes, so narrated "Rusty Gear" resolves to stored "Rusted Gear". Coordinate implementation with that change.

**D5 — Inventory rollback must revert status mutations, not just delete acquired rows.**
The residual gap is that `rollbackTurn` deletes inventory rows by `acquired_turn >= N` only, so (a) a row re-acquired on the undone turn is missed (#22) and (b) a status flip (`traded`/`dropped`/`used`/`equipped`) made on the undone turn to a pre-existing row is never undone (trade-undo limbo). The fix SHALL track the per-row status change per turn — a `status_turn` column (or a per-turn inventory status journal) written by `upsertInventoryItem` whenever it mutates an existing row's status — and `rollbackTurn` SHALL (i) delete rows whose (re-)acquisition happened on the undone turn, and (ii) restore to `held` any pre-existing row whose status was mutated on the undone turn. *Alternative rejected:* only refreshing `acquired_turn` on re-acquire — fixes #22 but not the limbo; the two cases need one mechanism.

## Risks / Trade-offs

- **[D1 undo vs concurrent flush]** → The background flush may be mid-flight during undo. Mitigation: flush (await) before undo, then roll back; document the race in tests.
- **[D2 executeBarter from narration]** → A narrated trade the model describes ambiguously may not map to a held item. Mitigation: possession validation returns a refusal instead of a crash; keep the extractor's fallback.
- **[D3 offer/goal over-emission]** → Extractor could register spurious offers. Mitigation: schema validation (ties to validate-memory-extraction) and a min-confidence/observed-narration gate.
- **[D4 normalization scope]** → Normalizing without migrating legacy rows leaves old drift. Mitigation: normalize on read too (same helper).
- **[D5 status-journal migration]** → Existing `inventory` rows predate the new `status_turn` column; a legacy row whose status was mutated pre-column has no journal entry. Mitigation: a guarded `ALTER TABLE` (mirroring the #27 migration pattern) and treat NULL `status_turn` as "never mutated by a turn" so rollback leaves those rows alone.
