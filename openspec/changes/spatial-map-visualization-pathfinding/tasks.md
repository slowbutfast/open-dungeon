## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing `tests/unit/pathfinding.test.mjs` for Deterministic Route Planning: within-region shortest route, directed asymmetry, inferred edges routable + stamped, null-direction edges routable, time edges excluded, cross-region `different_region`, same-region `no_route`, zero-step, unknown-id null, deterministic ordering
- [x] 1.2 Write failing tests for Route Result Payload: found shape (steps with names/kind/inferred), not-found shape with reason
- [x] 1.3 Write failing tests for Route API Surface: `engine.getPath` proxy (default/explicit/unknown) and `GET /api/path` (to-only, explicit from, 404)
- [x] 1.4 Write failing tests for Spatial Pathfinding Tools: `dungeon_path_to` shape, default origin, unknown-room error, freshness; bump the tool-count gate to 21
- [x] 1.5 Write failing frontend tests for the Map Panel: render from `/api/map`, mode toggle, current-room highlight, empty state (e2e smoke)

## 2. Pathfinding Module (Slice A)

- [x] 2.1 Implement `engine/memory/pathfinding.js`: build adjacency from raw `getEdges` rows, sorted by `(direction ?? '', to_room)`
- [x] 2.2 Implement directed walk-only BFS: traverse `kind='walk'` in the recorded direction, include null-direction edges, stamp `inferred` per step, exclude portal/time
- [x] 2.3 Implement route assembly: ordered steps, step count, `from === to` zero-step success, `null` for unknown ids
- [x] 2.4 Implement failure classification via `computeRegions`: `no_route` vs `different_region`
- [x] 2.5 Resolve `from_room_name` / `to_room_name` at the payload boundary

## 3. Engine Proxy (Slice A)

- [x] 3.1 Add `AdventureEngine.getPath(fromRoomId, toRoomId)` in the spatial proxy block, feeding raw `getEdges()` rows; return `null` for unknown ids
- [x] 3.2 Add the end-to-end route test over the scripted-narrator four-room graph

## 4. MCP Tool (Slice A)

- [x] 4.1 Register `dungeon_path_to(to, from?)` in `registerMapTools` (`mcp/tools/map.js`), reusing `forceFlushBeforeRead`; `from` defaults to the current room
- [x] 4.2 Map `null` → thrown `Room '<id>' not found`
- [x] 4.3 Bump `EXPECTED_TOOLS` and the count assertion in `tests/test_mcp_protocol.py` to 21

## 5. HTTP Endpoint (Slice A)

- [x] 5.1 Add `GET /api/path?to=&from=` beside `GET /api/map` in `web/routes/game.js`, reusing `forceFlushBeforeRead`; `from` defaults to the current room
- [x] 5.2 Return 404 with an error body for an unknown target room
- [x] 5.3 Add HTTP shape tests (to-only, explicit from, 404)

## 6. Frontend Map Panel (Slice B)

- [x] 6.1 Add `web/static/js/api/map.js` client fetching `/api/map`
- [x] 6.2 Implement `web/static/js/components/mapPanel.js` with both render modes, the toggle, current-room highlight, visited state, and an empty state (renderer per the D6 decision)
- [x] 6.3 Add the MAP sidebar tab and mobile-tab entry in `web/templates/index.html`, wired through `switchSidebarTab`
- [x] 6.4 Refresh the panel through the existing post-turn render cycle in `web/static/js/api/streaming.js`
- [x] 6.5 Add the e2e render smoke

## 7. Regression & Verification

- [x] 7.1 Run `node --test tests/unit/pathfinding.test.mjs tests/unit/spatialIntegration.test.mjs` — green (23/23)
- [x] 7.2 Run the MOCK_LLM pytest set (`test_mcp_spatial.py`, `test_mcp_protocol.py`, `test_api_endpoints.py`) — green (51 passed)
- [x] 7.3 Run the e2e map-render smoke — green (4 passed)
- [~] 7.4 Run the Wanderer edge-density playtest (the pre-build gate) and record room/edge counts — scripted-mock proxy run: 14 turns → 10 rooms / 19 walk edges (12 confirmed, 7 inferred), 1 region, density 1.9 edges/room (`game/playtest/results-edge-density-gate.json`). No LLM API key in this environment, so the live-model half still needs a human/keyed run

## 8. Docs & Spec Sync

- [x] 8.1 Update `engine/ARCHITECTURE.md` (routing module + proxy + surfaces)
- [x] 8.2 Update `web/FRONTEND_ARCHITECTURE.md` (map panel + refresh seam)
- [ ] 8.3 Sync the capability specs on archive and author `verification.md`
