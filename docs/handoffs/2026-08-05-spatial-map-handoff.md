# Handoff — OpenDungeon workspace context (2026-08-05)

This is a context-preservation handoff. The session that produced the spatial-map
feature is ending; the next agent should read this to resume without re-deriving
the state of the world. Everything below is committed and pushed to `origin/master`.

## Repository state

- Branch `master`, pushed to `origin/master` (`4462eb4..bd40035`, 5 commits ahead of the old origin tip).
- Working tree is **clean** (no uncommitted changes).

### Commit history (newest first)
| Commit | What |
|---|---|
| `bd40035` | WIP checkpoint of in-progress change files (make-undo tests/handoff, mobile screenshots, config). NOT feature-complete — see "In-progress changes". |
| `9e9d77b` | Archive `spatial-map-region-graph` + `scriptable-mock-narrator`; sync `mock-narration-scripting` spec |
| `051d626` | Spatial playtest-driven fixes 8.1–8.7 (nullable direction, undo restore, os-plural, self-loop guard, locationHistory stack) |
| `5e240f1` | Probe runner (`tests/probe_runner.py`) + scriptable mock narrator (`MOCK_SCRIPT_FILE`) |
| `329f8bc` | Narrator context registry + spatial room graph (the feature) |

## Completed & archived changes (in `openspec/changes/archive/`)

- **`2026-08-04-probe-runner-parallel-playtest`** — supervised parallel probe runner (`tests/probe_runner.py`), port pool, crash-resume, teardown, `--max-concurrent`.
- **`2026-08-04-structured-narrator-context`** — `engine/contextBlocks.js` single-source block registry; `buildSystemMessage` composes from it; `sanitizeForHistory` derives its strip-set from the registry headers.
- **`2026-08-05-spatial-map-region-graph`** — the room graph. Specs synced to `openspec/specs/spatial-map/`, `narrator-context/`, and updated `game-engine`/`mcp-server`.
- **`2026-08-05-scriptable-mock-narrator`** — `MOCK_SCRIPT_FILE` env → scripted status-line sequences in `engine/mockOpenAI.js`; wired into the probe runner as `--mock-script-file`. Spec synced to `openspec/specs/mock-narration-scripting/`.

## Features now built (committed)

1. **Narrator context registry** — blocks (`[CURRENT STATUS]`, `[CURRENT INVENTORY]`, `[ADVENTURE SUMMARY]`, `[WORLD INFO & LORE]`, `[RECALLED MEMORIES]`) declared once in `engine/contextBlocks.js`; injection and sanitization derive from the same registry.
2. **Spatial room graph** (`engine/memory/roomMap.js` + `rooms`/`exits`/`room_visits` in `engine/memory/structuredStore.js`):
   - Per-turn reconciliation: `classifyTransition` (walk/portal/time/unknown), direction parsing, canonical room-name matching (stem-aware).
   - Reverse inference for reversible directions; inferred reverse edges; self-healing on contradiction.
   - Portal/time edge kinds; region splitting over walk edges only.
   - Never fabricates connectivity.
3. **State & undo**: `currentRoomId` (additive save), undo restores the pre-turn room via the visits trail, `locationHistory` stack for multi-undo, full-surface rollback.
4. **API/MCP**: `dungeon_inspect_map` / `dungeon_inspect_room`, `GET /api/map`, `current_room_id` in `/api/state`.
5. **Probe runner + scriptable mock**: `tests/probe_runner.py` for isolated parallel HTTP playtest servers; `MOCK_SCRIPT_FILE` for scripted narration.

## Playtest findings summary (all committed work verified)

**Mock-mode parallel sweep (missions A–G)** found and fixed:
- Blocker: directionless walks threw on `exits.direction NOT NULL` → schema nullable + guarded table-rebuild migration (`_migrateNullableExitsDirection`).
- Blocker: undo of first action left dangling `current_room_id` → null trail-less id + `previousLocation`.
- Major: `os`-plural stem mismatch (`Grotto`/`Grottos`) → dropped `os` from the sibilant guard.
- Minor: self-loop edges → guarded `target.id === prevRoomId`.
- Major (multi-undo): stale `previousLocation` → replaced with `locationHistory` stack.

**Live-model sweep (OpenRouter)** surfaced:
- **Narrator fidelity is the dominant variable.** `dolphin-mistral-24b` refused to move the player and eventually stopped emitting `[Status: ...]` lines entirely, so spatial slices were inconclusive (engine held position, which is correct). Only a cooperative model (`deepseek-v4-pro` + movement-forcing prompt) exercised real movement.
- **Portal-edge write loss (REPORTED, then RETRACTED — NOT a bug):** the live probe reported "step through the shimmering portal" wrote no portal edge. Controlled reproduction through all four layers (store `recordEdge`, `reconcile` + `makeRoomMapContext`, the real engine turn-commit path via `generateResponseStream`, and the live HTTP probe path) shows portal edges ARE recorded correctly (`kind='portal'`, `inferred=0`, no reverse, region split). All portal phrasings classify and produce mechanism-label directions. The live finding was a **narrator/model artifact** — the real model on that turn either didn't emit a parseable status line or didn't actually change the committed location, so no edge was warranted. **No defect; the core feature has zero known bugs.**
- Undo consistency (all depths) and cross-system non-corruption verified clean live.

## In-progress changes (do NOT treat as complete)

- `make-undo-and-trades-consistent` (23/24) — owns `tests/test_barter_engine.py`, `tests/test_undo_consistency.py`, `tests/unit/migration.test.mjs`, `tests/unit/structuredStore.test.mjs`, `docs/handoffs/2026-08-03-make-undo-and-trades-consistent.md`, `openspec/changes/make-undo-and-trades-consistent/tasks.md`. Its `status_turn` work in `engine/memory/structuredStore.js` is committed only as part of `bd40035`'s checkpoint — verify before treating as final.
- `fix-mobile-view-responsiveness` (39/40) — e2e screenshot updates (committed in `bd40035` checkpoint).
- `playtest-diagnostics-hygiene` (0/16) — per-adventure `llmTracker` scoping; `dungeon_get_debug_info` cost is process-global (approximate per-probe).
- `integrate-online-database` (no tasks).

## Planned next change (now proposed: `narrator-style-fidelity`)

**`narrator-style-fidelity`** (proposed 2026-08-05, in `openspec/changes/narrator-style-fidelity/`) — make the narrator a flexible stylist that leans into the user's opening tone, then locks in and stays consistent, AND fix status-line fidelity. Key design points:
- A style directive in `DEFAULT_SYSTEM_PROMPT` + presets: "adopt the player's implied style, then do not drift."
- Capture the adopted style once and pin it as a `[NARRATOR STYLE]` registry block (one-block addition, sanitizer auto-covered).
- **Status-line compliance fix is the real defect** — the narrator MUST always emit `[Status: ...]` and advance `Location` when it narrates movement; without it the spatial map freezes.
- **Open product decision:** should the default narrator move the player on directional verbs (mobile) or stay conservative? "Flexible style" (tone) and "mobile narrator" (world-generation) are orthogonal — this change can pin style without deciding movement.

### Why it exists (the diagnostic evidence)

Four **natural** live-LLM playtests (wanderer / explorer / quest-seeker / storyteller, ~11 turns each, played as a human would) all converged on one wall: the fiction moved the player through many places, but the spatial map froze at 1–3 rooms. Root cause identical in all four: the narrator (`dolphin-mistral-24b`) keeps echoing a **stale location in its `[Status: ...]` line** even after its prose narrates travel. The engine commits location from the status line by design, so it never sees a new location to reconcile. The engine behaved per-contract in every run (moves/score/inventory/history clean); the narrator's status line and scene narration diverged. Portal/time edges verified correct in the same round.

## Open items / suggested next steps

1. **~~Investigate the portal-edge write loss~~ — CLOSED: false positive.** The portal edge records correctly through every layer (verified 2026-08-05). The live finding was narrator variance.
2. **Implement `narrator-style-fidelity`** — the proposed change (status mandate + style directive + `[NARRATOR STYLE]` block). This is the highest-value next work; its acceptance gate is one natural live playtest where the map grows past 3 rooms.
3. **GH issues opened:**
   - #35 — Spatial map visualization + pathfinding (phase 2)
   - #36 — Narrator status-line fidelity: stale Location echo freezes the map (tracks `narrator-style-fidelity`)
   - #37 — Player's custom persona silently overridden by injected default character (found by storyteller probe)
   - #38 — Recover from stale status line: propose rooms from narrative landmarks (deferred fallback)
4. Archive/review the in-progress changes (`make-undo-and-trades-consistent` 23/24, `fix-mobile-view-responsiveness` 39/40) — the checkpoint commit `bd40035` includes their WIP.

## Test commands

```bash
npm run test:unit                                   # node --test tests/unit/*.test.mjs (102 pass)
venv/bin/python -m pytest tests/ -q --ignore=tests/test_cli_behavior.py \
  --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py \
  --ignore=tests/test_live_llm.py                   # broad suite (bare python3 lacks pytest)
MOCK_LLM=1 venv/bin/python -m pytest tests/test_mcp_spatial.py tests/test_shared_status_parser.py -q
```

## Conventions / guardrails

- `playtest` subagents must NOT use the registered `dungeon_*` MCP tools in parallel (single-engine collision). Drive isolated probe servers over HTTP via `tests/probe_runner.py`.
- MOCK_LLM=1 for routine loops; real model (OpenRouter) only when required, with cost flagged.
- Never write to `game/adventures/` (production); use `game/playtest/`.
- The mock narrator is a fixed "Cantina" status line unless `MOCK_SCRIPT_FILE` is set.
