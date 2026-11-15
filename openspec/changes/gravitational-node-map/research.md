## Source material

* **2026-11-15 — User request (problem & vision):**
  > "one of the issues I was having with the node map display is that because we were fixing the nodes of the page and then linking them directly, it was very difficult to actually display them without the nodes overlapping and such. But I realized that if we took a gravitational node approach, like for example, an obsidian, where we can arrange the nodes based on how many other edges they have, then we could let the nodes settle onto the page in a physics-like simulation so that they would display cleanly and it would be a lot easier to navigate... in terms of navigating, inspecting nodes, moving around the canvas, how nodes will be linked, the size of the nodes themselves in terms of their radius"
* **2026-11-15 — User feedback on plan:**
  * Replace/upgrade the rigid grid display entirely; the gravitational node map should be the **only** mode ("it should be the only mode since the rigid node view is not good").
  * Two-tier node naming: "create two names for every node, where the first name is a complex log [compact title] that is the sort of title of the node. And then if you click hover or inspect it, then it'll show the full complete name."
  * Pinned node positions: "only in memory" (current session, no `localStorage`).
* **2026-11-15 — User handoff ("Node hover and inspect: implementation handoff"):**
  * Reference architecture from user's other project (React 18 + TypeScript + d3-force + `<canvas>` + DOM overlays) detailing: 200 ms hover dwell gate, `(hover: hover) and (pointer: fine)` capability gating, 150 ms hover-card dismissal grace timer, `idle | hover | drag | coasting` physics state machine, `homeAnchors` in-memory placement, 8-candidate obstacle-aware `popoverPlacement` (`R, L, T, B, TR, BR, TL, BL`), desktop exponential-lerp anchored popover vs. mobile bottom-sheet drawer, and sticky-focal tap policy (`< 6px` move = tap/select).

### Raised but not acted on

* **Audio coupling (`AmbientSynth` / `deriveSwellActive`):** Present in the user's reference handoff (Section 9) as explicitly optional ("Skip this section if there is no audio"). Omitted because Open Dungeon has no WebAudio synth layer.
* **Persistent (`localStorage`) node coordinates:** Considered in open questions and explicitly rejected by the user ("only in memory").
* **React / TypeScript / `d3-force` / `cytoscape.min.js`:** Open Dungeon's frontend is zero-build vanilla ESM (`<script type="module">`). `web/static/js/vendor/cytoscape.min.js` exists in the repo but is unused and unreferenced. A pure-JS ESM physics module (`forceLayout.js`) preserves the zero-build stack and existing `.map-room[data-room-id]` DOM contract.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Gravitational / Force-directed layout** | Physics simulation with pairwise repulsion, edge springs, weak centering gravity, and circle-circle collision resolution | Geographic/compass-locked grid or `cartographic` band layout |
| **Degree (node weight)** | Weighted sum of non-self-loop incident edges (`walk` confirmed = 1.0, `inferred` = 0.5, `portal`/`time` = 1.0) used to scale node radius and mass | `visit_count`, `first_turn`, or self-loops |
| **Compact node label** | Shortened title rendered on the node itself (`formatCompactRoomName`: strips leading `The `/`A `/`An ` when > 16 chars, truncates to 16 chars with `…`) | A separate backend database column or renamed `state.location` |
| **In-memory pin / `homeAnchor`** | Session-scoped `(fx, fy)` coordinate stored in a module-level JS `Map` when a user drags a node (`dragEnd`); separate from temporary hover-pins | Persisted in SQLite or `localStorage` across page reloads |
| **`coasting`** | Post-pan-fling or post-drag-release inertia state while velocity/alpha is still decaying (`alpha > minAlpha`) | A persistent pin or hover state |
| **Hover dwell gate** | 200 ms timer before pinning a hovered node and opening `#map-hover-card`, gated on `(hover: hover) and (pointer: fine)` | Instant tooltip on `pointerenter` or mobile touch |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| User's "Node hover and inspect: implementation handoff" | Proven interaction architecture: 200 ms dwell, 150 ms grace timer, `idle\|hover\|drag\|coasting` state machine, 8-candidate obstacle-aware popover scoring, desktop lerp + mobile bottom sheet | User-provided reference pattern (patterns adopted into vanilla ESM) | 2026-11-15 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Pure-JS ESM `forceLayout.js` + DOM/SVG (`mapPanel.js`) | **Adopted** | Zero-build vanilla ESM stack (`AGENTS.md`); preserves `.map-room[data-room-id]` DOM contract and CSS neon styling | 2026-11-15 |
| `web/static/js/vendor/cytoscape.min.js` | **Rejected** | Currently unused; breaks DOM-node `.map-room` E2E selectors and custom neon/terminal styling | 2026-11-15 |
| `d3-force` (npm) | **Rejected** | Frontend has no bundler/build step; adding external CDN/vendor bundle is unnecessary for 5–200 room graphs | 2026-11-15 |

## Patterns adopted

* **200 ms hover dwell + 150 ms card grace timer** (from user handoff §3, §6) → `web/static/js/components/mapPanel.js`.
* **`idle | hover | drag | coasting` state machine + `homeAnchors`** (from user handoff §4) → `web/static/js/components/forceLayout.js`.
* **8-candidate obstacle-aware popover placement** (from user handoff §7) → `web/static/js/components/popoverPlacement.js`.
* **Desktop exponential-lerp anchored popover + mobile bottom-sheet drawer** (from user handoff §8) → `web/static/js/components/mapPanel.js` + `web/static/style.css`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Backend map payload shape (`GET /api/map`) | `{ rooms: [{ id, name, first_turn, last_visit_turn, visit_count }], edges: [{ from, direction, to, kind, inferred }], current_room_id, regions: [{ room_ids }] }` | Read `engine/index.js:359-391` and `web/routes/game.js:296-308` | 2026-11-15 | stable |
| Backend pathfinding endpoint (`GET /api/path`) | Accepts `?to=&from=`, returns `{ found, from_room_id, to_room_id, step_count, steps, reason }` or `404` | Read `web/routes/game.js:314-330` and `engine/index.js:439-445` | 2026-11-15 | stable |
| Frontend `api/map.js` | Only exports `fetchMap()`; does not yet wrap `/api/path` | Read `web/static/js/api/map.js:1-17` | 2026-11-15 | stable |
| `cytoscape.min.js` usage | Present in `web/static/js/vendor/` but unreferenced in `web/`, `engine/`, `tests/` | `grep -rn --exclude-dir=vendor "cytoscape"` exited 1 (no matches) | 2026-11-15 | stable |
| Existing spatial unit/integration tests | 77/77 pass | `node --test tests/unit/{roomMap,pathfinding,structuredStore.spatial,spatialIntegration,spatialUndo}.test.mjs` | 2026-11-15 | stable |
| Existing E2E DOM contract | Pins `#tab-btn-map`, `#tab-map`, `#map-panel[data-current-room-id]`, `#map-mode-toggle`, `.map-room[data-room-id]`, `.map-room.current-room`, `.map-empty`, and centering inside `#map-canvas` | Read `tests/e2e/test_map_render.py:1-300` | 2026-11-15 | decays (will update for single mode) |

## Unverified assumptions

* Live Playwright E2E execution (`tests/e2e/test_map_render.py`) was not run in this environment because `pytest` is not installed (`No module named pytest`).

## Superseded claims

* Initial plan considered keeping `cartographic` as default and adding `node-graph` as a toggleable mode. Superseded by user decision on 2026-11-15: the gravitational node map replaces the rigid grid completely as the sole mode.

## Links out

* [engine/ARCHITECTURE.md](file:///home/node/global-sandbox/projects/open-dungeon/engine/ARCHITECTURE.md)
* [web/FRONTEND_ARCHITECTURE.md](file:///home/node/global-sandbox/projects/open-dungeon/web/FRONTEND_ARCHITECTURE.md)
* [tests/ARCHITECTURE.md](file:///home/node/global-sandbox/projects/open-dungeon/tests/ARCHITECTURE.md)
