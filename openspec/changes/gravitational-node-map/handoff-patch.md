# Surgical Patch Handoff: OpenSpec Change 'gravitational-node-map' [PATCH-01]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: gravitational-node-map
- **Patch ID**: PATCH-01
- **Objective**: Fix visual crowding on dense graphs, counter-scale mobile 44 px tap targets, preserve `FIT`/manual camera across `ResizeObserver`, replace the missing `⌖` glyph, constrain `#map-inspector` with sticky actions and cleared route status, and expand mobile canvas height.
- **Feedback & Diagnostic Trace**:
  ```
  1. Dense graphs (15-room citadel, 24-room spiral):
     - At ~0.7x FIT zoom in the 306px sidebar, edge labels and VISITED ×1 meta collide with node titles.
     - 23 of 24 spiral rooms truncate to identical "Winding Passage…" (pure prefix truncation drops trailing numbers/tokens).
  2. Mobile 44px hit target scales with camera:
     - `.map-room::before` is inside transformed `#map-canvas-content`; at 0.3x zoom, effective hit area shrinks to ~±6px.
  3. First-paint FIT overwritten ~150ms later:
     - ResizeObserver fires on initial observe and calls `centerOnRoom()`, clipping rooms and discarding user pan/zoom on resize.
  4. Missing glyph `⌖` (U+2316) renders as `□` in JetBrains Mono / Linux fonts.
  5. Desktop `#map-inspector` overlaps top bar (`y=8`), clips `ROUTE HERE` on long exit lists, and leaves stale `#map-inspector-route-status` text when switching nodes.
  6. Mobile `#map-canvas` stays at `200px` height with ~370px blank space below on `375×812`.
  ```
- **Root Cause Analysis**: `FAR_ZOOM` (`0.6`) is below typical `FIT` zoom (`0.7`); `formatCompactRoomName` slices only from the start; hit testing relies on scaled DOM `::before`; `wireResize` lacks a `cameraMode` (`'fit' | 'center' | 'manual'`) and size-change guard; `clearRoute()`/`openInspector()` leave `#map-inspector-route-status` populated; `.map-inspector` lacks `max-height` flex scrolling and `topMargin`; mobile `.map-canvas` has `min-height: 200px` without `dvh` expansion.

## 2. Strict Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `web/static/js/components/mapGeometry.js` | `L10-L25` | Update `formatCompactRoomName` to preserve a trailing token/number (middle-ellipsis e.g. `Winding…23`, still `<= maxLength`) when `withoutArticle.length > maxLength` and `full` has multiple space-separated tokens |
| `web/static/js/components/forceLayout.js` | `L12-L20, L76-L80` | Increase `REPULSION` (`2200` → `3000`) and `walk` spring `length` (`74` → `98`) slightly so dense graphs have breathing room without breaking collision/cluster invariants |
| `web/static/js/components/popoverPlacement.js` | `L62-L105` | Support optional `topMargin` (defaulting to `margin`) when clamping `top` so desktop inspector stays below the top status bar |
| `web/static/js/components/mapPanel.js` | `L36, L52, L475-L515, L585-L660, L1069-L1085, L1256-L1270, L1389-L1392` | Raise `FAR_ZOOM` (`0.6` → `0.85`); track `cameraMode = 'fit' \| 'center' \| 'manual'` and skip no-op `ResizeObserver` fires; add screen-space nearest-node fallback (`<= 22px` from orb center) in `onPointerDown`; pass `topMargin: 64` in `inspectorTarget()`; clear `#map-inspector-route-status` in `clearRoute()` and `openInspector()` |
| `web/templates/index.html` | `L410` | Replace `⌖` with `◎` on `#map-center` |
| `web/static/style.css` | `L1718-L1730, L1917-L1925, L1983-L2140, L2170-L2200` | Constrain desktop `.map-inspector` (`max-height: min(440px, calc(100vh - 88px))`, flex column, scrollable `#map-inspector-body`, sticky `.map-inspector-actions`); expand mobile `.map-canvas` (`min-height: calc(100dvh - 220px)`) |
| `tests/unit/mapGeometry.test.mjs` | `compact name suite` | Add unit tests for trailing-token preservation (`Winding Passage 23` → `Winding…23`, `<= 16` chars) |
| `tests/e2e/test_map_render.py` | `E2E suite` | Add E2E assertions for `FIT` surviving initial `ResizeObserver`, screen-space tap hit near small orb at low zoom, and clearing route status on node switch |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the lines and files specified in the Target Context Map.
- **FORBIDDEN**:
  - Do NOT refactor surrounding working code (`engine/`, `web/routes/game.js`, `api/map.js`).
  - Do NOT modify `.env` or credential files.
  - Do NOT break existing 119 unit tests or 20 E2E tests.
- **INVARIANTS TO PRESERVE**: Zero unpinned orb overlaps, deterministic seeded PRNG, 200 ms hover dwell + 150 ms grace, `AbortController` route cancellation, session-only `homeAnchors`.

## 4. Visual & UI Impact
- Preserves all Retro Neon Obsidian Graph tokens (`#38bdf8`, `#c084fc`, `#facc15`, `#4ade80`, `#07090d`, `#0d1117`).
- Desktop `#map-inspector` stays below `y = 64px` (`topMargin: 64`) with sticky `ROUTE HERE` / `UNPIN` actions.
- Mobile `#map-canvas` fills `calc(100dvh - 220px)` with 44 px (`22px` radius) screen-space tap targets.

## 5. Reproduction & Verification Protocol
1. **Reproduce First**: Add unit test for `formatCompactRoomName("Winding Passage 23")` and E2E check for stale route status / `FIT` resize stability; confirm they fail before patching.
2. **Apply Minimal Fix**: Make targeted edits in the mapped files above.
3. **Verify Fix**: Re-run reproduction tests and confirm PASS.
4. **Full Regression Suite**:
   ```bash
   node --test tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs tests/unit/popoverPlacement.test.mjs tests/unit/roomMap.test.mjs tests/unit/pathfinding.test.mjs tests/unit/structuredStore.spatial.test.mjs tests/unit/spatialIntegration.test.mjs tests/unit/spatialUndo.test.mjs
   ./venv/bin/python -m pytest tests/e2e/test_map_render.py -v
   ```

## 6. Surgical Patch Checklist
- [ ] P01.1 Scaffold/run failing unit & E2E reproduction tests.
- [ ] P01.2 Apply minimal targeted fixes in `mapGeometry.js`, `forceLayout.js`, `popoverPlacement.js`, `mapPanel.js`, `index.html`, `style.css`.
- [ ] P01.3 Re-run reproduction tests and full unit + E2E regression suites; confirm 100% PASS.
- [ ] P01.4 Update `verification.md`, mark `PATCH-01` `RESOLVED` in `patch.md`, and mark `P01.1–P01.4` `[x]` in `tasks.md`.
