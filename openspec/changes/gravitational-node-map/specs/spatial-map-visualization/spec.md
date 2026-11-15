## MODIFIED Requirements

### Requirement: Map Panel
The frontend SHALL render the persisted room graph from `GET /api/map` in a single-mode, Obsidian-style gravitational (force-directed) node map panel (`#map-panel`) without a mode toggle. The renderer implementation SHALL require no build step and SHALL preserve `.map-room[data-room-id]` DOM nodes alongside an SVG edge layer where each `.map-edge` carries `data-edge-key="<from>|<direction ?? ''>|<to>"`.

The panel SHALL highlight the current room (from `current_room_id`) and SHALL reflect visited state from `last_visit_turn` / `visit_count` using both visual styling and explicit text/icon state indicators (`◉ CURRENT`, `VISITED ×N`, `UNVISITED`). Walk edges SHALL render with tighter clustering forces than `portal` and `time` edges, portal/time edges SHALL be visually distinct from walk edges, and inferred edges SHALL render dashed. Antiparallel edges between the same two rooms SHALL curve symmetrically so arrowheads and labels do not overlap.

The panel SHALL refresh from `GET /api/map` after each committed turn via a keyed diff (preserving active DOM elements rather than tearing down the entire tree), SHALL prune `homeAnchors` for removed rooms, SHALL clear any stale active route on turn refresh, and SHALL close `#map-inspector` if the inspected room was removed (or re-render updated metadata/exits if it still exists). The panel SHALL be reachable from the gameplay screen on both desktop and mobile.

#### Scenario: Gravitational node map render
- **WHEN** the map panel is shown with one or more rooms
- **THEN** each room renders as a `.map-room[data-room-id]` node positioned by the force-directed layout with no overlap among unpinned orbs, walk edges cluster connected rooms, portal/time edges are visually distinct, inferred edges render dashed, and the current room is highlighted

#### Scenario: Current-room highlight and visited state
- **WHEN** the map is rendered
- **THEN** the current room has `.current-room` and previously visited rooms are visually and textually distinguished from unvisited rooms

#### Scenario: Empty map
- **WHEN** the graph has no rooms yet
- **THEN** the panel renders `.map-empty` rather than an error

#### Scenario: Refresh after a turn while inspecting or routing
- **WHEN** a turn commits (or an undo removes a room) and `refreshMapPanel()` runs
- **THEN** existing rooms warm-start from their prior coordinates, `homeAnchors` for vanished rooms are pruned, any prior route overlay is cleared, and `#map-inspector` closes if its room disappeared or updates in place if it remains

#### Scenario: Mobile access
- **WHEN** the gameplay screen is viewed on a mobile viewport
- **THEN** the map panel is reachable from the mobile tab bar

### Requirement: Map Panel Legibility
The map panel SHALL keep the rendered camera viewport within its own bounds (`#map-canvas` inside `#tab-map`) without overflowing its containing panel on desktop or mobile, and all rooms SHALL remain reachable via pan, zoom, or `FIT`. Whenever the map renders with a `current_room_id`, the camera SHALL pan to bring the current room into `#map-canvas`'s visible bounding rect. When `#map-canvas`'s available dimensions change (window resize or desktop sidebar ↔ mobile tab switch), the camera SHALL re-center on the current room (or re-fit) without losing map data or pinned positions.

From a fresh state, the layout SHALL use a deterministic seeded PRNG (no `Math.random()`) so identical payloads produce identical initial layouts; across incremental turn refreshes, warm-start positioning is intentionally history-dependent.

*(Note: Rectangular region-box wrapping from the superseded cartographic grid is replaced by topology-driven walk clustering and a `Region N` badge derived from `1`-based membership in `data.regions`.)*

#### Scenario: Map stays within the panel
- **WHEN** the graph is rendered on desktop or mobile
- **THEN** `#map-canvas` does not overflow `#tab-map`, and all rooms are reachable via pan, zoom, or `FIT`

#### Scenario: Current room in view
- **WHEN** the map renders with a `current_room_id`
- **THEN** the current room's `getBoundingClientRect()` is fully within `#map-canvas`'s visible bounding rect without manual panning

#### Scenario: Re-center on resize
- **WHEN** the panel's available dimensions change (window resize or desktop sidebar ↔ mobile tab)
- **THEN** the camera re-centers on `current_room_id` without losing map data or in-memory pins

#### Scenario: Deterministic fresh layout
- **WHEN** two fresh sessions render the same `/api/map` payload without prior warm-start state
- **THEN** the seeded PRNG produces identical node coordinates

#### Scenario: Edge arrowheads visible
- **WHEN** a directed edge is drawn between two rooms
- **THEN** its arrowhead is trimmed to the target node's border radius and is not hidden beneath either room node

#### Scenario: Antiparallel edge separation
- **WHEN** two rooms have both an outgoing edge (`A → B`) and a reverse edge (`B → A`)
- **THEN** the two edges render as symmetric curved arcs so neither the paths nor their labels overlap

---

## ADDED Requirements

### Requirement: Gravitational Force Layout & In-Memory Pinning
The map layout SHALL compute node positions using a deterministic-seed force-directed simulation with pairwise repulsion, edge springs (`walk` tighter than `portal`/`time`), weak centering gravity, alpha-threshold convergence with a bounded tick cap, and a bounded final circle-circle collision pass so no two unpinned node orbs overlap.

Node `degree` SHALL be defined as the weighted sum of non-self-loop incident edges (`walk` confirmed = `1.0`, `inferred` = `0.5`, `portal`/`time` = `1.0`), and node radius and mass SHALL scale monotonically with `degree`.

Dragging a node (`>= 6px`) SHALL pin its `(fx, fy)` `homeAnchor` in memory for the active session only (never persisted to `localStorage`). `coasting` SHALL represent the post-drag-release or pan-fling inertia state while velocity/alpha is still decaying. Hover-pins (`hover(node)`) SHALL be temporary and separate from `homeAnchors`.

#### Scenario: Hub nodes scale larger than leaf nodes
- **WHEN** a room has a higher weighted degree than a dead-end leaf room
- **THEN** the hub room renders with a strictly larger radius than the leaf room

#### Scenario: Zero orb overlap among unpinned nodes
- **WHEN** a graph with dense or hub-and-spoke connections converges
- **THEN** no two unpinned room orbs' collision circles overlap

#### Scenario: In-memory drag and pin
- **WHEN** the player drags a room node by at least 6px and releases it
- **THEN** its `homeAnchor` is pinned in memory for the current session without persisting to `localStorage`, and `pointercancel` drops an interrupted drag cleanly

### Requirement: Two-Tier Node Naming
Each room node SHALL display a compact, shortened title on the canvas (`formatCompactRoomName`, max 16 characters, stripping leading `The `/`A `/`An ` when longer than 16 characters and truncating with `…`) while storing the full untruncated `room.name` in `data-full-name`. Hovering or inspecting a node SHALL display the full complete `room.name`.

#### Scenario: Compact canvas label and full detail name
- **WHEN** a room has a name longer than 16 characters
- **THEN** the canvas node displays the compact label (<= 16 characters) and `#map-hover-card` and `#map-inspector` display the full complete `room.name`

### Requirement: Pan, Zoom & Viewport Navigation
The map canvas (`touch-action: none`) SHALL support pointer-drag panning, cursor-anchored wheel zooming, two-pointer touch pinch-zooming, and toolbar controls (`+`, `-`, `FIT`, `◎` center-on-current). At low zoom levels (`< 0.6x`), edge direction labels and non-essential node labels SHALL fade out via `.map-zoom-far`. At any zoom, screen-space label collision culling SHALL hide lower-priority labels (current > hovered > hovered neighbour > hub > other, with edge labels last) so dense clusters never stack text.

#### Scenario: Fit and center controls
- **WHEN** the player clicks `FIT` or `◎`
- **THEN** the viewport adjusts pan and zoom to frame all rooms (`FIT`) or center on `current_room_id` (`◎`)

#### Scenario: Pinch zoom on touch devices
- **WHEN** two touch pointers pinch or spread on `#map-canvas`
- **THEN** the camera zooms smoothly around the pinch midpoint without triggering page scroll

### Requirement: Hover Dwell Preview & Neighborhood Highlight
On devices matching `(hover: hover) and (pointer: fine)`, dwelling on a room node for 200 ms (when not in `drag` or `coasting` state) SHALL temporarily pin the node, dim non-adjacent nodes and edges, and display a floating hover card (`#map-hover-card`) positioned via an 8-candidate obstacle-aware scorer. Moving the pointer onto `#map-hover-card` within a 150 ms grace period SHALL keep the card open. Coarse/mobile pointers SHALL skip hover previews. Under `prefers-reduced-motion: reduce`, animations, lerp, and hover-pin reheat SHALL be disabled while `#map-hover-card` information remains accessible.

#### Scenario: 200 ms hover dwell opens card and dims non-neighbors
- **WHEN** a fine pointer dwells on a room node for 200 ms
- **THEN** `#map-hover-card` appears with the full room name, status, `Region N` badge (when present in `data.regions`), and exit counts, and non-adjacent nodes/edges dim

#### Scenario: Fast sweep does not trigger hover card
- **WHEN** a fine pointer sweeps across a room node for less than 200 ms
- **THEN** no node is pinned and `#map-hover-card` does not open

### Requirement: Floating Node Inspector, Accessibility & Route Overlay
Tapping or clicking a room node (`< 6px` pointer movement) or activating a focused node via keyboard (`Enter`/`Space`) SHALL open `#map-inspector` (anchored popover on desktop, bottom sheet on mobile; `Escape` closes it). Nodes SHALL be keyboard-focusable (`tabindex="0"`, `role="button"`) with minimum `44×44px` touch hit targets on coarse/mobile viewports.

`#map-inspector` SHALL display the full room name, visit metadata, `Region N`, `Unpin` button (when pinned via `homeAnchor`; desktop `dblclick` also unpins while suppressing inspect), clickable outgoing/incoming exits (`onward` when `direction === null`), and a `ROUTE HERE` button for non-current rooms wired to `GET /api/path` with an `AbortController` stale-response guard and an `aria-live="polite"` route status region.

#### Scenario: Click or keyboard-activate node opens inspector and jumps to neighbor
- **WHEN** the player clicks (or presses `Enter` on) a room node and activates an exit in `#map-inspector`
- **THEN** `#map-inspector` opens with the room's exits and activating an exit centers and inspects the target room

#### Scenario: Route highlighting for reachable room
- **WHEN** the player clicks `ROUTE HERE` in `#map-inspector` for a reachable room
- **THEN** the panel fetches `GET /api/path`, matches steps (including `direction: null`) via `data-edge-key`, highlights `.map-edge-route`, and announces step-by-step directions

#### Scenario: Unreachable room or 404 route handling
- **WHEN** the player clicks `ROUTE HERE` and `GET /api/path` returns `found: false` (`different_region` or `no_route`) or HTTP `404`
- **THEN** `#map-inspector` displays a clear inline reason without painting any stale route edges
