# Verification — spatial-map-visualization-pathfinding

## Executive Summary & Environment

- **Status**: All specs verified passing. 35/37 tasks complete; task 7.4 (edge-density gate) is recorded as a scripted-mock proxy run — the live-model half needs an LLM API key (absent in this environment). Headless playtests P2–P6 pass (P7 route-overlay is out of scope by spec). The P6 map-legibility defect was fixed and pinned by e2e (see "P6 legibility fix"), and the `Map Panel Legibility` requirement was added to the spec (tasks 1.6, 6.6–6.9, 7.5, 8.4). The only open `[~]`s are 7.4 (live-model half) and 8.3 (spec sync at archive).
- **Date**: 2026-09-14
- **Change**: phase 2 of the spatial room graph — deterministic walk-only BFS routing + a zero-build frontend map panel, consuming the phase-1 `rooms`/`exits`/`room_visits` tables and `computeRegions`. No new storage, no new dependencies.
- **Environment**: Linux; Node `v22.23.2`; Python `3.11.2` (`venv/bin/python`); pytest `9.1.1`; Playwright chromium (`playwright` 1.62.0, browsers pre-installed). Backend started with `node web/server.js`; LLM mock `MOCK_LLM=1`.
- **Slices**: Slice A (pathfinding) tasks 1.1–5.3; Slice B (visualization) tasks 6.1–6.5; regression 7.1–7.4; docs 8.1–8.3.

## Requirement Adherence Audit Matrix

Every requirement and scenario in `specs/` is accounted for.

### Capability: `spatial-pathfinding`

| Requirement & Scenario | Verification Method / Test | Status |
| :--- | :--- | :--- |
| `### Requirement: Deterministic Route Planning`<br>`#### Scenario: Route within a walk-connected region` | `tests/unit/pathfinding.test.mjs` → "findRoute: returns the shortest ordered route within a walk-connected region" | **PASS** |
| `#### Scenario: Directed asymmetry` | `tests/unit/pathfinding.test.mjs` → "findRoute: traversal is directed — A→B does not imply B→A" | **PASS** |
| `#### Scenario: Inferred reverse edges are routable` | `tests/unit/pathfinding.test.mjs` → "findRoute: inferred reverse edges are routable and stamped inferred" | **PASS** |
| `#### Scenario: Directionless edges are routable` | `tests/unit/pathfinding.test.mjs` → "findRoute: null-direction edges are routable with a fallback direction label" (`FALLBACK_DIRECTION = 'onward'`) | **PASS** |
| `#### Scenario: Time edges are not routable` | `tests/unit/pathfinding.test.mjs` → "findRoute: time edges are not routable" | **PASS** |
| `#### Scenario: Cross-region target with no portal` | `tests/unit/pathfinding.test.mjs` → "findRoute: a cross-region target with no walk route reports different_region" | **PASS** |
| `#### Scenario: Unreachable target within the same region` | `tests/unit/pathfinding.test.mjs` → "findRoute: an unreachable target within the same region reports no_route" | **PASS** |
| `#### Scenario: Zero-step route` | `tests/unit/pathfinding.test.mjs` → "findRoute: origin === target is a found zero-step route" | **PASS** |
| `#### Scenario: Unknown room id` | `tests/unit/pathfinding.test.mjs` → "findRoute: an unknown room id returns null" | **PASS** |
| `#### Scenario: Deterministic ordering` | `tests/unit/pathfinding.test.mjs` → "findRoute: adjacency is deterministically ordered, so repeated routes are identical" (reversed input edge order yields the same route) | **PASS** |
| `### Requirement: Route Result Payload`<br>`#### Scenario: Found route payload` | `tests/unit/pathfinding.test.mjs` → "payload: a found route carries the ordered step list and step count" (exact key sets) | **PASS** |
| `#### Scenario: Not-found route payload` | `tests/unit/pathfinding.test.mjs` → "payload: a not-found route carries an empty step list and a reason" | **PASS** |
| `#### Scenario: Step names resolved at the surface` | `tests/unit/pathfinding.test.mjs` → "engine.getPath: resolves step room names…"; `tests/unit/spatialIntegration.test.mjs` → four-room route test asserts `from_room_name`/`to_room_name` per step | **PASS** |
| `### Requirement: Route API Surface`<br>`#### Scenario: Route from the current room` | `tests/test_api_endpoints.py` → `test_get_api_path_to_only_defaults_to_current_room`; `tests/test_mcp_spatial.py` → `test_path_to_default_origin_is_current_room` | **PASS** |
| `#### Scenario: Route between explicit rooms` | `tests/test_api_endpoints.py` → `test_get_api_path_between_explicit_rooms` | **PASS** |
| `#### Scenario: Unknown target room` | `tests/test_api_endpoints.py` → `test_get_api_path_unknown_target_returns_404` (JSON error body) | **PASS** |

### Capability: `mcp-server` (modified)

| Requirement & Scenario | Verification Method / Test | Status |
| :--- | :--- | :--- |
| `### Requirement: Spatial Pathfinding Tools`<br>`#### Scenario: Route to a room` | `tests/test_mcp_spatial.py` → `test_path_to_returns_route_shape` | **PASS** |
| `#### Scenario: Default origin` | `tests/test_mcp_spatial.py` → `test_path_to_default_origin_is_current_room` | **PASS** |
| `#### Scenario: Unknown room` | `tests/test_mcp_spatial.py` → `test_path_to_unknown_room_errors` (error names the unknown room) | **PASS** |
| `#### Scenario: Inspection reflects fresh memory` | `tests/test_mcp_spatial.py` → `test_path_to_reads_through_committed_turn` (route back over the inferred reverse edge after two committed turns); tool reuses `forceFlushBeforeRead` | **PASS** |
| Tool-count gate | `tests/test_mcp_protocol.py` → `test_tool_list_returns_all_tools` asserts exactly 21 tools incl. `dungeon_path_to` | **PASS** |

### Capability: `spatial-map-visualization`

| Requirement & Scenario | Verification Method / Test | Status |
| :--- | :--- | :--- |
| `### Requirement: Map Panel`<br>`#### Scenario: Cartographic render` | `tests/e2e/test_map_render.py` → `test_map_panel_renders_rooms_from_api` (panel visible, `data-current-room-id` matches `/api/map`, `.map-room` per room). Region clustering / curved walk paths / distinct portal-time arrows / dashed inferred edges are implemented in `components/mapPanel.js` and confirmed by code inspection + a hands-on Chromium run; **not asserted by an automated visual test** (see WARNING 1). | **PASS (with note)** |
| `#### Scenario: Node-graph render` | `tests/e2e/test_map_render.py` → `test_map_mode_toggle_switches_render_mode` asserts `data-mode="node-graph"`; per-edge direction/kind/inferred labels render in `buildEdgeLabel()`. Label text not asserted by e2e (WARNING 1). | **PASS (with note)** |
| `#### Scenario: Mode toggle` | `tests/e2e/test_map_render.py` → `test_map_mode_toggle_switches_render_mode` (`.map-room` count unchanged across cartographic → node-graph → cartographic) | **PASS** |
| `#### Scenario: Current-room highlight and visited state` | `tests/e2e/test_map_render.py` → `test_map_current_room_highlight` (exactly one `.map-room[data-room-id=<current>].current-room`); visited state via `.visited`/`.unvisited` + `data-visit-count` from `visit_count`/`last_visit_turn` (code-inspected, not e2e-asserted — WARNING 2) | **PASS (with note)** |
| `#### Scenario: Empty map` | `tests/e2e/test_map_render.py` → `test_map_empty_state` (intercepted `rooms: []` renders visible `.map-empty`, no error) | **PASS** |
| `#### Scenario: Refresh after a turn` | `api/streaming.js` calls `refreshMapPanel()` immediately after the post-stream `renderState(state, true)`; exercised by the empty-state test's post-turn fetch; hands-on Chromium confirmed 2 committed moves → 2 rooms. No dedicated e2e assertion (WARNING 3). | **PASS (with note)** |
| `#### Scenario: Mobile access` | `index.html` mobile tab `<button class="mobile-tab" data-panel="map">MAP</button>` routes through `switchSidebarTab("map")`; hands-on Chromium confirmed reachable at a mobile viewport. Not asserted by the map e2e (WARNING 4). | **PASS (with note)** |
| `### Requirement: Map Panel Legibility`<br>`#### Scenario: Map stays within the panel` | `tests/e2e/test_map_render.py` → `test_map_panel_fits_sidebar_and_centres_current_room`: `#map-canvas` right edge ≤ `#tab-map` right edge for the multi-region fixture, and every `.map-room` is within `#map-canvas-content` bounds | **PASS** |
| `#### Scenario: Current room in view` | Same test: `.map-room.current-room` bounding box is fully inside `#map-canvas`'s visible rect after render | **PASS** |
| `#### Scenario: Regions wrap in a narrow panel` | Same test + headless visual pass: 3 regions stack vertically in the 306px sidebar (region tops 214/422/546), region labels fully visible (`labelMinTop 203` > canvas top) | **PASS** |
| `#### Scenario: Re-layout on width change` | Same test: `page.set_viewport_size(800×900)` triggers the debounced (150ms) re-render; canvas still within the tab and all 4 rooms retained | **PASS** |
| `#### Scenario: Edge arrowheads visible` | `components/mapPanel.js` `boxBorderPoint()` trims both endpoints to the room border + `EDGE_GAP`; headless visual pass confirms portal (purple) and time (yellow) arrowheads render outside the target boxes (code-inspected, not pixel-asserted — WARNING 1) | **PASS (with note)** |

**Warnings (no CRITICAL):**
1. Cartographic/node-graph visual specifics (dashed inferred edges, portal/time arrow styling, edge labels) are code-inspected + hands-on, not pixel-asserted.
2. Visited-state classes are code-inspected, not e2e-asserted.
3. The post-turn refresh seam is exercised indirectly, not asserted directly.
4. Mobile MAP access is hands-on, not asserted in `tests/e2e/test_map_render.py`.

## Playtest Verification (P2–P7, `open-dungeon-playtest` framework)

Headless Debug/Test-Systems protocol (Step 4 user checkpoint replaced by an assertion). Because the registered MCP server runs the *canned* mock narrator (which cannot grow the graph past ~2 rooms), the scripted routing scenarios were driven through isolated `tests/probe_runner.py` servers with a `MOCK_SCRIPT_FILE`; the probe exposes the same engine surfaces as the MCP tools (`dungeon_inspect_map` ↔ `GET /api/map`, `dungeon_path_to` ↔ `GET /api/path`). No shared `dungeon_*` tool ran in parallel with a probe.

| Scenario | Result | Evidence |
| :--- | :--- | :--- |
| **P2 — Route back to X** (walk loop north/east/south/west) | **PASS** | `/api/path?to=<North Hall>` → `found:true`, `step_count:3`, directions `["east","north","west"]`, every step `inferred:1`, names `Crypt→Cellar→Gallery→North Hall` = walked path reversed |
| **P3 — One-way honesty** (`slide down the chute`) | **PASS** | one `direction:null` walk edge, no reverse; `/api/path` → `found:false`, `reason:"no_route"`, `steps:[]` — no fabricated return |
| **P4 — Cross-region mystery** (`step through the glowing archway`) | **PASS** | map → 2 regions + one `kind:"portal"` edge; `/api/path` → `found:false`, `reason:"different_region"`, portal not traversed |
| **P5 — Determinism** | **PASS** | two `North Hall→Crypt` routes around a non-moving turn are byte-identical (deep-equal) |
| **P6 — Map truthfulness (visual)** | **PASS** | Playwright DOM cross-check vs `/api/map`: `data-mode="cartographic"`, `data-current-room-id` matches, `.map-room` 4=4, `.map-region` 3=3, `.map-edge-walk` 2 / `-portal` 1 / `-time` 1 / `-inferred` 1, current room highlighted, all rooms `.visited`. The initial run found the narrow sidebar clipped Region 2 and the current room off-canvas; that defect was fixed (see "P6 legibility fix") and the legibility call is now resolved by the new e2e assertions + a headless visual pass at 1280×900 and 390×844. |
| **P7 — Route overlay** | **N/A (out of scope)** | No route-overlay feature exists in `mapPanel.js`, and neither the capability spec nor `tasks.md` requires one. Candidate follow-up; not a defect. |
| **MCP-native smoke** (registered server) | **PASS** | tool list = 21 incl. `dungeon_path_to`; `dungeon_init_session` → `go north` → `dungeon_inspect_map` (1 room) → `dungeon_path_to(current)` → `found:true`, `step_count:0` |

Scratch files (`.scratch/`) and probe sandboxes were removed after the run.

### P6 legibility fix (post-playtest)

The P6 run exposed a real clipping bug, not just cramping: `renderMapPanel()` sized `#map-canvas` (the `overflow: auto` box) with inline pixel `width`/`height` instead of sizing a content layer inside it. An explicit width on a scroll box makes it grow, not scroll, so it overran `#tab-map` (`overflow: hidden`) and the clipped half was unreachable — there was no scrollbar.

Fix (Slice B only; Slice A untouched):

- `#map-canvas-content` is now the sized layer inside `#map-canvas`; the canvas stays `width: 100%` and scrolls.
- `computeLayout(data, panelWidth)` is width-aware: columns are capped to what fits, region bands wrap onto new rows, so a narrow sidebar grows downward instead of off-canvas. `PAD` 28→34 and named region insets stop the labels clipping at the canvas top.
- The current room is scrolled into view (clamped to the scrollable range) after render.
- Edges are trimmed to the room border (`boxBorderPoint`) so portal/time arrowheads are not hidden behind the opaque room nodes.

Evidence — headless visual pass at 1280×900 with the P6 fixture: canvas `clientWidth 304` inside a `306px` tab, `scrollWidth == clientWidth`, 4/4 rooms in view, 3 regions stacked vertically, region labels not clipped, current room in view, all four edge kinds rendered. At 390×844 the panel fits and centres the current room (other regions reachable by scroll). New e2e `test_map_panel_fits_sidebar_and_centres_current_room` asserts the canvas does not overflow the tab, every room is within the scroll bounds, and the current room is in view. `tests/e2e/test_map_render.py`: **5 passed**.

## Independent Visual Verification (2026-09-15)

An independent observer (not the implementing agent) drove the full wizard → gameplay → MAP flow with headless Chromium and captured screenshots plus DOM counts against a live scripted-mock server (`MOCK_SCRIPT_FILE`, five turns: walk, walk, portal, walk, time).

**Tooling caveat.** The Playwright **MCP** could not be used: it launches the system Chrome without `--no-sandbox`, which this container's sandbox denies (`No usable sandbox!`). The repo's bundled-Chromium Playwright (`chromium.launch(args=["--no-sandbox"])`) runs fine, so the verification was done through it. To enable the MCP, add `--no-sandbox` to the `@playwright/mcp` command in `opencode.jsonc`.

**Fixture (5 rooms / 3 regions):** `Western Clearing ↔ Northern Trail` (walk + inferred reverse) · `Northern Trail --archway(portal)--> Glowing Archway` · `Glowing Archway ↔ Shadow Vault` (walk + inferred reverse) · `Shadow Vault --time--> Year Later Meadow`.

| Check | Observed | Result |
| :--- | :--- | :--- |
| Cartographic render | 5 `.map-room`, 3 `.map-region` (REGION 1/2/3), 4 `.map-edge-walk` (blue), 1 `.map-edge-portal` (purple, crossing the region seam), 1 `.map-edge-time` (yellow), 2 `.map-edge-inferred` | **PASS** |
| Current-room highlight + visited | exactly 1 `.map-room.current-room` ("◆ YOU ARE HERE"); 5 `.map-room.visited` ("visited ×1") | **PASS** |
| Node-graph render | 6 labelled edges: `north · walk`, `archway · portal`, `south · walk · inferred`, `east · walk`, `time · time`, `west · walk · inferred` | **PASS** |
| Mode toggle | `data-mode` cartographic → node-graph with `.map-room` count unchanged (5) | **PASS** |
| Mobile access | at 390×844, `.mobile-tab[data-panel="map"]` activates the MAP panel (5 rooms / 3 regions) and scrolls the current room into view | **PASS** |
| Console / page errors | `[]` | **PASS** |

Screenshots were captured during the run (cartographic, node-graph, mobile-MAP) but are not committed, consistent with the repo's uncommitted-screenshot convention. This resolves WARNING 1 (visual specifics) and WARNING 4 (mobile access) by direct observation; WARNINGs 2 and 3 (visited classes, refresh seam) remain code-inspected / indirectly exercised.

## Resolved Assumptions & Empirical Proof

| Assumption from `research.md` | How Verified | Result / Value | Volatility |
| :--- | :--- | :--- | :--- |
| **LIVE** — "BFS over the recorded graph is meaningful — enough walk edges accumulate in real play to make routing useful." | Edge-density gate (task 7.4) over the real HTTP server + `GET /api/map`, driven by the scriptable mock narrator (no LLM key available): `game/playtest/results-edge-density-gate.json`. Plus `tests/unit/spatialIntegration.test.mjs` GH#39 first-person edge recording. | 14 turns → **10 rooms / 19 walk edges** (12 confirmed, 7 inferred), 1 walk-connected region, **1.9 walk edges/room** — routing is meaningful. The **live-model** half remains open (needs a keyed/human run). | decays |
| ~~A natural live playtest grows `/api/map` past 3 rooms~~ | Carried over from `narrator-style-fidelity` (1 → 9 rooms, live). | **RESOLVED** | low |
| ~~The frontend has a place to mount a map panel without a layout overhaul~~ | Sidebar tabs + mobile tab bar + `components/`/`api/` conventions already existed; Slice B added `#tab-btn-map`/`#tab-map` + `data-panel="map"` with no layout overhaul. | **RESOLVED** | stable |

## Nomenclature & Code Symbol Audit

| Glossary Term (`research.md`) | Final Code Identifier | Location | Compliant |
| :--- | :--- | :--- | :--- |
| Region / component | `computeRegions(rooms, edges)` | `engine/memory/roomMap.js` | Yes |
| Walk edge | `kind === 'walk'` filter in `findRoute` | `engine/memory/pathfinding.js` | Yes |
| Portal edge | `kind === 'portal'` (never traversed) | `engine/memory/pathfinding.js` | Yes |
| Inferred edge | `inferred` field copied per step; `inferred=1` reverse edges | `engine/memory/pathfinding.js` | Yes |
| Cartographic render | `data-mode="cartographic"`; region boxes + curved paths + dashed inferred | `web/static/js/components/mapPanel.js` | Yes |
| `dungeon_path_to` | MCP tool `dungeon_path_to(to, from?)` | `mcp/tools/map.js` | Yes |
| (new) pure routing entry | `findRoute(rooms, edges, fromId, toId)` | `engine/memory/pathfinding.js` | Yes |
| (new) engine proxy | `AdventureEngine.getPath(fromRoomId, toRoomId)` | `engine/index.js` | Yes |
| (new) HTTP surface | `GET /api/path?to=&from=` | `web/routes/game.js` | Yes |
| (new) scroll box / sized content layer | `#map-canvas` (scroll) / `#map-canvas-content` (sized) | `web/static/js/components/mapPanel.js`, `web/static/style.css` | Yes |
| (new) width-aware layout | `computeLayout(data, panelWidth)` | `web/static/js/components/mapPanel.js` | Yes |
| (new) edge border trimming | `boxBorderPoint(cx, cy, towardX, towardY)` | `web/static/js/components/mapPanel.js` | Yes |

## Landed Tech Footprint & Patterns

| Adopted Pattern / Package | Implementation File(s) | Verification |
| :--- | :--- | :--- |
| Pure module + thin engine proxy (`scoring.js`/`roomMap.js` pattern) | `engine/memory/pathfinding.js`, `engine/index.js` | `node --test tests/unit/pathfinding.test.mjs` |
| Read-through freshness (`forceFlushBeforeRead`) | `mcp/tools/map.js`, `web/routes/game.js` | `tests/test_mcp_spatial.py`, `tests/test_api_endpoints.py` |
| Registry/API shape reuse (`/api/map` consumed directly) | `web/static/js/api/map.js`, `components/mapPanel.js` | `tests/e2e/test_map_render.py` |
| VSA slice boundaries (pathfinding vs visualization) | No cross-slice coupling; frontend never imports engine | `git diff` scope audit |
| Renderer D6 (resolved) — hand-rolled DOM rooms + SVG edges, zero-build, no library | `web/static/js/components/mapPanel.js`, `web/static/style.css` | e2e DOM contract |
| No new npm/pip dependencies | `package.json` unchanged | `git diff package.json` (empty) |

## Invalidated Hypotheses & Mid-Build Adjustments

| Original Belief | What Proved Wrong | Final Resolution | Rationale |
| :--- | :--- | :--- | :--- |
| D6 "the renderer is deliberately left open (hand-rolled canvas vs vendored library)." | A pure-canvas renderer cannot satisfy the testable DOM contract (`.map-room[data-room-id]`, `.current-room`) that the e2e smoke pins. | Resolved to **hand-rolled DOM room nodes + an SVG edge layer** (still no library, no asset, zero-build). Recorded in `architecture.md` D6. | Testability + the zero-build/no-dependency constraints; the vendored-library interaction upgrade stays a documented follow-up. |
| "Both render modes drawable with canvas primitives" (`research.md` Candidate tech). | Same as above — DOM nodes are the stable contract; edges render cleanly as SVG paths/markers. | DOM nodes + SVG edges. | Keeps the spec renderer-agnostic while giving deterministic, assertable structure. |
| The map e2e smoke could self-define a `page` fixture to be runnable without the `pytest-playwright` plugin. | It only works when the plugin is absent. With the repo's real e2e environment (`pytest-playwright` installed — the other 82 e2e tests require it), the module-local sync fixture collides with the plugin's asyncio loop: `fixture 'page' not found` / "Sync API inside the asyncio loop". | Removed the local fixture; `tests/e2e/test_map_render.py` now uses the plugin's `page` fixture like `test_barter_ui.py`. Full e2e suite: **86 passed**. | The plugin is the repo's actual e2e runner; matching the existing convention is what makes the smoke run in CI. |
| The hand-rolled renderer's sizing model (set the scroll box's `width`/`height` from the layout) works for a narrow sidebar. | It does not: an explicit width on an `overflow: auto` box grows the box past its `overflow: hidden` parent instead of scrolling, so multi-region graphs were clipped and unreachable. | Size a `#map-canvas-content` layer inside the scroll box; `computeLayout` is width-aware (capped columns + band wrapping); scroll the current room into view. | The container must stay at its parent's width and scroll; the layout owns the content size. |

## Implementation-Discovered Deferrals

- **Live-model edge-density run**: the gate was executed with the scriptable mock narrator because no LLM API key is present. Reason: environment limitation, not code. A keyed Wanderer run should confirm the live number.
- **Zoom / pan / selection**: still not implemented in the hand-rolled renderer. The P6 fix makes the map fit and scroll (with the current room auto-centred) but adds no zoom/pan. Reason: D6 accepts the manual-interaction cost for v1; the vendored-library upgrade is the documented follow-up.
- **Fuzzy/vector room-name matching**: duplicate nodes from exact-name matching remain visible in the map. Reason: explicitly out of scope (already in `research.md`/`architecture.md`).
- **Portal-admitting cross-region routing**: walk-only v1; cross-region targets return `different_region`. Reason: locked decision (D2/D3); portal mode is a follow-up.
- **E2E manual-review screenshots** (`tests/e2e/screenshots/*.png`): intentionally left uncommitted. They are nondeterministic captures from `test_mobile_viewport.py` (no animation stabilization — three consecutive runs produced different bytes) and are not compared baselines. The MAP tab lives inside `#gameplay-screen`, so the startup/preset/character captures are unaffected by this change.

## Empirical Execution Logs & Evidence

```bash
# 1. Pure routing + end-to-end route (task 7.1)
node --test tests/unit/pathfinding.test.mjs tests/unit/spatialIntegration.test.mjs
# 1..23  # tests 23  # pass 23  # fail 0

# 2. Full unit suite
npm run test:unit
# # tests 156  # pass 153  # fail 3
#   the 3 failures are PRE-EXISTING TDD scaffolds for make-undo-and-trades-consistent
#   (migration status_turn + two trade-undo limbo cases) — not this change.

# 3. MCP + HTTP surfaces (task 7.2)
MOCK_LLM=1 venv/bin/python -m pytest tests/test_api_endpoints.py tests/test_mcp_spatial.py tests/test_mcp_protocol.py -q
# 51 passed

# 4. Frontend map-panel e2e smoke (task 7.3)
MOCK_LLM=1 venv/bin/python -m pytest tests/e2e/test_map_render.py -q
# 4 passed

# 5. Edge-density gate (task 7.4, scripted-mock proxy)
venv/bin/python game/playtest/wanderer_edge_density.py
# 14 turns → 10 rooms / 19 walk edges (12 confirmed, 7 inferred), 1 region, 1.9 edges/room

# 6. Full Python suite (incl. e2e; pytest-playwright installed)
MOCK_LLM=1 ./venv/bin/python -m pytest tests/ -q \
  --ignore=tests/test_cli_behavior.py --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py
# 3 failed, 381 passed, 2 skipped
#   the 3 failures are the same pre-existing make-undo-and-trades-consistent reds
#   (test_barter_engine.py / test_undo_consistency.py); their source files are
#   untouched by this change (git log b18fe29..HEAD --name-only confirms).

# 7. E2E suite alone
./venv/bin/python -m pytest tests/e2e -q
# 87 passed  (82 pre-existing + the 5 map-panel smokes)

# 8. Change validity
openspec validate spatial-map-visualization-pathfinding
# Change 'spatial-map-visualization-pathfinding' is valid
```

### Metrics & Data Invariants

| Metric / Count | Before (HEAD `b18fe29`) | After | Delta / Observation |
| :--- | :--- | :--- | :--- |
| MCP tools | 20 | 21 | +`dungeon_path_to` (gate updated to 21) |
| Unit tests | 141 (138 pass / 3 fail) | 156 (153 pass / 3 fail) | +15 new tests; same 3 pre-existing reds, no regressions |
| New pure module | — | `engine/memory/pathfinding.js` | +135 lines |
| npm dependencies | 9 | 9 | 0 added |
| E2E suite | — | 87 passed | 82 pre-existing + 5 map-panel smokes (fit/scroll regression added) |
| Full Python suite (incl. e2e) | — | 381 passed / 3 failed / 2 skipped | 3 failures pre-existing (`make-undo-and-trades-consistent`) |
| Playtests P2–P6 | — | 6 pass | P7 out of scope; P6 legibility resolved by the fit/scroll fix |
| Edge-density (14-turn journey) | — | 10 rooms / 19 walk edges | 1.9 edges/room; 1 region |

## Quick Re-Verification (60-Second Audit)

```bash
# From the repo root, with node_modules + venv present:
node --test tests/unit/pathfinding.test.mjs tests/unit/spatialIntegration.test.mjs && \
MOCK_LLM=1 venv/bin/python -m pytest tests/test_api_endpoints.py tests/test_mcp_spatial.py tests/test_mcp_protocol.py tests/e2e/test_map_render.py -q
```

Expected output:
```
# tests 23
# pass 23
# fail 0
...
56 passed
```

(`npm run test:unit` will additionally report the 3 known pre-existing reds from `make-undo-and-trades-consistent`; those are unrelated to this change.)
