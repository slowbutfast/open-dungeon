## Why

`location` today is a single free-form string committed from the narrator's status line (`engine/llm.js:610-612`) with no identity, no persistence structure, and no memory of how rooms connect. Backtracking consistency is pure narrator improv: the world is re-invented every turn, so a room can be renamed, re-described, or reconnected on each return. This change gives the engine a deterministic, persisted room graph it owns, reconciles every turn against the narrator's proposals, and exposes for inspection — so explored areas stay stable and consistent across backtracking, save/load, and undo.

## What Changes

- **Engine-owned room graph (SQLite)** — new `rooms`, `exits`, and `room_visits` tables in `structuredStore.js` (the schema owner): rooms carry an opaque id, canonical name, first/last visit turns, and visit count; exits carry `from_room`, `direction`, `to_room`, `kind ('walk'|'portal'|'time')`, an `inferred` flag, and `discovered_turn`.
- **Turn-commit spatial reconciliation** — `state.location` is no longer adopted blindly. A pure `RoomMap` module (a) classifies the transition (`walk`/`portal`/`time`/`unknown`), (b) extracts a direction from the action, (c) resolves the proposed name → node, (d) grows/retracts edges, and (e) commits the canonical location + `currentRoomId`. The narrator's status line stays the *proposal*; the engine owns the truth.
- **Deterministic backtracking via reverse inference (v1)** — traversing a reversible direction adds the implied reverse edge as `inferred=1`, so the first return trip resolves deterministically.
- **Self-healing** — a contradiction on a traversed edge canonicalizes to the known room (first visit wins); a contradiction on an *inferred* edge retracts it and grows the new edge. The map never blocks movement and never fabricates connectivity.
- **Teleport/portal/time edges** — `kind='portal'` (labeled mechanism crossing a seam, no reverse) and `kind='time'` (temporal displacement, no reverse, world-state boundary) are recorded without reverse inference; pure repositioning gets no edge.
- **`current_room_id` on state** — `AdventureState` gains `currentRoomId` (persisted additively in the save JSON); `location` remains the display name resolved from the room.
- **Undo restores the room** — `engine.undo` restores `currentRoomId`/`location` to the pre-turn room via the `room_visits` trail, fixing the existing gap where undo leaves `location` at the undone turn's value.
- **Rollback surface** — rooms/exits/visits join `rollbackTurn` (turn-indexed, `IS NOT NULL` guard) so undo removes rooms/edges discovered on the undone turn.
- **MCP inspection tools** — `dungeon_inspect_map` (rooms, edges, current room, region grouping) and `dungeon_inspect_room` (room detail, exits, linked lore), reusing the shared read-through freshness helper.
- **Prompt blocks land on the registry** — the `[MAP CONTEXT]` / re-entry anchor blocks are **phase 2**; v1 needs no new prompt blocks (the canonical `location` already flows back via `[CURRENT STATUS]`).

## Capabilities

### New Capabilities
- `spatial-map`: engine-owned room graph with deterministic per-turn reconciliation, reverse inference, self-healing edges, portal/time edge kinds, undo-consistent rollback, and inspection tooling.

### Modified Capabilities
- `game-engine`: modify `Generate Response Stream` (committed location resolves through the spatial resolver, not blind adoption) and `Undo Action` (undo restores the pre-turn room identity).
- `mcp-server`: add `Spatial Map Tools` requirement (`dungeon_inspect_map`, `dungeon_inspect_room`).

## Impact

- `engine/memory/structuredStore.js` — new `rooms` / `exits` / `room_visits` tables + access methods + rollback coverage (schema owner).
- `engine/memory/roomMap.js` — **new pure module**: `classifyTransition`, `directionFromAction`, `normalizeRoomName`/`roomNamesMatch`, `reconcile` decision logic.
- `engine/memory/memoryManager.js` — expose the RoomMap to the engine; `rollbackTurns` covers the new tables.
- `engine/state.js` — add `currentRoomId` (save/load additive, backward-compatible); `undo` retains the previous room pointer.
- `engine/index.js` — `undo` restores `currentRoomId`/`location`; expose `getMap()` / `getRoom(id)` proxies.
- `engine/llm.js` — turn-commit path calls the resolver after `parseStatusLine`/`isSuspiciousStatus`, stamps rows with `state.moves`.
- `mcp/tools/` — new `map.js` with the two tools; register in `mcp/tools/index.js`; reuse `forceFlushBeforeRead`.
- `web/routes/game.js` — optional minimal `GET /api/map` (or fold into `GET /api/state`).
- Tests: reconciliation unit tests (pure module), store rollback tests, undo-restores-room tests, MCP tool tests, mock-narration integration tests.
- No new dependencies.
