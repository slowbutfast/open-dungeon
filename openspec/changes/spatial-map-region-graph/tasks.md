## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing `tests/unit/roomMap.test.mjs` for transition classification and direction parsing (Requirement: Turn-Commit Spatial Reconciliation)
- [x] 1.2 Write failing unit tests for every reconciliation decision-table branch (new discovery, re-traversal adopt, first-visit-wins canonicalization, inferred self-heal, portal/time/unknown, reversible reverse inference, one-way no-reverse)
- [x] 1.3 Write failing unit tests for canonical room name matching (Requirement: Canonical Name Matching)
- [x] 1.4 Write failing unit tests for graceful degradation when the store write fails (Requirement: Turn-Commit Spatial Reconciliation / Reconciliation never breaks the turn)
- [x] 1.5 Write failing store tests for the new tables, the per-direction uniqueness constraint, and `rollbackTurn` coverage (rooms/exits/visits) (Requirement: Persistent Room Graph / Undo-Consistent Spatial Rollback)
- [x] 1.6 Write failing tests for undo restoring the pre-turn room and old-save compatibility without `currentRoomId`

## 2. Store Schema

- [x] 2.1 Add `rooms`, `exits`, `room_visits` tables to `structuredStore.js::_initSchema` with the `UNIQUE(adventure_id, from_room, direction)` constraint
- [x] 2.2 Add store access methods: `upsertRoom`, `getRoom`, `getRooms`, `recordVisit`, `recordEdge`, `getExits`, `getInferredEdges`, and a room-name lookup
- [x] 2.3 Extend `rollbackTurn` to delete rooms (`first_turn >= N`), exits (`discovered_turn >= N`), and visits (`turn >= N`), preserving earlier/hand-created rows

## 3. RoomMap Module

- [x] 3.1 Create `engine/memory/roomMap.js` with pure `classifyTransition`, `directionFromAction`, `normalizeRoomName` / `roomNamesMatch`, and the reversibility lexicon (reversible vs one-way direction labels)
- [x] 3.2 Implement the pure `reconcile(prevRoomId, actionText, proposedName, ctx)` decision function per architecture D3, including inferred reverse-edge insertion and self-heal retraction
- [x] 3.3 Ensure `reconcile` returns the canonical location + room id and never throws on store-write failure (degrades to proposed location + log)

## 4. Turn-Commit Integration

- [x] 4.1 Add `currentRoomId` to `AdventureState` (save/load additive, null-tolerant) and expose via `engine/index.js`
- [x] 4.2 Wire the resolver into the turn-commit path in `engine/llm.js` after `parseStatusLine` / `isSuspiciousStatus` and after `state.moves += 1`; stamp rows with `state.moves`
- [x] 4.3 Keep the existing location/score/moves contract intact: canonical location committed, status line not persisted as narration
- [x] 4.4 Initialize the current room from `location` on load when `currentRoomId` is null (first turn establishes it)

## 5. Undo Integration

- [x] 5.1 In `engine.undo`, capture the pre-turn room (visits trail), call `rollbackTurns(preUndoMoves)`, then restore `state.currentRoomId` / `state.location` to the pre-turn room and save
- [x] 5.2 Confirm undo of a discovery removes the room/edge rows; undo of pure movement removes the visit and restores the prior room

## 6. MCP + API Surface

- [x] 6.1 Add `engine.getMap()` / `engine.getRoom(id)` proxies (rooms, edges, current room, region groupings)
- [x] 6.2 Create `mcp/tools/map.js` with `dungeon_inspect_map` and `dungeon_inspect_room`, reusing `forceFlushBeforeRead`; register in `mcp/tools/index.js`
- [x] 6.3 Add the optional `GET /api/map` endpoint or fold map data into `GET /api/state` per the open question

## 7. Regression & Verification

- [x] 7.1 Run `npm run test:unit` — new room/store tests green, no unit regressions
- [x] 7.2 Run `npm run test:all` — undo, MCP, status-parsing, injection-defense, and barter suites all green
- [x] 7.3 Run a mock-narration integration: scripted movement (west → north → east → south) yields the expected room graph and deterministic return path; then playtest-break the feature with the MCP playtest subagent (playtest subagent unavailable at this depth — substituted with a hands-on fresh-MCP-server playtest, 22 checks, all passed)
- [x] 7.4 Verify save/load round-trip and old-save loading (no `currentRoomId`) in a live/mock session
- [x] 7.5 Update `engine/ARCHITECTURE.md` (room graph + reconciliation + undo restore) and `tests/ARCHITECTURE.md` as needed

## 8. Playtest-Driven Fixes (multiagent sweep findings)

- [x] 8.1 **Blocker**: null-direction walk throws `NOT NULL constraint failed: exits.direction` — `engine/memory/roomMap.js:369` passes `direction = null` to `recordEdge`, but `engine/memory/structuredStore.js:141` declares `exits.direction TEXT NOT NULL`. The throw is swallowed by the `reconcile` catch-all, so directionless walks ("walk on", "go to the X", "slide down the chute") record no forward edge, no visit, and leave `currentRoomId` stale while committing the proposed location. Fix: make the direction column nullable (matching the existing `IS NULL` branches in `getEdge`/`retractEdge`/`_roomEdgeId`) or route through a sentinel label; ensure the degrade path never desyncs `location`/`currentRoomId`; add a real-SQLite integration test (the in-memory `ctx` mock in `roomMap.test.mjs` masks the constraint).
- [x] 8.2 **Blocker**: undo of the first action leaves a dangling `current_room_id` — `engine/index.js:269` guards `preUndoMoves <= 1`, but the web init path hardcodes `moves = 1` and does not spatially reconcile the greeting, so the first action is turn 2 with no prior `room_visits` trail. Undo leaves `currentRoomId` pointing at a deleted room, persisted through save/load. Fix: when there is no prior visit trail, null the id and restore the pre-turn location (or reconcile the greeting turn); add a web-path unit test mirroring the moves=1 → first action turn 2 → undo case.
- [x] 8.3 **Major**: `os`-plural stem mismatch — `roomNamesMatch('Whispering Grotto', 'Whispering Grottos')` returns false because the `SIBILANT_OR_SINGULAR` guard `/(ss|us|is|os|as)$/` blocks the trailing `-s` strip on `grotto(s)`, creating duplicate nodes. Rework the sibilant guard so genuine `-os` plurals collapse without mangling singulars like `glass`/`campus`; add `Grotto/Grottos` and `Sunken Grotto/Sunken Grottos` pairs to `roomMap.test.mjs`.
- [x] 8.4 **Minor**: degenerate self-loop edges — when a directional action's proposed name resolves back to the current room, the self-heal branch (`roomMap.js:306-321`) records a `room--dir-->room` walk edge plus its inferred reverse. Guard `target.id === prevRoomId` before growing a walk edge (never fabricate connectivity).
- [x] 8.5 Re-run the full unit + MCP suites, then re-run the playtest repros (mission B/D/F/G directionless-walk paths, mission D/E undo-first-action, mission F os-plural) to confirm the blockers are gone before archiving.
- [x] 8.6 **Blocker (regression)**: the 8.1 schema change (`exits.direction TEXT` nullable) applies only to fresh databases. Existing DBs created before the fix — including the shared `game/playtest/adventures/data/memory.db` and any production DB — still have `exits.direction NOT NULL` (SQLite `CREATE TABLE IF NOT EXISTS` never alters an existing table), so directionless walks still throw `NOT NULL constraint failed: exits.direction` and drop the forward edge via the degrade path. Add a **guarded migration** in `structuredStore.js` (mirroring `_migrateStatusTurnColumn` / `_migrateTurnIndexColumns`) that detects a NOT NULL `direction` column on an existing `exits` table and rebuilds it as nullable (SQLite cannot `ALTER COLUMN` nullability — requires table rebuild: create `exits_new`, copy rows, drop, rename), then verify a directionless walk works against a stale-schema DB copy.
- [x] 8.7 **Major (multi-undo)**: `previousLocation` was a single slot written at turn commit, so undoing a MIDDLE turn left it stale and a subsequent undo of the first action restored the wrong location (the undone room's name) while `currentRoomId` was correctly null. Replace the single slot with a per-turn `locationHistory` stack (`state.js`): each committed turn pushes its pre-turn location (`llm.js`), each undo pops one and rewinds (`index.js` `_restorePreTurnRoom`). Verified by unit test + live probe: middle-undo then first-undo restores "Starting Location" at moves=1 with no dangling id.
