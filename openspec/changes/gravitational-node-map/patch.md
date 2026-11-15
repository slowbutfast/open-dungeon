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

### [PATCH-02] Mobile Flex Containment, Digit-Gated Naming, Coarse Tap Fallback & Inspector Polish
- **Date**: 2026-11-15 22:25:00 UTC
- **Feedback Source**: Multi-Agent Playwright Audit & Visual Verification (`PATCH-01` Review)
- **Reported Issue**:
  1. On `375×812` mobile, `.map-canvas { min-height: calc(100dvh - 220px); }` (`592px`) overflows `#tab-map` (`238px` due to `.sidebar-panel { max-height: 40dvh; }` and `overflow: hidden`), hiding orbs off-bottom and running `34px` under `.mobile-tab-bar`.
  2. `formatCompactRoomName` applies trailing-token preservation to non-numbered rooms (`Dawn Camp (Another Age)` → `Dawn…Age)`) and collides rooms sharing a first+last token (`Northern Cave Mouth 3` / `Northern Tunnel Junction 3`).
  3. `nearestNodeAtClientPoint(..., 22)` captures desktop mouse grabs across 23%–51% of dense graphs instead of panning.
  4. Desktop `#map-inspector` (`topMargin: 64`) overlaps the `.map-toolbar` and `.map-inspector-body` bottom padding lets a clipped row peek below sticky `.map-inspector-actions`.
  5. `FAR_ZOOM = 0.85` conflicts with spec (`< 0.6x`), hides edge labels at default FIT, and leaves inner-ring spiral labels stacked; spec still references `⌖`.
  6. Earlier code-review items (#1 `settle()` ~20-tick cutoff, #2 `startPinch` `panGesture`, #3 `dragEnd({cancel})` pinned restore, #4 drag-wipes-route, #5 pinned-repulsion `continue`) are explicitly **DEFERRED** to a follow-up maintenance pass (out of scope for PATCH-01/PATCH-02).
- **Target Files**: `web/static/style.css, web/static/js/components/mapGeometry.js, web/static/js/components/mapPanel.js, openspec/changes/gravitational-node-map/specs/spatial-map-visualization/spec.md, openspec/specs/spatial-map-visualization/spec.md, tests/unit/mapGeometry.test.mjs, tests/e2e/test_map_render.py`
- **Expected Resolution**: Mobile `#tab-map` and `#map-canvas` use flex sizing inside the visible pane above `.mobile-tab-bar` with all orbs inside `#tab-map`; compact naming gates trailing-token preservation to digit tokens and uses word-boundary truncation otherwise; 22 px tap fallback is gated to coarse/touch pointers; inspector clears `.map-toolbar` with zero clipped-row bleed; specs and zoom/culling align.
- **Status**: RESOLVED
- **Resolution (2026-11-15)**: Implemented within the Target Context Map. Mobile `#tab-map`/`.map-panel`/`.map-canvas` now flex-fill the pane above `.mobile-tab-bar` (verified `375×812`, all 4 orbs + current room inside `#tab-map`); compact naming digit-gates tail preservation (`Northern Cave Mouth 3` → `Northern Cave…3`, `Northern Tunnel Junction 3` → `Northern Tunne…3`) and word-boundary truncates non-numbered names (`Dawn Camp…`, `Shimmering…`); 22 px fallback is gated to touch/pen/coarse pointers (desktop off-node drag pans); inspector `topMargin` is `108` with `padding-bottom: 0` body / `0.6rem` sticky actions; `FAR_ZOOM` restored to `0.6` with priority label culling (current > hovered > neighbour > hub > other > edge); both specs synced to `◎` + culling wording. Reproduction RED (2 unit + 2 E2E) → GREEN. Full regression: 123/123 unit, 26/26 E2E; `openspec validate --strict` passes.

### DEFERRED — Code-review follow-ups (not part of PATCH-01/PATCH-02)
The following earlier review findings remain open and are explicitly deferred to a future maintenance pass:
1. `forceLayout.settle()` can stop on the ~20-tick alpha cutoff before the bounded collision relaxation is fully exercised in extremely dense graphs.
2. `startPinch()` does not clear a pending `panGesture`, so a pinch that begins mid-pan can leave stale pan state.
3. `dragEnd({ cancel: true })` does not restore the prior pinned position when the drag started from an existing `homeAnchor`.
4. A node drag triggers `renderMapPanel()`, which clears an active route overlay (drag-wipes-route).
5. Pinned nodes use `continue` in the repulsion loop, so pinned orbs do not repel unpinned neighbours (dense clusters around pins can be biased).

**Status**: DEFERRED (tracked, not resolved by PATCH-01/PATCH-02).
