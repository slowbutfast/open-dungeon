## Why

The spatial room graph (archived `spatial-map-region-graph`) is live, hardened, and verified through unit/MCP suites and mock + live playtests. `GET /api/map` and `dungeon_inspect_map` expose the raw graph, but it is only *inspectable* — a player or agent cannot *see* the world or *plan through* it. This change turns the persisted graph into two usable surfaces: a visual map (cartographic + node-graph modes) and deterministic pathfinding (BFS routing to answer "how do I get back to X"). Both consume the existing `rooms`/`exits`/`room_visits` tables and `computeRegions` — no new storage, no new dependencies.

## What Changes

- **Frontend map panel** (`web/static/js/ui/`), fed by the existing `GET /api/map`:
  - **Cartographic mode**: rooms as regions, walk edges drawn as paths, portal/time edges as distinct arrows, inferred edges dashed; `computeRegions` drives layout so disconnected regions cluster separately.
  - **Node-graph mode**: nodes (rooms) + edges with direction/kind/inferred labels, current room highlighted.
  - Toggle between modes; current room + visited state shown from `last_visit_turn`/`visit_count`.
  - Zero-build vanilla JS (canvas/DOM render, no graph library).
- **Pure pathfinding module** (`engine/memory/pathfinding.js`):
  - BFS over **walk edges only** (region-respecting) → returns the ordered route (room → direction → room), step count, and "no known route" when the target is in a different region with no portal.
  - Optional portal-admitting search for cross-region routes, surfacing the mechanism label.
  - **Time edges excluded from routing** (narratively odd); a decision in the open questions.
  - Never fabricate connectivity — a path exists only over edges actually recorded.
- **New API/MCP surface**:
  - `GET /api/path?to=<roomId>` (and optionally `?from=<roomId>` for arbitrary pairs).
  - `dungeon_path_to` MCP tool, reusing the shared read-through freshness pattern.
- **`AdventureEngine.getPath(...)` / `getPath` proxy** — thin over the pure module, mirroring `getMap`/`getRoom`.

## Capabilities

### New Capabilities
- `spatial-pathfinding`: deterministic BFS routing over the recorded room graph (walk-edges-only, region-aware, never fabricates connectivity).
- `spatial-map-visualization`: frontend render of the room graph in cartographic and node-graph modes.

### Modified Capabilities
- `mcp-server`: add `Spatial Pathfinding Tools` requirement (`dungeon_path_to`).

## Impact

- `engine/memory/pathfinding.js` — **new pure module**: BFS (walk-only + optional portal), route assembly, region-aware "no route" signal.
- `engine/index.js` — `getPath(fromRoomId, toRoomId)` proxy (thin over the pure module; no reconciliation change).
- `web/routes/game.js` — `GET /api/path` (reusing read-through freshness); `GET /api/map` unchanged (visualization already consumes it).
- `mcp/tools/` — new pathfinding tool (extend `map.js` or new `path.js`); register in `mcp/tools/index.js`.
- `web/static/js/ui/` — new map panel (cartographic + node-graph modes, toggle, current-room highlight); wired into the screens.
- Tests: pure BFS unit tests (walk-only, portal-admit, region split, no-route), MCP tool tests, `GET /api/path` tests, frontend render smoke (e2e).
- No new dependencies.
