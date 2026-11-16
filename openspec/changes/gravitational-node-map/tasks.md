## 1. Test Scaffolding (TDD)

- [x] 1.1 Verify/provision `pytest` and `playwright` in the E2E test environment so `tests/e2e/test_map_render.py` can run failing-first before implementation.
- [x] 1.2 Create `tests/unit/fixtures/mapFixtures.mjs` (JS `P6_FIXTURE` + dense hub-and-spoke fixture) and write failing unit tests in `tests/unit/forceLayout.test.mjs`, `tests/unit/mapGeometry.test.mjs`, and `tests/unit/popoverPlacement.test.mjs` covering seeded determinism, weighted degree radii, unpinned orb collision resolution, `idle | hover | drag | coasting` (`dragEnd({ cancel: true })`), compact naming, camera math, antiparallel curves, border trimming, `edgeKey` matching, and 8-candidate popover scoring.
- [x] 1.3 Update `tests/e2e/test_map_render.py` (update stale docstring, remove `test_map_mode_toggle_switches_render_mode`, rewrite `test_map_panel_fits_sidebar_and_centres_current_room` for `getBoundingClientRect()` containment + `FIT` + resize re-centering) and scaffold failing E2E tests using `page.clock` and `page.route` (`/api/path`) for 200 ms hover dwell, fast sweep, drag-pin, pan/zoom, mobile bottom-sheet inspector, keyboard `Enter`/`Escape`, and reachable/unreachable/`404` route highlighting.

## 2. Pure Physics, Geometry & Placement Modules

- [x] 2.1 Create `web/static/js/components/forceLayout.js` implementing seeded PRNG, weighted degree (`walk` = 1.0, `inferred` = 0.5, `portal`/`time` = 1.0, excluding self-loops), directional warm-start + removed-room pruning, pairwise repulsion, `walk` vs `portal`/`time` springs, weak centering gravity, alpha-threshold convergence + bounded collision-only pass, and the `idle | hover | drag | coasting` state machine with separate hover-pin and in-memory `homeAnchors`.
- [x] 2.2 Create `web/static/js/components/mapGeometry.js` implementing `formatCompactRoomName` (16-char cap, leading article stripping), `worldToScreen`/`screenToWorld`/`zoomAtPoint`/`computeFitViewport`, symmetric antiparallel curves + self-loop arcs, circle-border arrowhead trimming, and `edgeKey(from, direction, to)` matching (handling `direction === null`).
- [x] 2.3 Create `web/static/js/components/popoverPlacement.js` implementing `chooseBestPopoverPosition` with 8-candidate obstacle scoring.
- [x] 2.4 Run `node --test tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs tests/unit/popoverPlacement.test.mjs` and verify all unit tests pass.

## 3. API Client, Markup & Styles

- [x] 3.1 Add `fetchPath(toRoomId, fromRoomId, signal)` to `web/static/js/api/map.js` calling `GET /api/path` with `AbortSignal` support.
- [x] 3.2 Update `web/templates/index.html` (`#map-panel`) to remove `#map-mode-toggle` / `data-mode`, add viewport toolbar controls (`+`, `-`, `FIT`, `⌖`), and add `#map-hover-card`, `#map-inspector` (with `aria-live="polite"` route status), and `#map-canvas-content`.
- [x] 3.3 Update `web/static/style.css` (`.map-*`) for degree-scaled circular orb nodes, compact labels, `44×44px` coarse-pointer hit targets, `touch-action: none` pan/zoom viewport, `.map-canvas.has-hover` dimming (preserving label legibility), `#map-hover-card`, desktop anchored / mobile bottom-sheet `#map-inspector`, `.map-edge-route` animation, `.map-zoom-far` LOD, `:focus-visible` outlines, and `prefers-reduced-motion` rules.

## 4. Interactive Gravitational Map Panel (`mapPanel.js`)

- [x] 4.1 Replace the rigid grid layout in `web/static/js/components/mapPanel.js` with `forceLayout.js` + `mapGeometry.js`, keyed DOM/SVG diffing on `refreshMapPanel()` (pruning `homeAnchors`, clearing stale routes, updating/closing `#map-inspector`), `data-edge-key` attributes, two-tier naming, and text/icon state indicators.
- [x] 4.2 Implement pan/zoom (`pointerdown`/`pointermove`/`pointerup` pan, cursor-anchored `wheel` zoom, two-pointer touch pinch-zoom, `+`/`-`/`FIT`/`⌖` controls, resize re-centering, `.map-zoom-far` LOD) and node drag/in-memory pinning (`>= 6px` drag, `pointercancel` safety, desktop `dblclick` unpin shortcut).
- [x] 4.3 Implement 200 ms hover dwell (gated on `(hover: hover) and (pointer: fine)` — never gated on `prefers-reduced-motion`), 1-hop neighborhood dimming, 150 ms card dismissal grace, and `#map-hover-card` positioned via `popoverPlacement.js`.
- [x] 4.4 Implement sticky-focal tap-to-inspect (`< 6px` move), keyboard accessibility (`tabindex="0"`, `role="button"`, `Enter`/`Space`/`Escape`), desktop exponential-lerp anchored `#map-inspector` (with draggable header) / mobile bottom-sheet `#map-inspector`, clickable exit-to-room jumping, `Unpin` button, and `ROUTE HERE` wired to `fetchPath()` with `AbortController` stale-response guard and reachable/unreachable/`404` handling.

## 5. Architecture & Test Documentation

- [x] 5.1 Update `web/FRONTEND_ARCHITECTURE.md` and `tests/ARCHITECTURE.md` to document `forceLayout.js`, `mapGeometry.js`, `popoverPlacement.js`, updated `api/map.js`, single-mode gravitational rendering, hover/inspect panels, and the new unit/E2E tests.

## 6. Verification & Empirical Audit

- [x] 6.1 Run full Node.js spatial & frontend unit test suite (`node --test tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs tests/unit/popoverPlacement.test.mjs tests/unit/roomMap.test.mjs tests/unit/pathfinding.test.mjs tests/unit/structuredStore.spatial.test.mjs tests/unit/spatialIntegration.test.mjs tests/unit/spatialUndo.test.mjs`) and Playwright E2E suite (`python3 -m pytest tests/e2e/test_map_render.py -v`), verifying clean passes.
- [x] 6.2 Populate `verification.md` with Requirement Adherence Matrix, resolved assumptions, and verbatim execution logs.

## Patch 01: Visual Polish, Dense-Graph Readability, Mobile Hit Targets & Camera Stability

- [x] P01.1 Add failing unit & E2E tests for trailing-token `formatCompactRoomName` (`Winding Passage 23` → `Winding…23`), `ResizeObserver` preserving `FIT`/manual camera, 44 px screen-space tap hit-testing at low zoom, and clearing `#map-inspector-route-status` on node switch.
- [x] P01.2 Update `mapGeometry.js`, `forceLayout.js`, `popoverPlacement.js`, `mapPanel.js`, `index.html`, and `style.css` within the PATCH-01 Target Context Map.
- [x] P01.3 Verify all reproduction tests pass and run full Node unit (`119+`) and Playwright E2E (`20+`) suites with zero regressions.
- [x] P01.4 Update `verification.md` with PATCH-01 audit logs and mark `PATCH-01` `RESOLVED` in `patch.md`.

## Patch 02: Mobile Flex Containment, Digit-Gated Naming & Pointer Polish

- [x] P02.1 Add reproducing unit tests (`formatCompactRoomName` numbered vs non-numbered) and `375×812` `#tab-map` containment E2E test; confirm RED.
- [x] P02.2 Implement mobile flex containment + sticky inspector padding in `web/static/style.css`, digit-gated naming in `mapGeometry.js`, coarse-pointer tap gating + `topMargin: 108` + `FAR_ZOOM = 0.6` label culling in `mapPanel.js`, and sync `◎` in specs.
- [x] P02.3 Re-run reproduction tests, full Node unit suite, full Playwright E2E suite, and `openspec validate gravitational-node-map --strict`.
- [x] P02.4 Update `verification.md` with PATCH-02 audit results and mark `PATCH-02` `RESOLVED` in `patch.md`.

## Patch 03: Culling Performance, Name Dedupe, Mobile Sheet Pan & Live Playtest

- [x] P03.1 Add reproducing unit tests (`Crystal Cavern 12`/`Crystal Chamber 12`, `dedupeCompactLabels`) and E2E tests (mobile sheet pan-into-view, desktop sidebar clamp, culling cost/debounce); confirm RED.
- [x] P03.2 Implement batched/cached `cullLabels` with gesture skip/debounce, mobile bottom-sheet pan-into-view, and desktop sidebar clamp in `mapPanel.js`, plus `dedupeCompactLabels` in `mapGeometry.js`.
- [x] P03.3 Re-run unit tests, Playwright E2E suite, and `openspec validate gravitational-node-map --strict`.
- [~] P03.4 Run a `>= 40` move live-API playtest using `open-dungeon-playtest`, save the resulting large map, and verify it renders cleanly. (Executed 40 MCP moves with `MOCK_LLM=1`; save `adventure_id=9ad9dc13` retained, but live API was impossible — no `OPENROUTER_API_KEY` and LM Studio unreachable. Mock map = 2 rooms / 2 edges, so the live large-map requirement remains blocked, not satisfied.)
- [x] P03.5 Update `verification.md` with PATCH-03 + playtest findings and mark `PATCH-03` status in `patch.md`.

## Patch 04: Meta-Label Priority, Stale-FIT Guard, Restore Save Manager QOL & Save Isolation

- [~] P04.1 Add reproducing tests and confirm RED (tests added; A2 failed first and drove the guard/manual-camera fix; A1/B pre-fix RED was not separately captured; C has the 762→762 before/after count but no unmodified-fixture inflation run): `tests/unit/savesPrune.test.mjs` (`sortSaves`, `selectPrunable`, `pageSlice`, `AdventureState.list()` `updated_at`, `AdventureEngine.pruneAdventures` incl. JSON + SQLite rows + vector index removal, active exclusion, invalid threshold, partial failure, load does not change `mtimeMs`); `tests/e2e/test_restore_saves.py` (sort orders + persistence, prune preview/confirm, pagination, `<img onerror>` title rendered as text); `tests/e2e/test_map_render.py` (meta never outranks a culled name; `◉ CURRENT` never culled; render-while-hidden then show keeps FIT within 2% without clicking FIT). For C, record the RED as the shared `/tmp/open-dungeon/local-dev/adventures` save count increasing across one unmodified E2E run.
- [x] P04.2 Map fixes in `web/static/js/components/mapPanel.js`: meta priority (`namePriority + 0.5` for current/hovered/inspected, `10 + namePriority` otherwise) and `fittedForSize` stale-FIT guard (re-fit only while `cameraMode === 'fit'`; never override `manual`/`center`).
- [x] P04.3 Restore save manager: `web/static/js/components/saveListModel.js`, `updated_at` in `engine/state.js`, `pruneAdventures` in `engine/index.js`, `POST /api/saves/prune` (registered before `/saves/:save_id`) in `web/routes/saves.js`, and `#restore-screen` UI (sort, prune preview/confirm, paging, `textContent`) in `web/templates/index.html`, `web/static/js/api/saves.js`, `web/static/style.css`; add the restore-window requirement to the change spec.
- [x] P04.4 Save isolation: switch the E2E server fixtures (`test_map_render.py`, `test_barter_ui.py`, `test_menu_navigation.py`, `test_mobile_viewport.py`) from `SAVE_DIR` to `OD_TMP_ROOT` with teardown `rmtree`; add the `SAVE_DIR`-ignored startup warning to `web/server.js`; correct `tests/ARCHITECTURE.md` (and engine/frontend docs). Do not touch `/tmp/open-dungeon/local-dev`.
- [x] P04.5 Re-run reproduction tests, the map/spatial/save unit suite, the full `tests/e2e/` Playwright suite, and `openspec validate gravitational-node-map --strict`; record the shared default dir's save count before and after (must be equal).
- [x] P04.6 Update `engine/ARCHITECTURE.md`, `web/FRONTEND_ARCHITECTURE.md`, `tests/ARCHITECTURE.md`, `verification.md`, and mark `PATCH-04` `RESOLVED` in `patch.md` (keeping `P03.4` `[~]` until a live LLM run produces `>= 40` moves and `>= 10` rooms).
- [ ] P04.7 (needs explicit user approval, not an agent task) After the prune UI ships, the user clears the ≈750 stale saves in `/tmp/open-dungeon/local-dev` through it, with the preview checked first.

## Patch 05: Prune-By-Previewed-Ids, Manual-Camera Move Follow & Cleanups

- [ ] P05.1 Add reproducing tests and confirm RED on `39e98ba`: `tests/unit/savesPrune.test.mjs` (`pruneAdventures` with `ids`: save created after preview survives, moves-changed/active/unknown ids skipped, empty `ids`, per-id failure isolation), `tests/unit/mapGeometry.test.mjs` (`panIntoView`), `tests/e2e/test_restore_saves.py` (planted-after-preview survives; confirm lists up to 5 titles; stale-preview guard), `tests/e2e/test_map_render.py` (manual camera + move brings the new current room into view with zoom preserved; same-room render leaves the transform untouched; 24-room spiral label-rect parity / zero visible overlaps).
- [ ] P05.2 Prune by previewed ids: `ids` + `skippedIds` in `engine/index.js`, route requires `ids` for real runs in `web/routes/saves.js`, preview sequence guard + titles in confirm + skipped/failed toast in `web/static/js/api/saves.js`.
- [ ] P05.3 Manual-camera move follow: pure `panIntoView` in `web/static/js/components/mapGeometry.js`; `lastRenderedCurrentId` + `panCurrentIntoView()` in `web/static/js/components/mapPanel.js` (zoom and `manual` mode preserved; same-room renders never move the camera).
- [ ] P05.4 Cleanups: remove `selectPrunable`, simplify `pageSlice` in `saveListModel.js`; measure `META_TOP_PX` from the DOM (cached, re-measured on `document.fonts.ready`) in `mapPanel.js`.
- [ ] P05.5 Re-run reproduction tests, map/spatial/save unit suite, the full `tests/e2e/` suite, and `openspec validate gravitational-node-map --strict`; record the shared default dir's save count before and after (must be equal); update `engine/ARCHITECTURE.md`, `web/FRONTEND_ARCHITECTURE.md`, `tests/ARCHITECTURE.md`, both spec files, `verification.md`, and mark `PATCH-05` `RESOLVED` in `patch.md` (keeping `P03.4` `[~]` and `P04.7` open).

## Patch 06: Re-Fit on Graph Change, Label Layer & Orb/Edge-Aware Placement

- [x] P06.1 Add reproducing E2E tests in `tests/e2e/test_map_render.py` (graph-change re-fit in `fit` mode, zero label↔orb overlaps on dense citadel/spiral, 4-position label placement, sub-8px semantic zoom culling); confirm RED.
- [x] P06.2 Update `renderMapPanel()` in `mapPanel.js` to re-fit when `cameraMode === 'fit'` and graph rooms/bounds change.
- [x] P06.3 Move node labels to a dedicated `.map-label-layer` above orbs, add dark pill/halo styling in `style.css`, seed `cullLabels()` with orb rects, implement 4-position `{ bottom, top, right, left }` placement avoiding orbs/edges/labels, cull short-edge labels & sub-8px non-focal names, and restrict `.map-room-meta` to focal nodes.
- [x] P06.4 Re-run Node unit tests, Playwright E2E suite, `openspec validate gravitational-node-map --strict`, and verify visually in `playgrounds/gravitational_map_playground.html`.
- [x] P06.5 Update `web/FRONTEND_ARCHITECTURE.md`, `verification.md`, and mark `PATCH-06` `RESOLVED` in `patch.md`.
