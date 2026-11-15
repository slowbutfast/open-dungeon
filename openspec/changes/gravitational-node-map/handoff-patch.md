# Surgical Patch Handoff: OpenSpec Change 'gravitational-node-map' [PATCH-04]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: `gravitational-node-map`
- **Patch ID**: `PATCH-04`
- **Branch / Worktree**: `feat/gravitational-node-map` (`/home/node/.local/share/opencode/worktree/9c85f06f2a29f14ea5dd1cbd2d1723ba8b7595e3/disco-badger`)
- **Objective** (three independent scopes, implement and commit in this order):
  - **A. Map**: fix `.map-room-meta` outranking room names in `cullLabels()`, and fix the stale-FIT camera when the map is rendered while its tab is hidden.
  - **B. Restore Save Manager QOL**: `[RESTORE SIMULATION SAVE]` sorting, bulk move-threshold pruning, bounded rendering, `textContent` hardening.
  - **C. Test/preview save isolation**: `SAVE_DIR` is ignored by `web/server.js`, so E2E runs pollute the shared default save dir; point the E2E fixtures at the knob that works (`OD_TMP_ROOT`).
- **Feedback & Diagnostic Trace**:
  ```
  A1. IMPORTANT (PATCH-03 review) — meta outranks names.
      cullLabels() (mapPanel.js:612) gives `.map-room-meta` (`VISITED ×N`) priority `priority + 0.5`,
      so hub meta outranks priority-4 room names. Measured on a 14-room 40-move exploration:
      7/14 names visible while 14/14 `VISITED ×1` captions stay visible.
      CAUTION: the current room's meta (`◉ CURRENT`) is the non-colour "you are here" indicator and
      must NOT be demoted behind other rooms' names.

  A2. CONFIRMED ROOT CAUSE — stale FIT camera (replaces the earlier "transient size / re-seed" guess).
      measureCanvas() (mapPanel.js:227) falls back to FALLBACK_WIDTH/HEIGHT (300x320) when the canvas
      is hidden (clientWidth/Height === 0), which is exactly the state when a turn commits while the
      player is on another tab. fitCamera() then fits against 300x320. When the tab is shown,
      renderMapPanel() takes the non-fresh branch (`applyCamera(); ensureCurrentInView()`), measures the
      real size (updating lastCanvasSize), and the ResizeObserver `changed` check therefore sees no
      change, so nothing re-fits. Repro (walk40 synthetic map, 375x812): render while hidden -> zoom 0.542,
      orbs 15 px; clicking FIT -> zoom 0.732, orbs 20 px. citadel: 0.550 vs 0.646. The force layout
      itself is fine (identical world bounds 205x293 both ways); only the camera is stale.
      (A separate, unreproduced one-off at zoom 0.232 was seen twice in long sessions; this guard is
      expected to cover the same class but do not claim it explains 0.232.)

  B. SAVE MANAGER QOL (user-approved plan + investigation findings).
     - Sort `#restore-screen` saves client-side by Recent (`updated_at` = file `mtimeMs`, default),
       numeric-aware A–Z, and `moves` descending; persist the choice in `localStorage` (try/catch).
     - Standardize displayed count, sort, and prune threshold on `moves` (`state.moves`), not the
       history-length `turns` currently displayed (they diverge: a mock save had moves=40, history=4).
     - `POST /api/saves/prune` (`{ max_moves, dry_run }`) using `engine.deleteAdventure()` per id
       (it also drops the vector index and structured SQLite rows), excluding the active adventure,
       isolating per-id failures; debounced `dry_run: true` live preview and `showConfirm()` in the UI.
     - Bounded rendering: the live default dir holds 752 saves and the list renders all of them via
       innerHTML. Render in pages (default 50) with a "Show more" control.
     - Render `save.title`, `save.location`, `save.summary` via `textContent` (HTML-injection fix).
     Evidence: /tmp/open-dungeon/local-dev/adventures held 752 saves; 748 had < 3 moves; the 40-move
     mock save was row 729 in raw readdir order (list() has no ordering and no timestamp).

  C. SAVE ISOLATION BUG (pre-existing since vercel-deployment-and-auth).
     SessionManager always calls `new AdventureEngine(saveDir(sub))`; AdventureEngine only reads
     `process.env.SAVE_DIR` when no dir is passed (engine/index.js:39-43). So for `node web/server.js`
     saves always land in `<OD_TMP_ROOT || /tmp/open-dungeon>/local-dev/adventures` (data in
     `.../local-dev/data`). The E2E fixtures set `SAVE_DIR=tests/adventures_*` and rmtree it, believing
     they are isolated; the real dir is never cleaned. Result: ~750 accumulated test saves.
     tests/ARCHITECTURE.md:83-90 documents `SAVE_DIR=... node web/server.js` as the isolation recipe,
     which is wrong for the web server. (The MCP / direct-engine paths DO honor SAVE_DIR; do not change them.)
  ```

## 2. Strict Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `web/static/js/components/mapPanel.js` | `L612` (meta priority), `L104-175` (`renderMapPanel`), `L227-231` (`measureCanvas`), `L690+` (`fitCamera`) | **A1**: names stay `0..4`, edge labels `5`. Meta priority: for the **current, hovered, and inspected** room keep `namePriority + 0.5` (adjacent to its own name); for every other room use `10 + namePriority`, so no non-focal meta can outrank any name. **A2**: record `fittedForSize` (and whether it came from the hidden-canvas fallback) in `fitCamera()`; in `renderMapPanel()`'s non-fresh branch, when `cameraMode === 'fit'` and the measured size differs from `fittedForSize` (or the last fit used the fallback), call `fitCamera()` instead of `applyCamera(); ensureCurrentInView()`. Never refit when `cameraMode` is `'manual'` or `'center'`. Do not re-seed the layout (world bounds are unaffected). |
| `web/static/js/components/saveListModel.js` | `[NEW]` | Pure ESM helpers: `sortSaves(saves, mode)` (`recent` by `updated_at` desc, `alpha` via `localeCompare(..., { numeric: true, sensitivity: 'base' })`, `moves` desc; tie-break by `title` then `id`; missing `moves`/`updated_at` treated as 0), `selectPrunable(saves, maxMoves, activeAdventureId)`, and `pageSlice(items, shown, pageSize = 50)`. |
| `engine/state.js` | `AdventureState.list` (`L126-153`) | Call `await fs.stat(filepath)` and attach `updated_at: stat.mtimeMs` to each summary. Do not change the on-disk save schema. |
| `engine/index.js` | `L202-214` | Add `async pruneAdventures(maxMoves, { dryRun = false } = {})`: validate `maxMoves` is a finite integer `>= 1`; exclude `this.adventureId`; on `dryRun` return `{ count, ids, titles, excludedActive }`; otherwise delete per id via `this.deleteAdventure(id)` and return `{ deletedIds, failedIds, keptCount }`. A failure on one id must not abort the batch. |
| `web/routes/saves.js` | `L10-33` | Register `POST /saves/prune` **before** `POST /saves/:save_id` (otherwise `prune` is captured as a save id). Validate `{ max_moves, dry_run }`; `400` on invalid threshold; return the structured result. |
| `web/templates/index.html` | `L165-177` | `.saves-toolbar` above `#save-list`: `#save-sort` (`recent`, `alpha`, `moves`), `#save-prune-moves` (`type="number" min="1" value="3"`), `#btn-prune-saves`, `#save-prune-preview`, and a `#btn-saves-more` "Show more" control. |
| `web/static/js/api/saves.js` | `L1-93` | Import from `../components/saveListModel.js`; cache the fetched saves; persist sort mode in `localStorage` (try/catch); render in pages of 50; set `title`/`location`/`summary` via `textContent` (build nodes, no `innerHTML` interpolation of save fields); display `Moves: ${save.moves ?? 0}` instead of `turns`; debounce the `dry_run: true` preview on `#save-prune-moves`; execute the prune after `showConfirm()` and toast `"Deleted X, kept Y"` (list any failures); then reload the list. |
| `web/static/style.css` | `L612-655` | `.saves-toolbar`, `.saves-sort-group`, `.saves-prune-group`, `#save-prune-preview`, `#btn-saves-more` (mobile: toolbar wraps, controls >= 44 px). |
| `web/server.js` | startup block (`~L112-120`) | **C**: when `process.env.SAVE_DIR` is set and `VERCEL !== '1'`, `console.warn` that `SAVE_DIR` is ignored by `web/server.js` and `OD_TMP_ROOT` selects the save root. No behavior change. |
| `tests/e2e/test_map_render.py`, `tests/e2e/test_barter_ui.py`, `tests/e2e/test_menu_navigation.py`, `tests/e2e/test_mobile_viewport.py` | server fixtures | **C**: launch the server with `OD_TMP_ROOT=<tests/.tmp_od_root_<name>>` (keep `MOCK_LLM`, `PORT`), derive the real save dir as `<root>/local-dev/adventures`, call `assert_save_dir_is_safe(root)` and `shutil.rmtree(root)` on teardown. Keep removing any `presets.json` the run created under the root. Do NOT touch `/tmp/open-dungeon/local-dev`. |
| `tests/unit/savesPrune.test.mjs` | `[NEW]` | `sortSaves` (three orders, numeric-aware A–Z, stable ties, missing fields), `selectPrunable` (threshold boundary `<`, active exclusion), `pageSlice`, `AdventureState.list()` `updated_at`, and `AdventureEngine.pruneAdventures` against a **temp dir under `os.tmpdir()`**: dry run deletes nothing; a real prune removes the JSON **and** the structured rows (`rooms`/`exits`/`room_visits`) **and** the vector index dir for each pruned id; the active session is excluded; invalid thresholds throw; a forced per-id failure is reported without aborting the batch; loading a save does not change its `mtimeMs`. |
| `tests/e2e/test_restore_saves.py` | `[NEW]` | Isolated `OD_TMP_ROOT` fixture; seed `<root>/local-dev/adventures/*.json` directly (varied titles, moves, mtimes, one with `<img src=x onerror=...>` in its title). Cover: default Recent order; A–Z numeric-aware order; Moves order; sort choice persisted across reload; prune preview text and count update as the threshold changes; confirm deletes only saves under the threshold and keeps the rest; pagination ("Show more") with > 50 seeded saves; the malicious title renders as text and no `onerror` fires. |
| `tests/e2e/test_map_render.py` | append | **A1**: dense fixture where every room is visited — assert no visible `.map-room-meta` belongs to a room whose name is culled (excluding the current room), and the current room's `◉ CURRENT` meta is never culled. **A2**: render while `#tab-map` is hidden (call `renderMapPanel` before opening the tab), then open it and assert `data-zoom` is within 2% of the value from a direct render, without clicking FIT; also assert a `cameraMode === 'manual'` pan survives the show. |
| `tests/ARCHITECTURE.md`, `engine/ARCHITECTURE.md`, `web/FRONTEND_ARCHITECTURE.md` | Save API / UI / env sections | Document `POST /api/saves/prune`, `saveListModel.js`, the Restore window controls, and correct the env contract: `SAVE_DIR` applies to direct-engine/MCP paths only; `web/server.js` uses `OD_TMP_ROOT` and `<root>/local-dev/{adventures,data}`. Replace the `SAVE_DIR=... node web/server.js` recipe (tests/ARCHITECTURE.md ~L83-90). |
| `openspec/changes/gravitational-node-map/specs/**` | tail | Add a small requirement for the Restore window (sort modes, move-threshold prune with preview and active-session exclusion, `textContent` rendering). No existing spec covers `/api/saves` or the restore screen. |
| `openspec/changes/gravitational-node-map/tasks.md`, `patch.md`, `verification.md` | Tail | Mark `P04.1`–`P04.6` `[x]`, `PATCH-04` `RESOLVED`, log verification output; keep `P03.4` `[~]` until a live LLM run produces `>= 40` moves and `>= 10` rooms. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: modify ONLY the files in the Target Context Map. The MCP / direct-engine `SAVE_DIR` behavior and the save JSON schema on disk are out of scope.
- **DO NOT DELETE EXISTING SAVES.** `/tmp/open-dungeon/local-dev/` (≈752 saves, shared `memory.db`, ≈753 index folders) is the user's local state. Never run the prune, `rm`, or `rmtree` against it. Cleaning it requires explicit user approval and will be done through the new prune UI. Tests must use their own temp roots.
- **INVARIANTS TO PRESERVE**:
  - Zero orb-to-orb overlap and zero visible label overlaps on settled graphs; culling stays batched/cached (no per-frame DOM reads; see PATCH-03 benchmark).
  - `◉ CURRENT` (the current room's meta) is never culled.
  - `POST /api/saves/prune` excludes `engine.adventureId` and goes through `engine.deleteAdventure(id)` so JSON, vector index and SQLite rows are removed together.
  - `updated_at` comes from `fs.stat` only; loading a save must not change `mtimeMs`.
  - `save.title`, `save.location`, `save.summary` are never assigned via `innerHTML`.
  - The E2E suite must leave the shared default dir untouched: the count of `/tmp/open-dungeon/local-dev/adventures/*.json` is identical before and after the full run (record both numbers in `verification.md`).

## 4. Reproduction & Verification Protocol
1. **Reproduce First (RED)** — confirm each fails before fixing:
   - `tests/unit/savesPrune.test.mjs`, `tests/e2e/test_restore_saves.py`, and the new A1/A2 tests in `tests/e2e/test_map_render.py`.
   - For C: run one existing E2E file unmodified and record that the shared default dir's save count increased (this is the RED), then switch the fixtures and record that it no longer changes.
2. **Apply Minimal Fixes (GREEN)** in this order, one commit per scope: A (`mapPanel.js`), B (save manager files), C (E2E fixtures, `web/server.js` warning, docs).
3. **Full Regression & Docs**:
   - `node --test tests/unit/savesPrune.test.mjs tests/unit/forceLayout.test.mjs tests/unit/mapGeometry.test.mjs tests/unit/popoverPlacement.test.mjs tests/unit/roomMap.test.mjs tests/unit/pathfinding.test.mjs tests/unit/structuredStore.spatial.test.mjs tests/unit/spatialIntegration.test.mjs tests/unit/spatialUndo.test.mjs`
   - `./venv/bin/python -m pytest tests/e2e/ -v` (all E2E files, since the fixtures changed)
   - `openspec validate gravitational-node-map --strict`
   - Update the three ARCHITECTURE docs, `verification.md`, `patch.md`, `tasks.md`.

## 5. Operator Notes (not code; do not implement)
- **Previewing a build through a tunnel**: start with `OD_TMP_ROOT=/tmp/od_preview_<name> MOCK_LLM=1 PORT=<port> node web/server.js`; saves are read from `$OD_TMP_ROOT/local-dev/adventures`. Setting `SAVE_DIR` has no effect.
- **A copied save JSON has no map**: spatial rows live in `$OD_TMP_ROOT/local-dev/data/memory.db`, keyed by adventure id. Save `9ad9dc13` has 0 rows in `rooms`/`exits`/`room_visits` in the shared DB, and its mock graph (2 rooms / 2 edges) is not a valid large-map fixture anyway. A real map demo needs a live run (P03.4) or seeded store rows.
- The stable-size guard was root-caused from reproduction; the first-render 0.232 zoom seen twice in long harness sessions is still unreproduced and should not be listed as fixed.
