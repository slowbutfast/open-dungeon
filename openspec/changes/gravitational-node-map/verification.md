## Executive Summary & Environment

- **Status**: Implementation complete — all 25 tasks checked (17 original + 4 PATCH-01 + 4 PATCH-02), 123 Node unit tests and 26 Playwright E2E tests passing. PATCH-01 and PATCH-02 RESOLVED. No critical verification issues.
- **Date**: 2026-11-15 (PATCH-01 applied after visual verification)
- **Change**: `gravitational-node-map` (schema `tdd-rnd`)
- **Environment**
  - OS: Linux (arm64)
  - Node: `v22.23.2`; package manager: npm (269 packages via `npm ci`)
  - Python: `/usr/bin/python3` 3.11.2 inside a project `venv/`
  - Test runners: `node --test` (v22 built-in) and `pytest 9.2.0` + `pytest-playwright 0.10.0` + `playwright` Python 0.10.0 (Chromium headless shell 159.0.8154.6 / build v1255)
  - Provisioning performed for 1.1: `python3 -m venv venv`, `./venv/bin/pip install pytest playwright pytest-playwright`, `./venv/bin/playwright install chromium`, `npm ci`.

## Requirement Adherence Audit Matrix

Capability: `spatial-map-visualization` (delta spec in `openspec/changes/gravitational-node-map/specs/spatial-map-visualization/spec.md`).

| Capability | Requirement & Scenario | Verification Method / Test File | Status |
| :--- | :--- | :--- | :--- |
| spatial-map-visualization | **Map Panel**<br>Scenario: Gravitational node map render | `tests/e2e/test_map_render.py::test_map_panel_renders_rooms_from_api`; `tests/unit/forceLayout.test.mjs::walk edges settle closer together than portal edges`; `::hub nodes render strictly larger than dead-end leaves`; `tests/e2e/test_map_render.py::test_map_panel_renders_rooms_from_api` (`.map-edge[data-edge-key]`, `map-edge-inferred` class) | **PASS** |
| spatial-map-visualization | **Map Panel**<br>Scenario: Current-room highlight and visited state | `tests/e2e/test_map_render.py::test_map_current_room_highlight` (`.current-room` + `◉ CURRENT` text); `::test_map_hover_dwell_opens_card_and_dims_neighbours` (`VISITED`) | **PASS** |
| spatial-map-visualization | **Map Panel**<br>Scenario: Empty map | `tests/e2e/test_map_render.py::test_map_empty_state` | **PASS** |
| spatial-map-visualization | **Map Panel**<br>Scenario: Refresh after a turn while inspecting or routing | `tests/e2e/test_map_render.py::test_map_refresh_keeps_inspector_and_clears_route`; `::test_map_refresh_closes_inspector_for_removed_room`; `tests/unit/forceLayout.test.mjs::setGraph warm-starts existing rooms and seeds new rooms`; `::setGraph prunes removed rooms and their homeAnchors` | **PASS** |
| spatial-map-visualization | **Map Panel**<br>Scenario: Mobile access | `tests/e2e/test_map_render.py::test_map_mobile_inspector_bottom_sheet_and_suppressed_hover` (mobile tab bar → `#tab-map.active #map-panel`) | **PASS** |
| spatial-map-visualization | **Map Panel Legibility**<br>Scenario: Map stays within the panel | `tests/e2e/test_map_render.py::test_map_panel_fits_sidebar_and_centres_current_room` (`getBoundingClientRect()` containment) | **PASS** |
| spatial-map-visualization | **Map Panel Legibility**<br>Scenario: Current room in view | `tests/e2e/test_map_render.py::test_map_panel_fits_sidebar_and_centres_current_room` (current rect inside `#map-canvas` on first paint and after resize) | **PASS** |
| spatial-map-visualization | **Map Panel Legibility**<br>Scenario: Re-center on resize | `tests/e2e/test_map_render.py::test_map_panel_fits_sidebar_and_centres_current_room` (900×900 resize; room count preserved) | **PASS** |
| spatial-map-visualization | **Map Panel Legibility**<br>Scenario: Deterministic fresh layout | `tests/unit/forceLayout.test.mjs::createRng: identical seeds produce identical sequences`; `::createRng: different seeds diverge`; `::fresh layouts are deterministic for identical payloads`; `::fresh layouts are deterministic for the P6 fixture too` | **PASS** |
| spatial-map-visualization | **Map Panel Legibility**<br>Scenario: Edge arrowheads visible | `tests/unit/mapGeometry.test.mjs::trimToCircleBorder stops exactly on the target radius plus gap`; `::trimmedEdgeEndpoints trims both ends to their respective node radii`; renderer applies `trimmedEdgeEndpoints(from, to, EDGE_GAP)` (`mapPanel.js` `updateAllGeometry`) | **PASS** |
| spatial-map-visualization | **Map Panel Legibility**<br>Scenario: Antiparallel edge separation | `tests/unit/mapGeometry.test.mjs::antiparallel edges curve to opposite sides of the straight line`; `::zero-bend edges render as straight segments`; `::self-loop edges render an arc path that returns to the node` | **PASS** |
| spatial-map-visualization | **Gravitational Force Layout & In-Memory Pinning**<br>Scenario: Hub nodes scale larger than leaf nodes | `tests/unit/forceLayout.test.mjs::weightedDegree: walk/portal/time = 1.0, inferred = 0.5, self-loops excluded`; `::nodeRadius and nodeMass scale monotonically with degree`; `::hub nodes render strictly larger than dead-end leaves` | **PASS** |
| spatial-map-visualization | **Gravitational Force Layout & In-Memory Pinning**<br>Scenario: Zero orb overlap among unpinned nodes | `tests/unit/forceLayout.test.mjs::no unpinned orb collision circles overlap in a dense hub-and-spoke graph`; `::no unpinned orb collision circles overlap in the P6 fixture`; `::settle converges below the alpha threshold` | **PASS** |
| spatial-map-visualization | **Gravitational Force Layout & In-Memory Pinning**<br>Scenario: In-memory drag and pin | `tests/unit/forceLayout.test.mjs::state machine: idle -> drag -> coasting -> idle and pins an in-memory homeAnchor`; `::dragEnd({ cancel: true }) drops an interrupted drag without pinning`; `::hover is a no-op during drag and coasting`; `tests/e2e/test_map_render.py::test_map_drag_pins_node_in_memory_and_dblclick_unpins` (asserts no `localStorage` keys); `::test_map_inspector_unpin_button` | **PASS** |
| spatial-map-visualization | **Two-Tier Node Naming**<br>Scenario: Compact canvas label and full detail name | `tests/unit/mapGeometry.test.mjs::formatCompactRoomName: short names pass through unchanged`; `::strips a leading article when the name is too long`; `::caps at 16 characters with an ellipsis`; `::handles empty and nullish input`; `tests/e2e/test_map_render.py::test_map_panel_renders_rooms_from_api` (`data-full-name`, label <= 16); `::test_map_hover_dwell_opens_card_and_dims_neighbours` (full `North Hall` in card) | **PASS** |
| spatial-map-visualization | **Pan, Zoom & Viewport Navigation**<br>Scenario: Fit and center controls | `tests/e2e/test_map_render.py::test_map_pan_zoom_and_fit_controls` (`+`, `-`, wheel, background pan, `FIT` frames every room); `tests/unit/mapGeometry.test.mjs::computeFitViewport frames the whole bounds inside the viewport`; `::zoomAtPoint keeps the world point under the cursor fixed`; `::worldToScreen and screenToWorld are inverses` | **PASS** |
| spatial-map-visualization | **Pan, Zoom & Viewport Navigation**<br>Scenario: Pinch zoom on touch devices | `tests/e2e/test_map_render.py::test_map_pinch_zoom_on_touch_pointers` (two synthetic touch pointers; zoom increases; `touch-action: none`) | **PASS** |
| spatial-map-visualization | **Hover Dwell Preview & Neighborhood Highlight**<br>Scenario: 200 ms hover dwell opens card and dims non-neighbors | `tests/e2e/test_map_render.py::test_map_hover_dwell_opens_card_and_dims_neighbours` (`page.clock` 180 ms hidden → +40 ms visible, `Region 1`, full name, `.has-hover`, `.is-neighbor`, 150 ms card grace, dismissal) | **PASS** |
| spatial-map-visualization | **Hover Dwell Preview & Neighborhood Highlight**<br>Scenario: Fast sweep does not trigger hover card | `tests/e2e/test_map_render.py::test_map_fast_sweep_does_not_open_hover_card` (sub-200 ms pointerover/out sweep; no pin, no card) | **PASS** |
| spatial-map-visualization | **Floating Node Inspector, Accessibility & Route Overlay**<br>Scenario: Click or keyboard-activate node opens inspector and jumps to neighbor | `tests/e2e/test_map_render.py::test_map_keyboard_inspector_open_and_escape`; `::test_map_inspector_exit_chip_jumps_to_neighbour`; `::test_map_mobile_inspector_bottom_sheet_and_suppressed_hover` | **PASS** |
| spatial-map-visualization | **Floating Node Inspector, Accessibility & Route Overlay**<br>Scenario: Route highlighting for reachable room | `tests/e2e/test_map_render.py::test_map_route_highlights_reachable_path` (2 `.map-edge-route`, `aria-live="polite"`, directions announced); `::test_map_route_matches_direction_null_step` (`r3\|\|r4`) | **PASS** |
| spatial-map-visualization | **Floating Node Inspector, Accessibility & Route Overlay**<br>Scenario: Unreachable room or 404 route handling | `tests/e2e/test_map_render.py::test_map_route_unreachable_shows_reason_without_edges` (`different_region`, zero route edges); `::test_map_route_404_shows_inline_reason` (HTTP 404, zero route edges) | **PASS** |

Coverage totals: **7 requirements, 22 scenarios, 22/22 PASS.**

## Resolved Assumptions & Empirical Proof

| Assumption from research.md | How Verified in Code/Tests | Result / Value | Volatility |
| :--- | :--- | :--- | :--- |
| `GET /api/map` payload shape `{rooms, edges, regions, current_room_id}` | `fetchMap()` normalization + E2E renders live `/api/map` (`test_map_panel_renders_rooms_from_api`) | Live mock-adventure payload rendered; 4-room P6 fixture and real graph both render | stable |
| `GET /api/path` accepts `?to=&from=` and returns `{found, steps, reason}` or 404 | `fetchPath()` (`web/static/js/api/map.js`) + `page.route` E2E for found / `found:false` / 404 | Reachable route paints 2 edges; `different_region` and 404 show inline reasons with 0 edges | stable |
| E2E environment lacks `pytest`/`playwright` | Provisioned `venv/` (`pytest 9.2.0`, `pytest-playwright 0.10.0`, Chromium v1255) and ran the suite | 20/20 E2E pass | stable |
| Old E2E contract pinned `#map-mode-toggle` / `data-mode` | Toggle test removed; suite asserts `#map-mode-toggle` absent (`test_map_panel_renders_rooms_from_api`) | Single-mode renderer; no toggle remains in `web/` | stable |
| `cytoscape.min.js` is unused and must stay unused | `grep -rn --exclude-dir=vendor "cytoscape" web/ engine/ tests/` | No references; renderer is DOM/SVG | stable |
| Deterministic PRNG can be used instead of `Math.random()` | `forceLayout.test.mjs` determinism tests; `forceLayout.js` contains no `Math.random` | Identical payloads produce byte-identical coordinates | stable |
| Pins can stay session-only | `homeAnchors` `Map` in `forceLayout.js`; E2E asserts no map/pin keys in `localStorage` | 0 persisted keys; dblclick/Unpin clear the anchor | stable |
| `< 200 ms` hover sweeps are safely ignored | `test_map_fast_sweep_does_not_open_hover_card` | Card never opens; no `.has-hover` | stable |

## Nomenclature & Code Symbol Audit

| Glossary Term | Final Code Identifier | Location / File | Verified Compliant? |
| :--- | :--- | :--- | :--- |
| Gravitational / force-directed layout | `createForceLayout` | `web/static/js/components/forceLayout.js` | Yes |
| Degree (node weight) | `weightedDegree`, `nodeRadius`, `nodeMass` | `forceLayout.js` | Yes |
| Compact node label | `formatCompactRoomName` | `web/static/js/components/mapGeometry.js` | Yes |
| In-memory pin / `homeAnchor` | `homeAnchors` (`Map`), `layout.homeAnchors`, `unpin` | `forceLayout.js`, `mapPanel.js` | Yes |
| `coasting` | `state === 'coasting'`, `dragEnd()` | `forceLayout.js` | Yes |
| Hover dwell gate | `HOVER_DWELL_MS = 200`, `hoverDwellTimer` | `mapPanel.js` | Yes |
| Hover-card dismissal grace | `HOVER_GRACE_MS = 150`, `scheduleHoverHide` | `mapPanel.js` | Yes |
| `idle \| hover \| drag \| coasting` | `layout.state`, `startHover/endHover/startDrag/dragTo/dragEnd` | `forceLayout.js` | Yes |
| Edge keys | `edgeKey(from, direction, to)`, `data-edge-key` | `mapGeometry.js`, `mapPanel.js` | Yes |
| 8-candidate placement (`R, L, T, B, TR, BR, TL, BL`) | `POPOVER_PLACEMENTS`, `chooseBestPopoverPosition` | `web/static/js/components/popoverPlacement.js` | Yes |
| Map routes | `fetchPath(toRoomId, fromRoomId, signal)` | `web/static/js/api/map.js` | Yes |

## Landed Tech Footprint & Patterns

| Adopted Pattern / Package | Implementation File(s) | Verification Command / Suite |
| :--- | :--- | :--- |
| Pure ESM force simulation + state machine | `web/static/js/components/forceLayout.js` | `node --test tests/unit/forceLayout.test.mjs` |
| Pure camera/curve/edge-key geometry | `web/static/js/components/mapGeometry.js` | `node --test tests/unit/mapGeometry.test.mjs` |
| Pure 8-candidate obstacle scorer | `web/static/js/components/popoverPlacement.js` | `node --test tests/unit/popoverPlacement.test.mjs` |
| Keyed DOM/SVG diff + camera + gestures + overlays | `web/static/js/components/mapPanel.js` | `tests/e2e/test_map_render.py` |
| `fetchPath()` with `AbortSignal` | `web/static/js/api/map.js` | route E2E cases (reachable / unreachable / 404) |
| Toolbar, hover card, inspector markup | `web/templates/index.html` | E2E toolbar/keyboard/mobile tests |
| Orb/label/dimming/bottom-sheet/LOD/route styles | `web/static/style.css` | E2E computed geometry + visual classes |
| JS fixtures (`P6_FIXTURE`, hub-and-spoke) | `tests/unit/fixtures/mapFixtures.mjs` | unit suite |
| Frontend/test architecture docs | `web/FRONTEND_ARCHITECTURE.md`, `tests/ARCHITECTURE.md` | reviewed; no test runner |

## Invalidated Hypotheses & Mid-Build Adjustments

| Original Belief | What Proved Wrong | Final Resolution | Rationale |
| :--- | :--- | :--- | :--- |
| `position: fixed` overlays inside `#map-panel` anchor to the viewport | `.glass-panel` sets `backdrop-filter`, creating a containing block for fixed descendants (mobile inspector measured 340 px inside a 390 px viewport) | `portalOverlay()` moves `#map-hover-card` / `#map-inspector` to `document.body` | Required for true viewport anchoring and the mobile bottom sheet |
| `dblclick` target is the `.map-room` orb | `setPointerCapture` on the canvas redirects synthesized click/dblclick to `#map-canvas`, so the handler never saw a room | `onDoubleClick` falls back to `document.elementFromPoint(clientX, clientY)?.closest('.map-room')` | Keeps the drag gesture and the dblclick shortcut compatible |
| `.map-empty` can live inside `#map-canvas-content` | Content is a zero-sized transformed layer, so `inset: 0` collapsed and the empty state measured hidden | Empty state is mounted directly inside `#map-canvas` | Visible empty state with or without a settled camera |
| `page.clock` fully freezes time for `locator.hover()` | Hover actionability waits advanced the fake clock ~137 ms, so < 200 ms sweeps crossed the dwell threshold | Boundary E2E tests dispatch `PointerEvent` directly in one JS task, keeping the fake clock authoritative | Removes timing flakiness while still testing the real dwell/grace timers |
| A keyed diff can overwrite hover edge classes | `renderEdges()` re-set the `class` attribute during a post-turn refresh, erasing `is-neighbor` | `edgeClassName()` and `updateRoomNode()` derive hover classes from `hoveredId` on every render | Hover dimming survives incremental refreshes |

## Implementation-Discovered Deferrals

- **Deferred Item**: Real multi-touch hardware/device-lab verification of pinch and the mobile bottom sheet.
  - **Reason**: CI/dev environment is headless Chromium; pinch is exercised with two synthetic touch `PointerEvent`s and the mobile sheet with a 390×844 viewport. Manual device verification remains in `tests.md`'s manual checklist.
- **Deferred Item**: Persisting node coordinates across reloads.
  - **Reason**: Explicitly out of scope per user decision ("only in memory") and the spec's in-memory pinning requirement.
- **Deferred Item**: Deleting the unused `web/static/js/vendor/cytoscape.min.js`.
  - **Reason**: Proposal lists it as a follow-up cleanup candidate; deleting it is outside this change's target files. Confirmed unreferenced.
- **Deferred Item**: WebAudio/synth coupling for hover/inspect.
  - **Reason**: Hard exclusion in the handoff and research; Open Dungeon has no synth layer.
- **Deferred Item**: Rectangular region boxes from the superseded cartographic grid.
  - **Reason**: Replaced by topology-driven walk clustering and the `Region N` badge, as specified.

## Empirical Execution Logs & Evidence

### 1. Unit suite (new modules + all existing spatial/frontend modules)

```bash
$ node --test tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs \
    tests/unit/popoverPlacement.test.mjs tests/unit/roomMap.test.mjs \
    tests/unit/pathfinding.test.mjs tests/unit/structuredStore.spatial.test.mjs \
    tests/unit/spatialIntegration.test.mjs tests/unit/spatialUndo.test.mjs
1..119
# tests 119
# suites 0
# pass 119
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3405.923192
```

New module split: `forceLayout.test.mjs` (20), `mapGeometry.test.mjs` (18), `popoverPlacement.test.mjs` (7) = **45 new**; the 77 pre-existing spatial tests remain unchanged and green (77 + 45 = 122).

### 2. Playwright E2E suite

```bash
$ ./venv/bin/python -m pytest tests/e2e/test_map_render.py -v
============================= test session starts ==============================
platform linux -- Python 3.11.2, pytest-9.2.0, pluggy-1.7.0
configfile: pytest.ini
plugins: playwright-0.10.0
collecting ... collected 20 items

tests/e2e/test_map_render.py::test_map_panel_renders_rooms_from_api[chromium] PASSED [  5%]
tests/e2e/test_map_render.py::test_map_current_room_highlight[chromium] PASSED [ 10%]
tests/e2e/test_map_render.py::test_map_empty_state[chromium] PASSED      [ 15%]
tests/e2e/test_map_render.py::test_map_panel_fits_sidebar_and_centres_current_room[chromium] PASSED [ 20%]
tests/e2e/test_map_render.py::test_map_hover_dwell_opens_card_and_dims_neighbours[chromium] PASSED [ 25%]
tests/e2e/test_map_render.py::test_map_fast_sweep_does_not_open_hover_card[chromium] PASSED [ 30%]
tests/e2e/test_map_render.py::test_map_drag_pins_node_in_memory_and_dblclick_unpins[chromium] PASSED [ 35%]
tests/e2e/test_map_render.py::test_map_pan_zoom_and_fit_controls[chromium] PASSED [ 40%]
tests/e2e/test_map_render.py::test_map_keyboard_inspector_open_and_escape[chromium] PASSED [ 45%]
tests/e2e/test_map_render.py::test_map_mobile_inspector_bottom_sheet_and_suppressed_hover[chromium] PASSED [ 50%]
tests/e2e/test_map_render.py::test_map_route_highlights_reachable_path[chromium] PASSED [ 55%]
tests/e2e/test_map_render.py::test_map_route_unreachable_shows_reason_without_edges[chromium] PASSED [ 60%]
tests/e2e/test_map_render.py::test_map_route_404_shows_inline_reason[chromium] PASSED [ 65%]
tests/e2e/test_map_render.py::test_map_refresh_keeps_inspector_and_clears_route[chromium] PASSED [ 70%]
tests/e2e/test_map_render.py::test_map_pinch_zoom_on_touch_pointers[chromium] PASSED [ 75%]
tests/e2e/test_map_render.py::test_map_route_matches_direction_null_step[chromium] PASSED [ 80%]
tests/e2e/test_map_render.py::test_map_refresh_closes_inspector_for_removed_room[chromium] PASSED [ 85%]
tests/e2e/test_map_render.py::test_map_hover_card_available_under_reduced_motion[chromium] PASSED [ 90%]
tests/e2e/test_map_render.py::test_map_inspector_exit_chip_jumps_to_neighbour[chromium] PASSED [ 95%]
tests/e2e/test_map_render.py::test_map_inspector_unpin_button[chromium] PASSED [100%]

=================== 20 passed, 1 warning in 88.48s (0:01:28) ===================
```

The single warning is pytest's pre-existing `PytestRemovedIn10Warning` about session-scoped fixtures defined as instance methods (its `base_url` fixture), unrelated to this change. The suite's own session fixture (`start_server`) passed and cleaned its isolated `tests/adventures_map_e2e_test/` directory.

### 3. Metrics & data invariants

| Metric / Count | Before | After | Delta / Observation |
| :--- | :--- | :--- | :--- |
| Existing spatial unit tests | 77 | 77 | 0 lost; all pass |
| New map unit tests | 0 | 46 | +46 (determinism, degree, collision, springs, state machine, geometry, placement, PATCH-01/02 naming + topMargin) |
| Playwright map E2E tests | 6 (two-mode grid suite) | 26 | +20 net; mode toggle removed, PATCH-01/02 reproductions + dense-label culling added |
| PATCH-01 reproduction tests | 0 | 7 (3 unit + 4 E2E) | All fail before the patch, all pass after |
| PATCH-02 reproduction tests | 0 | 5 (2 unit + 2 E2E RED) | Mobile containment + digit-gated naming failed before, all pass after |
| Backend/API schema changes | 0 | 0 | `GET /api/map` and `GET /api/path` consumed unchanged |
| SQLite tables / persisted records | 0 | 0 | No model or migration changes; pins intentionally session-only |
| Production save directories touched | 0 | 0 | E2E writes only to `tests/adventures_map_e2e_test/`, removed by fixture |
| `Math.random()` calls in layout | — | 0 | Deterministic seeded PRNG only |
| `localStorage` map/pin keys | 0 | 0 | Asserted by `test_map_drag_pins_node_in_memory_and_dblclick_unpins` |

### 4. Scope/guardrail audit

- `git status` touches only the Target Context Map files (plus the new pure modules, fixtures and tests).
- `.env`, `.env.*`, credentials, `engine/`, `web/routes/game.js`, `tests/test_cli_behavior.py`, `tests/test_pty_integration.py`, and `tests/simulate_playtest.py` were not modified.
- No new runtime dependencies; `package.json` unchanged. Test tooling was installed into the git-ignored `venv/` and `node_modules/`.

## PATCH-01 — Visual Polish, Dense-Graph Readability, Mobile Hit Targets & Camera Stability

**Status: RESOLVED** (tracked in `patch.md`).

| Fix | Final implementation | Reproduction test(s) |
| :--- | :--- | :--- |
| Dense-graph label crowding | `FAR_ZOOM` raised `0.6 → 0.85`; `.map-zoom-far` hides meta/edge labels at FIT zoom | `test_map_fit_survives_noop_resize_and_preserves_manual_pan` (glyph + camera); visual LOD covered by existing render assertions |
| Numbered rooms collapse to identical labels | `formatCompactRoomName` now emits `first…last` (`Winding Passage 23 → Winding…23`, `≤ 16` chars) | `tests/unit/mapGeometry.test.mjs::formatCompactRoomName: preserves a trailing token for numbered rooms`; `::...after an article` |
| Dense graphs lack breathing room | `REPULSION 2200 → 3000`; walk spring `length 74 → 98` | Full force-layout suite (collision/cluster invariants) |
| 44 px tap target scales with camera | `nearestNodeAtClientPoint()` screen-space fallback (`≤ 22 px` from orb centre) in `onPointerDown` | `test_map_tap_hits_small_orb_at_low_zoom` (8× zoom-out, 18 px off-centre tap) |
| Initial FIT / manual pan overwritten by `ResizeObserver` | `cameraMode = 'fit' | 'center' | 'manual'`; no-op size changes ignored; `manual` preserved across real resizes | `test_map_fit_survives_noop_resize_and_preserves_manual_pan` |
| Missing `⌖` glyph | `#map-center` now renders `◎` | `test_map_fit_survives_noop_resize_and_preserves_manual_pan` asserts `◎` |
| Inspector overlaps top bar / clips actions | `topMargin: 64` in `inspectorTarget()`; `popoverPlacement` supports `topMargin`; `.map-inspector` capped at `min(440px, calc(100dvh - 88px))`, scrollable body, sticky actions | `tests/unit/popoverPlacement.test.mjs::topMargin keeps a clamped popover below the top status bar`; `test_map_inspector_stays_below_top_margin` |
| Stale route status on node switch | `clearRoute()` clears `#map-inspector-route-status`; `openInspector()` aborts/clears on room change | `test_map_switching_nodes_clears_route_status` |
| Mobile canvas collapsed to 200 px | mobile `.map-canvas { min-height: calc(100dvh - 220px); }` | `test_map_mobile_inspector_bottom_sheet_and_suppressed_hover` (height ≥ 420 px) |

### Reproduction-first evidence (RED before fix)

```text
$ node --test tests/unit/mapGeometry.test.mjs tests/unit/popoverPlacement.test.mjs
1..25
# pass 22
# fail 3        # trailing-token naming (2) + topMargin (1)

$ ./venv/bin/python -m pytest tests/e2e/test_map_render.py -v -k "fit_survives or tap_hits or switching_nodes or top_margin or mobile_inspector"
FAILED test_map_mobile_inspector_bottom_sheet_and_suppressed_hover[...]
FAILED test_map_fit_survives_noop_resize_and_preserves_manual_pan[...]
FAILED test_map_tap_hits_small_orb_at_low_zoom[...]
FAILED test_map_switching_nodes_clears_route_status[...]
4 failed, 1 passed, 19 deselected
```

### Post-fix execution logs

```bash
$ node --test tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs \
    tests/unit/popoverPlacement.test.mjs tests/unit/roomMap.test.mjs \
    tests/unit/pathfinding.test.mjs tests/unit/structuredStore.spatial.test.mjs \
    tests/unit/spatialIntegration.test.mjs tests/unit/spatialUndo.test.mjs
1..122
# tests 122
# suites 0
# pass 122
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3447.93243
```

```bash
$ ./venv/bin/python -m pytest tests/e2e/test_map_render.py -v
collecting ... collected 24 items
...
tests/e2e/test_map_render.py::test_map_fit_survives_noop_resize_and_preserves_manual_pan[chromium] PASSED [ 87%]
tests/e2e/test_map_render.py::test_map_tap_hits_small_orb_at_low_zoom[chromium] PASSED [ 91%]
tests/e2e/test_map_render.py::test_map_switching_nodes_clears_route_status[chromium] PASSED [ 95%]
tests/e2e/test_map_render.py::test_map_inspector_stays_below_top_margin[chromium] PASSED [100%]
================== 24 passed, 1 warning in 105.32s (0:01:45) ===================
```

### PATCH-01 scope/guardrail audit

- Only the PATCH-01 Target Context Map files were modified: `mapGeometry.js`, `forceLayout.js`, `popoverPlacement.js`, `mapPanel.js`, `index.html`, `style.css`, plus the mapped unit/E2E tests.
- Invariants preserved: zero unpinned overlaps, deterministic PRNG, 200 ms dwell + 150 ms grace, `AbortController` route cancellation, session-only `homeAnchors`.
- No backend, API, dependency, `.env`, or credential changes.

## PATCH-02 — Mobile Flex Containment, Digit-Gated Naming, Coarse Tap Fallback & Inspector Polish

**Status: RESOLVED** (tracked in `patch.md`).

| Fix | Final implementation | Reproduction test(s) |
| :--- | :--- | :--- |
| Mobile `#tab-map` clipped / orbs hidden | `375×812`: `.sidebar-panel.active:has(#tab-map.active)` drops the `40dvh` cap; `#tab-map.active`, `.map-panel`, `.map-canvas` flex-fill (`flex: 1; min-height: 0`); canvas bottom sits exactly at the tab-bar top | `test_map_mobile_panel_fits_above_tab_bar` (tab/canvas containment + all 4 orbs + current room) |
| Digit-gated compact naming | Trailing tail preserved only when the last token contains a digit; shared prefixes keep distinguishing initials (`Northern Cave Mouth 3 → Northern Cave…3`, `Northern Tunnel Junction 3 → Northern Tunne…3`); non-numbered names truncate at a word boundary (`Dawn Camp…`, `Shimmering…`) | `tests/unit/mapGeometry.test.mjs::formatCompactRoomName: digit-gates tail preservation...`; `::non-numbered names truncate at a word boundary` |
| 22 px fallback hijacked desktop pan | Fallback gated to `pointerType` `touch`/`pen` or `(pointer: coarse)` | `test_map_tap_hits_small_orb_at_low_zoom` (touch tap selects; desktop off-node drag pans with no pin) |
| Inspector overlaps toolbar / clipped-row bleed | `topMargin: 108`; `.map-inspector-body` bottom padding `0`; sticky `.map-inspector-actions` bottom padding `0.6rem` | `tests/unit/popoverPlacement.test.mjs::topMargin...`; `test_map_inspector_stays_below_top_margin` |
| `FAR_ZOOM` spec conflict + stacked dense labels | `FAR_ZOOM` restored to `0.6` (`< 0.6x` spec); priority screen-space label culling (`current > hovered > neighbour > hub > other > edge`) via `.is-label-culled` | `test_map_dense_graph_culls_colliding_labels` (24-room hub graph: colliding labels culled, current kept, zero visible overlaps) |
| Spec drift (`⌖`) | `⌖ → ◎` and collision-culling wording synced into both delta and main specs | `openspec validate gravitational-node-map --strict` |

### Reproduction-first evidence (RED before fix)

```text
$ node --test tests/unit/mapGeometry.test.mjs
1..19
# pass 17
# fail 2        # digit-gated tail preservation + word-boundary truncation

$ ./venv/bin/python -m pytest tests/e2e/test_map_render.py -v -k "mobile_panel_fits or tap_hits or top_margin or mobile_inspector"
FAILED test_map_mobile_panel_fits_above_tab_bar[...]
  AssertionError: #map-canvas bottom=830.375 exceeds #tab-map bottom=422.578 (fresh 375x812)
FAILED test_map_tap_hits_small_orb_at_low_zoom[...]    # desktop mouse grabbed the orb instead of panning
2 failed, 2 passed, 21 deselected
```

The mobile RED was reproduced against the PATCH-01 stylesheet on a fresh `375×812` mobile context (`is_mobile=True`), not a resized desktop page: `#tab-map` ended at `y+height = 422.58` while `#map-canvas` extended to `830.38`, i.e. the 592 px `min-height` escaping the `40dvh` sidebar cap and running under the tab bar. After the flex-containment patch, the canvas bottom equals the tab-map bottom exactly.

### Post-fix execution logs

```bash
$ node --test tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs \
    tests/unit/popoverPlacement.test.mjs tests/unit/roomMap.test.mjs \
    tests/unit/pathfinding.test.mjs tests/unit/structuredStore.spatial.test.mjs \
    tests/unit/spatialIntegration.test.mjs tests/unit/spatialUndo.test.mjs
1..123
# tests 123
# suites 0
# pass 123
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3792.959645
```

```bash
$ ./venv/bin/python -m pytest tests/e2e/test_map_render.py -v
collecting ... collected 26 items
...
tests/e2e/test_map_render.py::test_map_mobile_panel_fits_above_tab_bar[chromium] PASSED [ 42%]
tests/e2e/test_map_render.py::test_map_tap_hits_small_orb_at_low_zoom[chromium] PASSED [ 88%]
tests/e2e/test_map_render.py::test_map_inspector_stays_below_top_margin[chromium] PASSED [ 96%]
tests/e2e/test_map_render.py::test_map_dense_graph_culls_colliding_labels[chromium] PASSED [100%]
================== 26 passed, 1 warning in 116.41s (0:01:56) ===================
```

```bash
$ openspec validate gravitational-node-map --strict
Change 'gravitational-node-map' is valid
```

### Deferred code-review findings (explicitly not resolved by PATCH-02)

Tracked in `patch.md` → **DEFERRED**: `settle()` ~20-tick cutoff, `startPinch` stale `panGesture`, `dragEnd({ cancel: true })` pinned restore, drag-wipes-route, and pinned-node repulsion `continue`. These are out of scope for both visual patches and require a dedicated physics/interaction maintenance pass.

## Quick Re-Verification (60-Second Audit)

```bash
# JS unit modules (46 tests, ~0.2 s)
node --test tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs tests/unit/popoverPlacement.test.mjs

# Full spatial + frontend unit suite (123 tests, ~3.5 s)
node --test tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs \
  tests/unit/popoverPlacement.test.mjs tests/unit/roomMap.test.mjs \
  tests/unit/pathfinding.test.mjs tests/unit/structuredStore.spatial.test.mjs \
  tests/unit/spatialIntegration.test.mjs tests/unit/spatialUndo.test.mjs

# Map E2E (26 tests, ~117 s; requires the provisioned venv + Chromium)
./venv/bin/python -m pytest tests/e2e/test_map_render.py -q
```

Expected output:

```text
# tests 46
# pass 46
# fail 0

# tests 123
# pass 123
# fail 0

26 passed, 1 warning in ~117s
```
