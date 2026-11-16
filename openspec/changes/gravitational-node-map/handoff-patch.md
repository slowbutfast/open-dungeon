# Surgical Patch Handoff: OpenSpec Change 'gravitational-node-map' [PATCH-06]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: `gravitational-node-map`
- **Patch ID**: `PATCH-06`
- **Branch / Worktree**: `feat/gravitational-node-map` (`/home/node/.local/share/opencode/worktree/9c85f06f2a29f14ea5dd1cbd2d1723ba8b7595e3/disco-badger`)
- **Objective**: Fix stale FIT framing on graph changes, eliminate label↔orb and label↔edge overlaps via a dedicated top `.map-label-layer`, orb-seeded 4-candidate placement (`bottom → top → right → left`), edge-length culling, semantic `< 8px` zoom threshold, and focal-only `.map-room-meta`.
- **Feedback & Diagnostic Trace**:
  ```
  1. STALE FIT ON GRAPH CHANGE (Agent 2):
     `renderMapPanel()` (`mapPanel.js:177-189`) only calls `fitCamera()` when `fittedForSize` differs
     from `measured`. Switching presets in the playground or adding rooms mid-game while
     `cameraMode === 'fit'` keeps the old zoom/pan and clips new rooms.
  2. LABEL↔ORB OVERLAPS & Z-ORDER (Agents 1 & 2):
     `cullLabels()` (`mapPanel.js:615-685`) only puts previously kept labels in `kept`, ignoring
     `.map-room` orb rects and edge strokes (29 label↔orb overlaps on 24-room spiral, 8 on 340px
     citadel). Node labels are children of `.map-room`, so later sibling orbs paint on top of earlier
     nodes' labels.
  3. RIGID BOTTOM-ONLY ANCHOR & SHORT EDGE LABELS (Agents 1 & 2):
     Every `.map-room-name` sits at `top: calc(100% + 3px)`, directly over south-exiting edges and
     below-neighbor orbs. Edge labels (23–30px) appear on 65–85px edges competing with arrowheads.
  4. SUB-8PX NOISE & FOCAL-ONLY META (Agents 1 & 2):
     On 64-room FIT (~0.36x zoom), 11.5px labels render at ~4px tall; non-focal `VISITED ×1` captions
     crowd vertical gaps between rows.
  ```

## 2. Strict Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `web/static/js/components/mapPanel.js` | `L175-194` | Re-fit whenever `cameraMode === 'fit'` and `graphData` rooms/edges/bounds changed (track a lightweight `lastGraphSignature` or `graphChanged` flag on `renderMapPanel`), while leaving `cameraMode === 'manual'` and `'center'` untouched. |
| `web/static/js/components/mapPanel.js` | `L262-340`, `L449-475` | Create/reuse a dedicated `<div class="map-label-layer">` inside `#map-canvas-content` *after* `.map-room` orbs so node labels always paint above all orbs (with focal labels raised via `z-index` / `.is-focal`). Position each node's label wrapper at the node's world `(x, y)` or update its screen/world coordinates in `updateAllGeometry()`. |
| `web/static/js/components/mapPanel.js` | `L582-700` | In `cullLabels()`: (1) seed `kept` with all `.map-room` orb screen rects (`worldToScreen(node, camera)` ± `node.radius * zoom + 4` px padding — zero DOM reads); (2) restrict `.map-room-meta` to focal nodes (`current`, `hovered`, `inspected`); (3) hide non-focal `.map-room-name` (not `current`, `hovered`, `inspected`, or hub `degree >= 3`) when `11.5 * camera.zoom < 8`; (4) test 4 placement candidates (`bottom`, `top`, `right`, `left`) around each node against `kept` and incident edge segments, picking the cleanest candidate and applying `.label-pos-bottom \| .label-pos-top \| .label-pos-right \| .label-pos-left` (culling only if none fit); (5) cull `.map-edge-label` if screen edge length `< labelWidth + 24` or it overlaps `kept`. |
| `web/static/style.css` | `L1816-1860`, `L1953-2003` | Add `.map-label-layer` (above orbs, `pointer-events: none`), `.label-pos-top` / `.label-pos-right` / `.label-pos-left` offset rules, subtle dark pill on `.map-room-name` (`background: rgba(7, 9, 13, 0.82); padding: 1px 4px; border-radius: 3px;`), and dark stroke halo on `.map-edge-label` (`paint-order: stroke; stroke: rgba(7, 9, 13, 0.92); stroke-width: 4px;`). |
| `tests/e2e/test_map_render.py` | `L950-1030` (append) | Add E2E tests verifying: (1) `cameraMode === 'fit'` re-fits when `renderMapPanel` receives a new/expanded graph; (2) 0 label↔orb overlaps on the 15-room citadel and 24-room spiral; (3) 4-position placement flips labels when a neighbor/edge blocks below; (4) sub-8px non-focal labels are culled at low zoom. |
| `web/FRONTEND_ARCHITECTURE.md`, `openspec/changes/gravitational-node-map/patch.md`, `tasks.md`, `verification.md` | Tail | Document `.map-label-layer` and 4-position culling in `web/FRONTEND_ARCHITECTURE.md`, mark `P06.1`–`P06.5` `[x]`, `PATCH-06` `RESOLVED`, and log results in `verification.md`. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY `mapPanel.js`, `style.css`, `tests/e2e/test_map_render.py`, and docs/OpenSpec files. Do NOT alter `forceLayout.js` physics (`REPULSION`, `settle()` cutoff) or `mapGeometry.js` naming in this patch.
- **INVARIANTS TO PRESERVE**:
  - `cullLabels()` must keep zero per-frame `getBoundingClientRect()` layout thrash during pan/zoom/drag (cached intrinsic sizes + world-to-screen math).
  - Manual and center cameras (`cameraMode !== 'fit'`) must NEVER be overwritten on graph updates.
  - All existing 71+ map/save unit tests and all Playwright E2E tests must pass.

## 4. Reproduction & Verification Protocol
1. **Reproduce First (RED)**: Add the new E2E tests in `tests/e2e/test_map_render.py` and run `./venv/bin/python -m pytest tests/e2e/test_map_render.py -k "refit or orb_overlap or semantic_zoom" -v` to confirm RED.
2. **Apply Minimal Fixes (GREEN)**: Implement `PATCH-06` in `mapPanel.js` and `style.css`.
3. **Full Regression & Visual Check**:
   - `node --test tests/unit/savesPrune.test.mjs tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs tests/unit/popoverPlacement.test.mjs tests/unit/spatial*.test.mjs`
   - `./venv/bin/python -m pytest tests/e2e/test_map_render.py -v`
   - `openspec validate gravitational-node-map --strict`
   - Visually verify `playgrounds/gravitational_map_playground.html` across all 6 presets.
