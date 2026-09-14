## Automated Tests

- `node --test tests/unit/pathfinding.test.mjs`: the pure routing matrix — within-region shortest route, directed asymmetry (A→B does not imply B→A), inferred reverse edges routable and stamped, null-direction edges routable with a fallback label, time edges not routable, cross-region `different_region`, same-region `no_route`, zero-step self-route, unknown-id null, and deterministic ordering across repeated calls.
- `node --test tests/unit/spatialIntegration.test.mjs`: an end-to-end route over the scripted-narrator four-room graph — drives the real turn-commit path, then asserts `engine.getPath(...)` returns the expected ordered steps (with names resolved) and the deterministic return route.
- `python -m pytest tests/test_mcp_spatial.py`: `dungeon_path_to` payload shape, default origin, unknown-room error, read-through freshness, and the tool-count gate (`test_mcp_protocol.py` bumped to 21).
- `python -m pytest tests/test_api_endpoints.py`: `GET /api/path` shape for `to`-only (defaults to current room), explicit `from`, and 404 for an unknown target.
- `python -m pytest tests/e2e/test_map_render.py` (Playwright): the map panel renders from `/api/map`, the mode toggle switches render modes, and the current room is highlighted.

## Manual Verification

- **Map panel — cartographic mode**:
  - **WHEN** the player opens the MAP tab after exploring several rooms
  - **THEN** walk-connected rooms cluster, walk edges render as paths, portal/time edges as distinct arrows, inferred edges dashed, and the current room is highlighted

- **Map panel — node-graph mode and toggle**:
  - **WHEN** the player toggles the render mode
  - **THEN** the panel re-renders as a labelled node graph (direction/kind/inferred) without losing data

- **Map panel — empty state**:
  - **WHEN** a fresh adventure with no rooms opens the MAP tab
  - **THEN** the panel renders an empty state, not an error

- **Map panel — refresh**:
  - **WHEN** a turn commits and moves the player
  - **THEN** the MAP tab reflects the new room and any new edges on the next view

- **Route via MCP**:
  - **WHEN** an agent calls `dungeon_path_to` for a previously visited room
  - **THEN** the returned route matches the traversed path (including inferred return legs), and a cross-region target with no portal returns `different_region`

- **Mobile viewport**:
  - **WHEN** the gameplay screen is viewed at a mobile viewport
  - **THEN** the MAP panel is reachable from the mobile tab bar and renders legibly

- **Edge-density gate (pre-build for the visualization slice)**:
  - **WHEN** a natural Wanderer playtest runs against current HEAD
  - **THEN** `/api/map` shows enough walk edges for routing to be meaningful (not just rooms); record room and edge counts as the acceptance evidence
