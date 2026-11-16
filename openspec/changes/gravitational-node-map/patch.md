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

### [PATCH-03] Cached/Debounced Label Culling, Render-Time Name Dedupe, Mobile Sheet Pan & Desktop Sidebar Clamp
- **Date**: 2026-11-15 22:50:00 UTC
- **Feedback Source**: Multi-Agent Playwright Audit (`PATCH-02` Review)
- **Reported Issue**:
  1. **Blocker**: `cullLabels()` runs on every camera/geometry frame and interleaves `classList` writes with `getBoundingClientRect()` reads (818 reads / 34–67 ms per wheel event at 144 rooms).
  2. Mobile bottom sheet covers ~7/15 tapped citadel nodes because `openInspector()` does not pan the inspected node above the sheet.
  3. `tokens.length === 3` special case in `formatCompactRoomName` drops distinguishing middle words (`Crystal Cavern 12` / `Crystal Chamber 12` → `Crystal…12`), and shared prefixes/non-digit suffixes collide without render-time deduplication.
  4. Desktop `#map-inspector` overlaps the left ~88 px of `.sidebar-panel` (`LOREBOOK` / `SPATIAL MAP`).
- **Target Files**: `web/static/js/components/mapPanel.js, web/static/js/components/mapGeometry.js, tests/unit/mapGeometry.test.mjs, tests/e2e/test_map_render.py`
- **Expected Resolution**: Zero per-frame layout thrash in `cullLabels` (cached/batched reads + gesture skip/debounce); mobile `openInspector` pans covered nodes above the bottom sheet; `dedupeCompactLabels` guarantees unique visible room labels; desktop inspector stays left of `.sidebar-panel`; `>= 40` move live-API playtest save generated and verified.
- **Status**: CODE RESOLVED / P03.4 LIVE PLAYTEST BLOCKED (no credentials)
- **Resolution (2026-11-15)**:
  - **Culling**: intrinsic label sizes are cached (invalidated on text/font change), rects are derived from `worldToScreen(node, camera)`, and every read happens before any class write. Culling is debounced 100 ms during gestures. Benchmark at 144 rooms: 30 synchronous wheel events in 9 ms, **0 cull runs during gesture, 0 label-rect reads**, 1 settle cull, 42 visible labels / 0 overlaps.
  - **Names**: removed the 3-token special case; added pure `dedupeCompactLabels()` (tail expansion + `~N` uniqueness fallback). `Crystal Cavern 12` / `Crystal Chamber 12` are distinct; Chapel/Sector collisions render unique labels.
  - **Mobile sheet**: `openInspector()` pans the camera so a covered node sits `radius + 16px` above the bottom sheet.
  - **Desktop**: `inspectorTarget()` clamps the usable viewport to `sidebar.left - 8`.
  - **Verification**: RED (naming/dedupe unit cases + 4 E2E) → GREEN; 125/125 unit, 30/30 E2E, `openspec validate --strict` passes.
  - **P03.4 blocked**: no live LLM credentials are available (`OPENROUTER_API_KEY` unset, LM Studio at `127.0.0.1:1234` unreachable). A 40-move MCP playtest was executed in `MOCK_LLM=1` to validate the tool path and saved as `adventure_id=9ad9dc13` (`game/playtest/adventures`), but its mock narrator only produced 2 rooms / 2 edges, so it does **not** satisfy the live-large-map requirement. Re-run P03.4 once credentials are provided.

### DEFERRED — Code-review follow-ups (unchanged)
The five earlier review findings remain deferred as documented under PATCH-02: `settle()` cutoff, `startPinch` stale `panGesture`, `dragEnd({ cancel: true })` pinned restore, drag-wipes-route, and pinned-node repulsion `continue`.

### [PATCH-04] Meta-Label Priority, Stale-FIT Guard, Restore Save Manager QOL & Save Isolation
- **Date**: 2026-11-15 23:30:00 UTC (revised 2026-11-15 after save-visibility investigation)
- **Feedback Source**: Multi-Agent Playwright Audit (`PATCH-03` Review), User QOL Request, and the "can't see the 40-move save on the tunnel" investigation
- **Reported Issue**:
  1. `cullLabels()` sets `.map-room-meta` (`VISITED ×N`) priority to `priority + 0.5`, so hub meta captions outrank priority-4 room names (7/14 names visible while 14/14 `VISITED ×1` captions stay on a 14-room exploration). The current room's `◉ CURRENT` meta must stay protected.
  2. **Stale FIT camera (confirmed root cause)**: `measureCanvas()` falls back to 300×320 when the canvas is hidden; rendering while the map tab is inactive (e.g. a turn commits from the console tab) fits the camera to that fallback, and showing the tab never re-fits (`renderMapPanel` non-fresh branch + RO `changed` check sees no change). Repro: zoom 0.542 vs 0.732 after FIT (walk40, 375×812); 0.550 vs 0.646 (citadel). Layout bounds are identical, so only the camera is stale. The separate one-off first-render 0.232 zoom is unreproduced and not claimed fixed.
  3. `[RESTORE SIMULATION SAVE]` (`#restore-screen`) lists saves in raw `readdir` order with no sorting or timestamp, displays history-length `turns` instead of `moves`, interpolates LLM-sourced text via `innerHTML`, renders every save (752 in the live default dir), and has no bulk pruning. Evidence: 748/752 saves under 3 moves; the 40-move mock save sat at row 729.
  4. **Save isolation bug (pre-existing)**: `SessionManager` always passes a save dir to `AdventureEngine`, so `SAVE_DIR` is ignored by `node web/server.js`; saves always go to `<OD_TMP_ROOT || /tmp/open-dungeon>/local-dev/adventures`. The E2E fixtures set `SAVE_DIR` and rmtree it, so the real dir is never cleaned (≈750 accumulated test saves). `tests/ARCHITECTURE.md` documents `SAVE_DIR=... node web/server.js` as isolation, which is wrong for the web server.
  5. A copied save JSON has no map: spatial rows live in the shared `memory.db`; `9ad9dc13` has 0 rows in `rooms`/`exits`/`room_visits`.
- **Target Files**: `web/static/js/components/mapPanel.js, web/static/js/components/saveListModel.js, engine/state.js, engine/index.js, web/routes/saves.js, web/templates/index.html, web/static/js/api/saves.js, web/static/style.css, web/server.js, tests/unit/savesPrune.test.mjs, tests/e2e/test_restore_saves.py, tests/e2e/test_map_render.py, tests/e2e/test_barter_ui.py, tests/e2e/test_menu_navigation.py, tests/e2e/test_mobile_viewport.py, engine/ARCHITECTURE.md, web/FRONTEND_ARCHITECTURE.md, tests/ARCHITECTURE.md, specs/spatial-map-visualization/spec.md (restore-window requirement)`
- **Expected Resolution**:
  - **A**: non-focal meta is always ranked below every room name and edge label (`10+`); the current/hovered/inspected room's meta stays adjacent to its own name (`+0.5`), so `◉ CURRENT` is never culled. `renderMapPanel` re-fits when `cameraMode === 'fit'` and the measured size differs from the size the camera was fitted for; manual/center cameras are never touched.
  - **B**: `#restore-screen` supports client-side sorting (`Recent` via `mtimeMs` default, numeric-aware `A–Z`, `Moves`) with `localStorage` persistence, paged rendering (50 + "Show more"), `textContent` hardening, a unified `moves` display, and `POST /api/saves/prune` (`{ max_moves, dry_run }`) with live preview, active-session exclusion, and per-id failure isolation through `engine.deleteAdventure()` (JSON + vector index + SQLite rows).
  - **C**: E2E fixtures use `OD_TMP_ROOT` and clean it up; `web/server.js` warns when `SAVE_DIR` is set; docs corrected. The E2E suite leaves the shared default dir's save count unchanged.
  - `P03.4` stays open until a live-LLM run produces `>= 40` moves and `>= 10` rooms.
- **Constraints**: do not delete or modify anything under `/tmp/open-dungeon/local-dev/` (existing saves, shared DB, indexes); cleanup of those saves requires explicit user approval and is intended to go through the new prune UI.
- **Status**: RESOLVED (P03.4 live playtest still `[~]`)
- **Resolution (2026-11-15)**:
  - **A1**: meta priority now keeps current/hovered/inspected meta adjacent to their own name (`base + 0.5`) and pushes every other meta to `10 + base`, with an explicit name-culled ⇒ meta-culled coupling. `◉ CURRENT` is never culled; verified on a 40-room all-visited graph.
  - **A2**: `fitCamera()` records `fittedForSize` (including whether it used the hidden-canvas fallback); `renderMapPanel()` re-fits only while `cameraMode === 'fit'` when the measured size differs or the last fit used the fallback. Manual cameras are no longer touched (the old `ensureCurrentInView()` call could override them on a hidden render). Layout is not re-seeded.
  - **B**: added `saveListModel.js` (Recent/A–Z/Moves sort, prune selection, paging), `updated_at` from `fs.stat` in `AdventureState.list()`, `AdventureEngine.pruneAdventures()` with active exclusion/dry run/per-id isolation, `POST /api/saves/prune` registered before `/saves/:save_id`, and a Restore toolbar with persisted sort, 50-row paging, move-threshold preview/confirm, and `textContent` rendering. Unit tests remove JSON + SQLite `rooms`/`exits`/`room_visits` + vector index; load leaves `mtimeMs` unchanged.
  - **C**: all four E2E server fixtures now set `OD_TMP_ROOT` under `tests/` and rmtree it; `web/server.js` warns when `SAVE_DIR` is set; docs corrected. Shared default save count **762 before and 762 after** the full E2E run. No files under `/tmp/open-dungeon/local-dev` were deleted or modified.
  - **Verification**: 133/133 Node unit tests, 150/150 Playwright E2E tests, `openspec validate --strict` passes. P04.1 is `[~]` because the A1/B pre-fix RED was not separately captured (A2 did fail first); P03.4 remains `[~]`; P04.7 remains unstarted (requires explicit user approval).
### [PATCH-05] Prune-By-Previewed-Ids, Manual-Camera Move Follow & Cleanups
- **Date**: 2026-11-16
- **Feedback Source**: Multi-Agent Playwright Audit (`PATCH-04` Review, reproduced against `39e98ba` on an isolated copy of 762 saves)
- **Reported Issue**:
  1. **Prune deletes the current set, not the previewed set.** Preview showed 755; a 0-move save planted after the preview and before Confirm was deleted (toast "Deleted 756, kept 7" after a "Delete 755" confirm). The confirm shows a count only (no titles) and the preview has no stale-response guard.
  2. **Spec regression**: `ensureCurrentInView()` now runs only in `center` mode, so a manually zoomed/panned camera does not follow the player's move (new current room fully outside `#map-canvas` at zoom 1.354). The main-spec "Current room in view" scenario is unchanged.
  3. Nits: no-op expression and unused `pageSize` in `pageSlice`; `selectPrunable` unused by the app; hardcoded `META_TOP_PX = 20.8` lets derived label rects drift (one visible label overlap remains on the 24-room spiral at FIT).
- **Target Files**: `engine/index.js, web/routes/saves.js, web/static/js/api/saves.js, web/static/js/components/saveListModel.js, web/static/js/components/mapGeometry.js, web/static/js/components/mapPanel.js, tests/unit/savesPrune.test.mjs, tests/unit/mapGeometry.test.mjs, tests/e2e/test_restore_saves.py, tests/e2e/test_map_render.py, engine/ARCHITECTURE.md, web/FRONTEND_ARCHITECTURE.md, tests/ARCHITECTURE.md, specs/spatial-map-visualization/spec.md, openspec/specs/spatial-map-visualization/spec.md`
- **Expected Resolution**: a real prune over HTTP requires the previewed `ids` and deletes only those that are still under the threshold, not active and existing (others reported in `skippedIds`), with titles listed in the confirm and a sequence guard on the preview; a render that changes `current_room_id` brings the new current room into view for a manual camera via a pure `panIntoView` (zoom and `manual` mode preserved) while same-room renders never move it; `selectPrunable`/`pageSlice` cleaned up; `META_TOP_PX` measured from the DOM with a label-rect parity test.
- **Constraints**: do not delete or modify anything under `/tmp/open-dungeon/local-dev/`; the shared default dir's save count must not change across the E2E run. Deferred and out of scope: names hidden at default FIT (layout label footprint), the five earlier code-review findings, `P03.4`, `P04.7`.
- **Status**: PENDING

### [PATCH-06] Re-Fit on Graph Change, Separate Label Layer & Orb/Edge-Aware 4-Side Placement
- **Date**: 2026-11-16 04:05:00 UTC
- **Feedback Source**: Multi-Agent Playground Visual Audit (Agent 1 + Agent 2)
- **Reported Issue**:
  1. `renderMapPanel()` (`mapPanel.js:177-189`) only calls `fitCamera()` when `canvas` size is stale, not when `graphData` rooms/bounds change while `cameraMode === 'fit'` (switching presets or adding rooms mid-game clips graphs under the previous camera framing).
  2. `cullLabels()` (`mapPanel.js:615-685`) does not include `.map-room` orb rects or edge strokes in `kept`, causing up to 29 label↔orb overlaps on the 24-room spiral and 8 on the 340px citadel.
  3. Node labels are children of `.map-room` divs and pinned strictly below the orb (`top: calc(100% + 3px)`), so labels get painted underneath neighboring orbs or directly over south-exiting edges.
  4. Edge labels render on short edges (`65–85px`) competing with arrowheads, non-focal `.map-room-meta` crowds 64-room graphs, and `< 8px` on-screen non-focal labels render as illegible noise at `0.36x` zoom.
- **Target Files**: `web/static/js/components/mapPanel.js, web/static/style.css, tests/e2e/test_map_render.py`
- **Expected Resolution**: `cameraMode === 'fit'` re-fits whenever graph rooms/bounds change; node labels render in a dedicated `.map-label-layer` above all orbs with subtle dark pills and edge-label stroke halos; `cullLabels()` seeds `kept` with orb rects, tries `{ bottom, top, right, left }` avoiding orbs/edges/labels, skips short-edge labels, hides sub-8px non-focal names, and restricts `.map-room-meta` to focal nodes.
- **Status**: RESOLVED
- **Resolution (2026-11-16)**:
  - **Re-fit**: `renderMapPanel()` tracks a graph signature (current room + room ids + edge keys); while `cameraMode === 'fit'`, a changed signature triggers `fitCamera()`. Manual and center cameras are untouched.
  - **Label layer**: node titles moved into `.map-label-layer` (`.map-node-label` wrappers) above all orbs, with dark pills on `.map-room-name`, opaque stroke halos on `.map-edge-label`, and focal wrappers raised above neighbors.
  - **Placement/culling**: orb rects with 4px padding seed the obstacle set; each label tries `bottom → top → right → left` against orbs, incident edge segments and placed labels, then a narrowed title, and finally a meta-only fallback for focal rooms so `◉ CURRENT` is never lost. Non-focal names below ~8px (`11.5 * zoom < 8`) and short-edge labels (`< labelWidth + 24px`) are culled; `.map-room-meta` is focal-only. Intrinsic metrics stay cached, so pan/zoom performs no per-label DOM reads.
  - **Verification**: RED (4 new map E2E failures) → GREEN; **36/36 map E2E**, **133/133 unit**, `openspec validate --strict` passes. Playground: all six presets settle with **0 label↔orb overlaps** and labels using all four placements.
