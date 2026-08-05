## Automated Tests

- `npm run test:unit` — Node test runner over `tests/unit/*.test.mjs`. New `tests/unit/roomMap.test.mjs` verifies the pure reconciliation module:
  - **Transition classification**: `walk` (directional verbs), `portal` (labeled mechanisms: archway, ship, gate), `time` (duration literals), `unknown` (no signal) classify correctly.
  - **Direction parsing**: cardinal/up/down/in/out and verb-phrases map to a direction label or null; unreversible verbs (slide, fall, teleport) return no direction for reverse inference.
  - **Reconciliation cases** (each decision-table branch): new discovery, re-traversal adopt, re-traversal with drifting name → canonicalize (first visit wins), inferred-edge self-heal (retract + grow), portal edge with no reverse, time edge with no reverse, unknown reposition with no edge, reversible direction → inferred reverse edge, one-way verb → no reverse edge.
  - **Canonical name matching**: `roomNamesMatch` resolves equivalent spellings (case/whitespace/stem) to the same room and non-matches to none.
  - **Graceful degradation**: reconcile never throws when the store context reports a write failure — it returns the narrator's proposed location.
- New `tests/unit/structuredStore.spatial.test.mjs` (or extended `structuredStore.test.mjs`) verifies:
  - Tables are created on init; `upsertRoom` / `recordEdge` / `recordVisit` round-trip.
  - `UNIQUE(adventure_id, from_room, direction)` enforces one edge per direction.
  - `rollbackTurn` removes rooms (by `first_turn`), exits (by `discovered_turn`), and visits (by `turn`) with `>= N`, and leaves hand-created/earlier rows and rows with `IS NULL`-style guards intact.
  - Old-save compatibility: loading a save without `currentRoomId` sets it to null and does not crash.
- `npm run test:all` — full pytest suite stays green, with new/extended coverage:
  - `tests/test_undo_consistency.py` (or new `tests/test_spatial_undo.py`): undo after a discovery removes the room/edge and restores `currentRoomId`/`location` to the pre-turn room; undo after pure movement removes the visit and restores the prior room.
  - `tests/test_mcp_memory.py` (or new `tests/test_mcp_spatial.py`): `dungeon_inspect_map` returns rooms/edges/current room/regions; `dungeon_inspect_room` returns room detail with outgoing/incoming edges; both reflect post-turn state (freshness).
  - `tests/test_engine_status_parsing.py` / MCP gameplay suites: committed location is canonical and `currentRoomId` stays consistent with `dungeon_inspect_state` across a multi-turn mock session (go north → backtrack south resolves to the original room deterministically).
  - `tests/test_injection_defense.py`: unchanged and green — v1 adds no new prompt blocks, so no new injection surface.
- Mock-narration integration (MOCK_LLM=1, covered by `test:all`): a scripted sequence of mock turns (e.g., west → north → east → south) produces a known room graph; asserts the map after the sequence has the expected nodes/edges and the return path resolved deterministically.

## Manual Verification

- **Backtracking consistency in a live session**:
  - **WHEN** the player explores a few rooms (walk), returns along the reverse path, then re-enters one earlier room
  - **THEN** the status strip shows the same canonical room name on every visit to that room, and `dungeon_inspect_map` shows a connected region with no duplicate nodes for the same place
- **Portal/time behavior**:
  - **WHEN** the player steps through a labeled mechanism or the narrator advances time
  - **THEN** `dungeon_inspect_map` shows a `portal`/`time` edge with no inferred reverse, and the map groups the destination as a separate region
- **Undo restore**:
  - **WHEN** the player discovers a new room and immediately undoes
  - **THEN** the status strip returns to the pre-turn room name and the new room is absent from `dungeon_inspect_map`
- **Save/load round-trip**:
  - **WHEN** an adventure with an established map is saved, the server restarts, and the adventure is loaded
  - **THEN** `dungeon_inspect_map` returns the same rooms/edges and the current room resolves to the same node
