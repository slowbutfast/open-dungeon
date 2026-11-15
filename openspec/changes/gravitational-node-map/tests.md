## Automated Tests

- `node --test tests/unit/forceLayout.test.mjs`: Using JS fixtures in `tests/unit/fixtures/mapFixtures.mjs` (including `P6_FIXTURE` and a dense hub-and-spoke graph), verifies weighted degree radius/mass scaling (hubs strictly larger than leaves, self-loops excluded from degree), zero circle-circle overlap among unpinned nodes after alpha-threshold convergence + collision pass, `walk` vs `portal`/`time` spring separation, deterministic seeded PRNG (no `Math.random()`), warm-start position preservation + pruning of removed rooms, and `idle | hover | drag | coasting` state machine transitions (including `dragEnd({ cancel: true })` and no-op re-hover).
- `node --test tests/unit/mapGeometry.test.mjs`: Verifies `formatCompactRoomName` (16-char cap, leading article stripping, ellipsis), `worldToScreen`/`screenToWorld`/`zoomAtPoint`/`computeFitViewport`, symmetric antiparallel edge curves, circle-border arrowhead trimming, and `edgeKey` matching (including `direction: null`).
- `node --test tests/unit/popoverPlacement.test.mjs`: Verifies the 8-candidate (`R, L, T, B, TR, BR, TL, BL`) obstacle-aware placement scorer avoids covering the target node, neighbor nodes, and focal edges, and clamps within viewport bounds.
- `node --test tests/unit/roomMap.test.mjs tests/unit/pathfinding.test.mjs tests/unit/structuredStore.spatial.test.mjs tests/unit/spatialIntegration.test.mjs tests/unit/spatialUndo.test.mjs`: Verifies all 77 existing backend spatial graph, pathfinding, and undo tests continue to pass unchanged.
- `python3 -m pytest tests/e2e/test_map_render.py -v` (requires `pytest` + `playwright` installed as a pre-implementation prerequisite): Verifies `.map-room[data-room-id]` rendering, `.current-room` highlight, `.map-empty` state, rewritten `getBoundingClientRect()` containment + `FIT` framing + resize re-centering, `page.clock`-driven 200 ms hover dwell (and < 200 ms fast-sweep non-trigger + 150 ms card grace), drag-pinning, wheel/button pan & zoom, keyboard accessibility (`Enter`/`Escape`), mobile bottom-sheet inspector, and `page.route`-mocked `/api/path` reachable + unreachable (`different_region`/`no_route`) + `404` cases.

## Manual Verification

- **Gravitational Settling & Hub Sizing**:
  - **WHEN** the player explores 6+ rooms including a central hub with 3+ exits and a `portal` or `time` edge
  - **THEN** the hub orb renders visibly larger than dead-end leaf orbs, `walk`-connected rooms cluster together, `portal`/`time` edges bridge clusters cleanly, and zero unpinned orbs overlap.
- **Two-Tier Naming & Hover Dwell**:
  - **WHEN** the player sweeps the mouse quickly across nodes (< 200 ms) vs. dwelling on a node for 200 ms
  - **THEN** quick sweeps do not trigger pins or flicker; dwelling 200 ms opens `#map-hover-card` with the full untruncated room name, dims non-neighbors, and keeps the card open for 150 ms when moving the pointer onto the card.
- **Node Inspector, Jumping & Route Highlighting**:
  - **WHEN** the player clicks a non-current node, clicks `ROUTE HERE` (for both a reachable and an unreachable portal room), and clicks a connected exit chip
  - **THEN** `#map-inspector` displays full exits/metadata, `ROUTE HERE` highlights the shortest walk route (or shows the inline `different_region` notice), and clicking an exit centers and inspects the target room.
- **Pan, Zoom, Pinch, Drag & Keyboard**:
  - **WHEN** the player drags the background, wheel-zooms, two-finger pinch-zooms on mobile, drags a node (and clicks `Unpin`), or navigates nodes with `Tab`/`Enter`/`Escape`
  - **THEN** pan/zoom/pinch/drag respond smoothly without page-scroll hijacking, and mobile renders the bottom-sheet inspector without triggering hover cards.
