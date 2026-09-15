## Why

The spatial room graph (archived `spatial-map-region-graph`) is live, hardened, and verified through unit/MCP suites and mock + live playtests. `GET /api/map` and `dungeon_inspect_map` expose the raw graph, but it is only *inspectable* — a player or agent cannot *see* the world or *plan through* it. This change turns the persisted graph into two usable surfaces: a visual map (cartographic + node-graph modes) and deterministic pathfinding (BFS routing to answer "how do I get back to X"). Both consume the existing `rooms`/`exits`/`room_visits` tables and `computeRegions` — no new storage, no new dependencies.

## What Changes

- **Frontend map panel** (`web/static/js/components/mapPanel.js` + `web/static/js/api/map.js`), fed by the existing `GET /api/map`:
  - **Cartographic mode**: rooms as regions, walk edges drawn as paths, portal/time edges as distinct arrows, inferred edges dashed; `computeRegions` drives layout so disconnected regions cluster separately.
  - **Node-graph mode**: nodes (rooms) + edges with direction/kind/inferred labels, current room highlighted.
  - Toggle between modes; current room + visited state shown from `last_visit_turn`/`visit_count`.
  - Zero-build vanilla JS (no build step); renderer **pending** — hand-rolled canvas/DOM (default, no asset) vs a vendored ESM graph library (buys zoom/pan/selection at ~500 KB committed). Decision recorded in `architecture.md`. Mounted as a new MAP sidebar tab (and mobile-tab entry), refreshed post-turn via the existing `api/streaming.js` render cycle.
- **Pure pathfinding module** (`engine/memory/pathfinding.js`):
  - BFS over **walk edges only** (region-respecting) → returns the ordered route (room → direction → room), step count, and "no known route" when the target is in a different region with no portal.
  - Optional portal-admitting search for cross-region routes, surfacing the mechanism label.
  - **Time edges excluded from routing** (narratively odd) — locked in Decisions below.
  - **Inferred reverse edges ARE routable** — backtracking "how do I get back to X" depends on them (inferred edges are recorded, just not walked).
  - Never fabricate connectivity — BFS explores only edges actually recorded; no path is ever assumed.
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

## Decisions locked

- BFS is shortest-hop by construction on unweighted edges — this closes GH #35's "shortest-vs-first" open question (no separate shortest-path concern).
- **Time edges are excluded from routing** (narratively odd).
- **Inferred reverse edges are routable** — backtracking "how do I get back to X" depends on them (inferred edges are recorded, just not walked).
- **Walk-only for v1**; a cross-region target with no portal yields the `different_region` "no known route" signal.
- Never fabricate connectivity — BFS explores only edges actually recorded; no path is ever assumed.

**Open:** the visualization renderer (hand-rolled canvas vs a vendored graph library) — decided in `architecture.md`.

## Scope & sequencing

- **Out of scope:** the verification harness (`synthetic-narrator` world-spec mock + `spatial-playtest-verification` groundedness checker / artifact generator) — a separate change.
- **Sequencing:** implemented as two independent slices — pathfinding first, visualization second — even within this one combined change.

## Impact

- `engine/memory/pathfinding.js` — **new pure module**: BFS (walk-only + optional portal), route assembly, region-aware "no route" signal.
- `engine/index.js` — `getPath(fromRoomId, toRoomId)` proxy (thin over the pure module; no reconciliation change).
- `web/routes/game.js` — `GET /api/path` (reusing read-through freshness); `GET /api/map` unchanged (visualization already consumes it).
- `mcp/tools/` — new pathfinding tool (extend `map.js` or new `path.js`); register in `mcp/tools/index.js`.
- `web/static/js/components/mapPanel.js` — **new component** (cartographic + node-graph modes, toggle, current-room highlight), matching the `actionChips`/`barterModal` co-location convention; `web/static/js/api/map.js` client for `/api/map`; wired into the sidebar + mobile tabs and the post-turn refresh cycle.
- Tests: pure BFS unit tests (walk-only, portal-admit, region split, no-route, inferred-edge routes), MCP tool tests, `GET /api/path` tests, frontend render smoke (e2e).
- No new npm dependencies. A vendored renderer asset (~500 KB) is the only possible payload addition if the library option is chosen.

## Plan of record (OpenSpec artifacts to author)

Following the `tdd-rnd` workflow (now including the `verification.md` post-apply artifact), this change will also carry: `specs/` (two new capabilities `spatial-pathfinding` + `spatial-map-visualization`, one modified `mcp-server` requirement), `architecture.md`, `tests.md`, `tasks.md` (TDD-scaffolded, VSA vertical-slice boundaries), and a final `verification.md` (requirement-adherence matrix + 60-second re-verify command).
