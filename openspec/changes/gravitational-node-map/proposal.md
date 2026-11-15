## Why

The current rigid grid-based map display (`cartographic` and `node-graph` modes) pins rooms to static `(col, row)` cells regardless of edge topology, causing edges to cross awkwardly, nodes to feel disconnected from hub centrality, and the panel to lack interactive exploration. Replacing it with an Obsidian-style gravitational (force-directed) node map lets rooms settle cleanly without overlap, scales node radii by connectivity, and enables pan/zoom, hover previews, node inspection, and live route highlighting.

## What Changes

* **BREAKING — Single-Mode Gravitational Map:** Remove the rigid grid layout (`cartographic` mode) and `#map-mode-toggle` button; the force-directed gravitational node map becomes the sole render mode in `#map-panel`.
* **Physics & Collision Engine (`forceLayout.js`) & Pure Geometry (`mapGeometry.js`):** Introduce a pure-JS ESM force simulation with degree-weighted node radii/masses, `walk` vs. `portal`/`time` spring stiffness separation, seeded PRNG warm-start seeding, circle-circle collision resolution among unpinned nodes, and an `idle | hover | drag | coasting` state machine with in-memory `homeAnchors`/pins, plus a pure `mapGeometry.js` module for camera math, compact labels, antiparallel curves, border trimming, and route-edge matching.
* **Two-Tier Node Naming:** Display a compact node label on the canvas orb and reveal the full complete `room.name` inside the hover card and inspect panel.
* **Pan, Zoom & Edge Geometry:** Add cursor-anchored wheel zoom, pointer pan, toolbar controls (`+`, `-`, `FIT`, `⌖`), zoom-adaptive label LOD, and symmetric curved geometry for antiparallel edges (`A → B` + `B → A`) plus self-loops.
* **Obstacle-Aware Hover & Floating Inspect Panels:**
  * Add a 200 ms hover dwell gate (gated on `(hover: hover) and (pointer: fine)` and `prefers-reduced-motion`) with 1-hop neighborhood dimming, 150 ms card dismissal grace, and an 8-candidate obstacle-aware floating hover card (`popoverPlacement.js`).
  * Add tap-to-inspect (`< 6px` move) opening a desktop anchored popover (with exponential-lerp tracking and drag override) or mobile bottom-sheet drawer, showing full room metadata, clickable exits/entrances, in-memory unpinning, and a `ROUTE HERE` action wired to `GET /api/path`.

## Capabilities

### New Capabilities
*(None — all changes extend the existing spatial map visualization capability.)*

### Modified Capabilities
* `spatial-map-visualization`: Replace the two-mode rigid grid layout with a single-mode force-directed gravitational layout, degree-scaled orb nodes, two-tier naming, pan/zoom navigation, 200 ms hover dwell preview, obstacle-aware floating inspect panel, and `GET /api/path` route highlighting.

## Impact

* **Frontend (`web/`):** New `web/static/js/components/forceLayout.js`, `web/static/js/components/mapGeometry.js`, and `web/static/js/components/popoverPlacement.js`; updates to `web/static/js/api/map.js`, `web/static/js/components/mapPanel.js`, `web/templates/index.html`, `web/static/style.css`, and `web/FRONTEND_ARCHITECTURE.md`. *(Follow-up cleanup candidate: unused `web/static/js/vendor/cytoscape.min.js`.)*
* **Backend (`engine/`, `web/routes/`):** No changes required — consumes existing `GET /api/map` and `GET /api/path` endpoints.
* **Tests (`tests/`):** New JS unit tests (`forceLayout.test.mjs`, `mapGeometry.test.mjs`, `popoverPlacement.test.mjs`) and JS fixtures (`tests/unit/fixtures/mapFixtures.mjs`); updates to `tests/e2e/test_map_render.py` (camera-model centering rewrite, hover/inspect/route/mobile coverage) and `tests/ARCHITECTURE.md`.
