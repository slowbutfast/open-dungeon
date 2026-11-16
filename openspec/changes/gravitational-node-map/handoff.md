# OpenCode Orchestration Handoff: OpenSpec Change 'gravitational-node-map'

You are the orchestration agent for OpenSpec change 'gravitational-node-map' running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive
- **Change Name**: gravitational-node-map
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub gravitational-node-map`)
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). Maintain strict isolation between feature compartments and avoid horizontal abstractions.

## 2. Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `tests/unit/fixtures/mapFixtures.mjs` | `[NEW]` | JS `P6_FIXTURE` + dense hub-and-spoke fixture for Node unit tests |
| `tests/unit/forceLayout.test.mjs` | `[NEW]` | Unit tests for seeded PRNG, weighted degree radii, unpinned collision resolution, `walk` vs `portal`/`time` springs, warm-start + pruning, and `idle \| hover \| drag \| coasting` (`dragEnd({ cancel: true })`) |
| `tests/unit/mapGeometry.test.mjs` | `[NEW]` | Unit tests for `formatCompactRoomName` (16-char cap), camera transforms, antiparallel curves, border trimming, and `edgeKey` matching (including `direction: null`) |
| `tests/unit/popoverPlacement.test.mjs` | `[NEW]` | Unit tests for 8-candidate (`R, L, T, B, TR, BR, TL, BL`) obstacle-aware placement scoring |
| `tests/e2e/test_map_render.py` | `L1-L300` | Update stale docstring, remove `test_map_mode_toggle_switches_render_mode`, rewrite `test_map_panel_fits_sidebar_and_centres_current_room` (`getBoundingClientRect()` containment + `FIT` + resize), add `page.clock` / `page.route` E2E tests for hover, inspect, keyboard, mobile sheet, and routes |
| `web/static/js/components/forceLayout.js` | `[NEW]` | Pure-JS ESM force simulation + `idle \| hover \| drag \| coasting` state machine, in-memory `homeAnchors`, separate temporary hover-pin |
| `web/static/js/components/mapGeometry.js` | `[NEW]` | Pure-JS ESM `formatCompactRoomName`, `worldToScreen`/`screenToWorld`/`zoomAtPoint`/`computeFitViewport`, antiparallel curves, circle-border arrowhead trim, `edgeKey` |
| `web/static/js/components/popoverPlacement.js` | `[NEW]` | Pure-JS ESM `chooseBestPopoverPosition` (8-candidate obstacle scorer) |
| `web/static/js/api/map.js` | `L1-L17` | Add `fetchPath(toRoomId, fromRoomId, signal)` calling `GET /api/path` with `AbortSignal` |
| `web/templates/index.html` | `L401-L410` | Remove `#map-mode-toggle` / `data-mode`, add `+`/`-`/`FIT`/`⌖` controls, `#map-hover-card`, `#map-inspector` (`aria-live="polite"`), and `#map-canvas-content` |
| `web/static/style.css` | `L1664-L1850` | Degree-scaled circular orb `.map-room` styles, compact labels, `44×44px` coarse-pointer hit targets, `touch-action: none`, `.map-canvas.has-hover` dimming, `#map-hover-card`, desktop/mobile `#map-inspector`, `.map-edge-route`, `.map-zoom-far`, `:focus-visible`, `prefers-reduced-motion` |
| `web/static/js/components/mapPanel.js` | `L1-L448` | Single-mode gravitational renderer, keyed DOM/SVG diffing, `data-edge-key`, pan/zoom/pinch, 200 ms hover dwell + 150 ms grace, obstacle-aware `#map-hover-card` & `#map-inspector`, keyboard nav, and `AbortController` `ROUTE HERE` |
| `web/FRONTEND_ARCHITECTURE.md` | `L20-L65, L195-L205` | Document `forceLayout.js`, `mapGeometry.js`, `popoverPlacement.js`, `api/map.js`, single-mode gravitational map, and hover/inspect panels |
| `tests/ARCHITECTURE.md` | `unit & e2e sections` | Document new JS unit tests/fixtures and updated `test_map_render.py` E2E coverage |

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions**:
  - Zero-build native ESM frontend (`<script type="module">`); no bundler, React, TypeScript, or external graph libraries (`web/static/js/vendor/cytoscape.min.js` remains unused).
  - Pure, DOM-free modules (`forceLayout.js`, `mapGeometry.js`, `popoverPlacement.js`) unit-tested under `node --test`.
  - Deterministic seeded PRNG (no `Math.random()`) + warm-start preservation + `homeAnchors` strictly in memory (never `localStorage` or SQLite).
  - Keyed DOM diffing on `refreshMapPanel()`, pruning `homeAnchors` for removed rooms, clearing stale routes, and updating/closing `#map-inspector`.
- **Hard Exclusions / No-Go**:
  - Do NOT modify `.env`, `.env.*`, or credential files.
  - Do NOT introduce unapproved external dependencies.
  - Do NOT modify backend `engine/` or `web/routes/game.js` (consume existing `GET /api/map` and `GET /api/path`).
  - Do NOT add WebAudio synth coupling.
  - Do NOT perform code modifications outside the Target Context Map without prior task coverage.

## 4. Visual & UI Design Specifications
- **Theme**: Retro Neon Obsidian Graph
- **Key Tokens**:
  - Primary: `#38bdf8` | Background: `#07090d` | Surface: `#0d1117`
  - Secondary (`portal`): `#c084fc` | Warning (`time`): `#facc15` | Success (`visited`): `#4ade80`
  - Text: Primary `#e2e8f0`, Muted `#94a3b8`
- **Component Anatomy & States**:
  - `.map-room`: Circular glowing orb (`width/height: var(--node-diameter)`), `tabindex="0"`, `role="button"`, compact `.map-room-name` below, `.current-room` neon halo, `.visited`/`.unvisited` borders + explicit text/icon state indicators (`◉ CURRENT`, `VISITED ×N`, `UNVISITED`), `:focus-visible` `2px solid #38bdf8`.
  - `#map-hover-card`: `position: fixed; z-index: 30; max-width: 240px`, full `room.name`, status, `Region N` badge, exit counts, turn stamps (fine pointers only; never gated on `prefers-reduced-motion`).
  - `#map-inspector`: Desktop anchored popover (`position: fixed; z-index: 35; width: 280px`, exponential-lerp tracking, draggable header); Mobile (`< 768px`) docked bottom sheet (`max-height: 56dvh`).
- **Responsive Layout**:
  - Mobile (`< 768px`): `touch-action: none` on `#map-canvas`, two-pointer pinch-zoom, `>= 44×44px` touch hit targets, bottom-sheet `#map-inspector`, hover card suppressed.
  - Desktop (`>= 768px`): `200 ms` hover dwell + `150 ms` card grace timer enabled.

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**:
  - JS Unit Tests: `npm run test:unit` (or `node --test tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs tests/unit/popoverPlacement.test.mjs`)
  - Python E2E Tests: `./venv/bin/pytest tests/e2e/test_map_render.py -v`
- **TDD Requirement**: Task group ## 1 MUST scaffold failing unit/E2E tests before touching implementation code. Verify they fail initially.

## 6. Implementation Task Checklist
- [ ] 1.1 Verify/provision `pytest` and `playwright` in the E2E test environment so `tests/e2e/test_map_render.py` can run failing-first before implementation.
- [ ] 1.2 Create `tests/unit/fixtures/mapFixtures.mjs` (JS `P6_FIXTURE` + dense hub-and-spoke fixture) and write failing unit tests in `tests/unit/forceLayout.test.mjs`, `tests/unit/mapGeometry.test.mjs`, and `tests/unit/popoverPlacement.test.mjs` covering seeded determinism, weighted degree radii, unpinned orb collision resolution, `idle | hover | drag | coasting` (`dragEnd({ cancel: true })`), compact naming, camera math, antiparallel curves, border trimming, `edgeKey` matching, and 8-candidate popover scoring.
- [ ] 1.3 Update `tests/e2e/test_map_render.py` (update stale docstring, remove `test_map_mode_toggle_switches_render_mode`, rewrite `test_map_panel_fits_sidebar_and_centres_current_room` for `getBoundingClientRect()` containment + `FIT` + resize re-centering) and scaffold failing E2E tests using `page.clock` and `page.route` (`/api/path`) for 200 ms hover dwell, fast sweep, drag-pin, pan/zoom, mobile bottom-sheet inspector, keyboard `Enter`/`Escape`, and reachable/unreachable/`404` route highlighting.
- [ ] 2.1 Create `web/static/js/components/forceLayout.js` implementing seeded PRNG, weighted degree (`walk` = 1.0, `inferred` = 0.5, `portal`/`time` = 1.0, excluding self-loops), directional warm-start + removed-room pruning, pairwise repulsion, `walk` vs `portal`/`time` springs, weak centering gravity, alpha-threshold convergence + bounded collision-only pass, and the `idle | hover | drag | coasting` state machine with separate hover-pin and in-memory `homeAnchors`.
- [ ] 2.2 Create `web/static/js/components/mapGeometry.js` implementing `formatCompactRoomName` (16-char cap, leading article stripping), `worldToScreen`/`screenToWorld`/`zoomAtPoint`/`computeFitViewport`, symmetric antiparallel curves + self-loop arcs, circle-border arrowhead trimming, and `edgeKey(from, direction, to)` matching (handling `direction === null`).
- [ ] 2.3 Create `web/static/js/components/popoverPlacement.js` implementing `chooseBestPopoverPosition` with 8-candidate obstacle scoring.
- [ ] 2.4 Run `node --test tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs tests/unit/popoverPlacement.test.mjs` and verify all unit tests pass.
- [ ] 3.1 Add `fetchPath(toRoomId, fromRoomId, signal)` to `web/static/js/api/map.js` calling `GET /api/path` with `AbortSignal` support.
- [ ] 3.2 Update `web/templates/index.html` (`#map-panel`) to remove `#map-mode-toggle` / `data-mode`, add viewport toolbar controls (`+`, `-`, `FIT`, `⌖`), and add `#map-hover-card`, `#map-inspector` (with `aria-live="polite"` route status), and `#map-canvas-content`.
- [ ] 3.3 Update `web/static/style.css` (`.map-*`) for degree-scaled circular orb nodes, compact labels, `44×44px` coarse-pointer hit targets, `touch-action: none` pan/zoom viewport, `.map-canvas.has-hover` dimming (preserving label legibility), `#map-hover-card`, desktop anchored / mobile bottom-sheet `#map-inspector`, `.map-edge-route` animation, `.map-zoom-far` LOD, `:focus-visible` outlines, and `prefers-reduced-motion` rules.
- [ ] 4.1 Replace the rigid grid layout in `web/static/js/components/mapPanel.js` with `forceLayout.js` + `mapGeometry.js`, keyed DOM/SVG diffing on `refreshMapPanel()` (pruning `homeAnchors`, clearing stale routes, updating/closing `#map-inspector`), `data-edge-key` attributes, two-tier naming, and text/icon state indicators.
- [ ] 4.2 Implement pan/zoom (`pointerdown`/`pointermove`/`pointerup` pan, cursor-anchored `wheel` zoom, two-pointer touch pinch-zoom, `+`/`-`/`FIT`/`⌖` controls, resize re-centering, `.map-zoom-far` LOD) and node drag/in-memory pinning (`>= 6px` drag, `pointercancel` safety, desktop `dblclick` unpin shortcut).
- [ ] 4.3 Implement 200 ms hover dwell (gated on `(hover: hover) and (pointer: fine)` — never gated on `prefers-reduced-motion`), 1-hop neighborhood dimming, 150 ms card dismissal grace, and `#map-hover-card` positioned via `popoverPlacement.js`.
- [ ] 4.4 Implement sticky-focal tap-to-inspect (`< 6px` move), keyboard accessibility (`tabindex="0"`, `role="button"`, `Enter`/`Space`/`Escape`), desktop exponential-lerp anchored `#map-inspector` (with draggable header) / mobile bottom-sheet `#map-inspector`, clickable exit-to-room jumping, `Unpin` button, and `ROUTE HERE` wired to `fetchPath()` with `AbortController` stale-response guard and reachable/unreachable/`404` handling.
- [ ] 5.1 Update `web/FRONTEND_ARCHITECTURE.md` and `tests/ARCHITECTURE.md` to document `forceLayout.js`, `mapGeometry.js`, `popoverPlacement.js`, updated `api/map.js`, single-mode gravitational rendering, hover/inspect panels, and the new unit/E2E tests.
- [ ] 6.1 Run full Node.js spatial & frontend unit test suite (`node --test tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs tests/unit/popoverPlacement.test.mjs tests/unit/roomMap.test.mjs tests/unit/pathfinding.test.mjs tests/unit/structuredStore.spatial.test.mjs tests/unit/spatialIntegration.test.mjs tests/unit/spatialUndo.test.mjs`) and Playwright E2E suite (`./venv/bin/pytest tests/e2e/test_map_render.py -v`), verifying clean passes.
- [ ] 6.2 Populate `verification.md` with Requirement Adherence Matrix, resolved assumptions, and verbatim execution logs.

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify all checkboxes in `tasks.md` are marked `- [x]`. Only tick boxes that genuinely ran and passed.
2. Check data preservation: confirm record/feature counts before and after if touching data models.
3. Ensure `openspec/changes/gravitational-node-map/verification.md` is populated with:
   - Executive Summary & Environment
   - Requirement Adherence Audit Matrix (mapping every spec scenario to its verifying test)
   - Resolved Assumptions & Empirical Proof
   - Nomenclature & Code Symbol Audit
   - Verbatim Execution Logs
4. Automatically run verification via `openspec-verify-change`.
5. If clean with no critical issues, sync specs: `openspec specs apply --change "gravitational-node-map"`.
6. **Open a Pull Request**: Once implementation is complete and `openspec/changes/gravitational-node-map/verification.md` is written and verified with zero critical issues:
   - Ensure your work is on a dedicated feature branch (create/switch to `feat/gravitational-node-map` if currently on `main`/`master`).
   - Stage and commit the implementation and OpenSpec artifacts (`tasks.md`, `verification.md`, synced specs), then push the branch (`git push -u origin HEAD`).
   - Open a Pull Request using `gh pr create --fill` (or with a concise title and a body summarizing `openspec/changes/gravitational-node-map/proposal.md` and `openspec/changes/gravitational-node-map/verification.md`) and report the PR URL.
