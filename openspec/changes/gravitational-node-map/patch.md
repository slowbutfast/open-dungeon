### [PATCH-01] Visual Polish, Dense-Graph Readability, Mobile Hit Targets & Camera Stability
- **Date**: 2026-11-15 22:07:00 UTC
- **Feedback Source**: Visual Verification & Multi-Agent Playwright Audit
- **Reported Issue**:
  1. Dense graphs (15-room citadel, 24-room spiral) crowd `.map-room-name`, `.map-room-meta`, and `.map-edge-label` at ~0.7x `FIT` zoom; prefix-only 16-char truncation collapses numbered/suffixed rooms (e.g. `Winding Passage 1..23` → identical `Winding Passage…`).
  2. Mobile 44 px hit target (`::before`) scales with CSS `scale(zoom)`, shrinking to ~±6 px at 0.3x zoom.
  3. Initial `ResizeObserver` fire (~150 ms) replaces first-paint `FIT` with `centerOnRoom()`, clipping rooms and discarding user pan/zoom on resize.
  4. `#map-center` uses `⌖` (U+2316), rendering as a missing-glyph `□` box in Linux fonts.
  5. Desktop `#map-inspector` can overlap the top status bar and clip `ROUTE HERE` when exits overflow; switching inspected rooms leaves stale `#map-inspector-route-status` text.
  6. Mobile `.map-canvas` stays at `min-height: 200px`, leaving ~370 px of blank space below on `375×812` viewports.
- **Root Cause**: `FAR_ZOOM` (0.6) was below `FIT` zoom (~0.7); `formatCompactRoomName` dropped trailing tokens; hit testing relied on scaled DOM `::before`; `wireResize` unconditionally called `centerOnRoom()` even when size was unchanged or user panned; `clearRoute()`/`openInspector()` didn't clear `#map-inspector-route-status`; `.map-inspector` lacked `max-height` flex scrolling and `topMargin`; mobile `.map-canvas` lacked `dvh` height.
- **Target Files**: `web/static/js/components/mapGeometry.js, web/static/js/components/forceLayout.js, web/static/js/components/popoverPlacement.js, web/static/js/components/mapPanel.js, web/templates/index.html, web/static/style.css, tests/unit/mapGeometry.test.mjs, tests/e2e/test_map_render.py`
- **Expected Resolution**: Trailing tokens preserved in compact names; dense graphs legible at `FIT` zoom; 44 px screen-space tap targets at any zoom; `ResizeObserver` preserves `FIT`/manual camera; `◎` renders cleanly; desktop inspector constrained with sticky `ROUTE HERE` and cleared route status; mobile canvas fills available height.
- **Status**: RESOLVED
- **Resolution (2026-11-15)**: Implemented exactly within the Target Context Map. Trailing-token compact names (`Winding…23`), `FAR_ZOOM=0.85`, `REPULSION=3000`, walk spring length `98`, 22 px screen-space nearest-node fallback, `cameraMode` FIT/center/manual resize preservation, `topMargin=64` inspector placement with scrollable/sticky actions, route-status clearing on node switch, `◎` glyph, and mobile `calc(100dvh - 220px)` canvas. Reproduction RED (3 unit + 4 E2E failures) → GREEN. Full regression: 122/122 unit, 24/24 E2E. See `verification.md` → PATCH-01.
