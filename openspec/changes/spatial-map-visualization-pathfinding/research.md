## Source material

Exploration (2026-08-06, peer-engineer whiteboard):

- "can we build a visualization or pathfinding layer on top of it? do we have empirical evidence to prove our feature is hardened enough to add this QoL feature/enhancement?"
- Prior exploration of the spatial feature (2026-08-04) explicitly deferred these as phase-2: "dungeon_path_to (BFS), dungeon_navigate, frontend map render — deferred to phase 2+."
- The peer asked to "propose a new openspec change for this visualization/pathfinding feature, but only write the research.md and proposal.md artifacts."
- GH #35 ("Spatial map visualization + pathfinding (phase 2 of spatial-map-region-graph)") is the tracking issue for this exact work; its body scopes the two features (visualization modes + BFS routing) and the open questions (shortest-vs-first route; time-edge routability).

### Raised but not acted on

- **`dungeon_navigate` (LLM-free movement along a known edge)** — mentioned in early exploration, deferred. Not in GH #35's scope; could be a follow-up once `dungeon_path_to` exists.
- **Frontend graph-dependency / canvas library** — originally rejected at proposal level (vanilla JS, no build step); revisited as *vendoring* (a vendored ESM library needs no build step and no CDN), left open. See Candidate tech.
- **A "closed region" flag** (mark an old region unreachable forever) — deferred in the spatial change; not needed for visualization/pathfinding.
- **Live-narrator re-verification gate** — the peer raised that the QoL layer's *visible payoff* depends on the narrator actually moving the player (the status-line fidelity work). This change should not block on it, but the acceptance evidence should note it. See research "Unverified assumptions".
- **Verification harness (`synthetic-narrator` world-spec mock + `spatial-playtest-verification` groundedness checker / artifact generator)** — deferred out of phase 2 as a separate change; the new `verification.md` artifact rewards it, but it is test infrastructure and would balloon the feature change.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Region / component | A connected set of rooms reachable by walk edges only (union-find in `computeRegions`) | A named area in the fiction |
| Walk edge | A traversable path between rooms; the only kind `computeRegions` unions on | A portal or time edge |
| Portal edge | A labeled mechanism crossing a region seam (`kind='portal'`) | A walkable path |
| Inferred edge | A reverse edge added without the player walking it (`inferred=1`) | A traversed/confirmed edge |
| Cartographic render | A map view where rooms are regions and walk edges are drawn as paths | The raw node-graph debug view |
| `dungeon_path_to` | Proposed MCP tool answering "route from current room to room X" | `dungeon_navigate` (move-along-edge, deferred) |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| GH #35 | The scoped feature request: two render modes + BFS routing + `dungeon_path_to`/`/api/path` surface | — | 2026-08-06 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Graph-rendering library (e.g. d3-force, cytoscape) | Open — vendoring revisited | A *vendored* ESM library needs no build step and no CDN, so the zero-build constraint does not exclude it; the real trade-off is a ~500 KB committed asset vs hand-rolled interaction (zoom/pan/hit-testing). Default: hand-rolled canvas for v1; library as a follow-up if interaction grows | 2026-08-06, revisited 2026-09-12 |
| Canvas-based custom renderer | Adopted (planned default) | Matches the zero-build constraint with no committed asset; both modes (cartographic paths + node graph) are drawable with canvas primitives. Pending the renderer decision (see the library row) | 2026-08-06, revisited 2026-09-12 |
| Pure BFS in a new `engine/memory/pathfinding.js` module | Adopted (planned) | Mirrors `scoring.js`/`roomMap.js` pure-module pattern; unit-testable without an LLM | 2026-08-06 |
| `dungeon_path_to` MCP tool + `GET /api/path?to=<roomId>` | Adopted (planned) | Reuses the read-through freshness pattern already established for `dungeon_inspect_map`/`room` | 2026-08-06 |

## Patterns adopted

- **Pure module + thin engine proxy** (from `scoring.js`, `roomMap.js`): BFS lives in a pure `pathfinding.js`; `AdventureEngine.getPath(...)` proxies; MCP/web stay thin.
- **Read-through freshness** (from `memory-freshness-read-through`): the new MCP tool reuses the shared `forceFlushBeforeRead` helper, not a per-tool ceremony.
- **Registry/API shape reuse**: `/api/map` already returns `{ rooms, edges, regions, current_room_id }`; visualization consumes it directly, pathfinding extends it.
- **Vertical-slice boundaries (VSA)**: two slices — *Pathfinding* (engine module → `getPath` proxy → `dungeon_path_to` → `/api/path`) and *Visualization* (`api/map.js` client → `components/mapPanel.js` → sidebar/mobile tab → e2e). Each slice co-locates its data access, logic, and surface; no cross-slice coupling.

## Decisions locked

- **BFS = shortest-hop** on unweighted edges; this closes GH #35's "shortest-vs-first" open question — there is no separate shortest-path concern.
- **Time edges excluded** from routing (narratively odd).
- **Inferred reverse edges routable** — they are recorded connectivity and the primary mechanism for returning somewhere; a path exists only over edges actually recorded, never assumed.
- **Walk-only for v1**; a cross-region target with no portal yields the designed `different_region` "no known route" signal (a portal-admit mode is a possible follow-up).
- **Null-direction edges are routable** (directionless one-way walks are real connectivity) and surface a fallback direction label.
- **Deterministic ordering**: adjacency must be sorted (`direction ?? ''`, then `to_room`) before the BFS sweep, because `getEdges` is an unsorted `SELECT *`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `computeRegions` is union-find over walk edges only | It skips non-walk kinds and unions only `walk` edges; returns `[{ room_ids }]` per component | Read `engine/memory/roomMap.js:272-303` | 2026-08-06, re-verified 2026-09-12 | low |
| `GET /api/map` returns `{ rooms(id,name,first_turn,last_visit_turn,visit_count), edges(from,direction,to,kind,inferred), current_room_id, regions }` | `getMap` at `engine/index.js:353-385` | Read source | 2026-08-06, re-verified 2026-09-12 | low |
| No BFS / pathfinding exists anywhere in engine, MCP, or web | grep for `bfs\|pathfind\|getPath\|dungeon_path` returned nothing outside node_modules | Grep | 2026-08-06, re-verified 2026-09-12 | stable — clean surface |
| Frontend UI modules live in `web/static/js/ui/` (`renderers.js`, `screens.js`, `toast.js`), zero build step; self-contained panels live in `web/static/js/components/` (`actionChips.js`, `barterModal.js`); per-domain API clients live in `web/static/js/api/` (`memory.js` exports `syncState`/`syncMemoryAndLore`) | `ls` the three dirs; repo has no bundler in package.json | Read filesystem + package.json | 2026-08-06, re-verified 2026-09-12 | stable |
| `GET /api/map` route exists at `web/routes/game.js:264`; MCP tools under `mcp/tools/` incl. `map.js` | Read route file + tool dir | 2026-08-06, re-verified 2026-09-12 | stable |
| Spatial unit/MCP coverage is green (138/141; the 3 red are `INTENDED TO FAIL TODAY` TDD scaffolding for the separate `make-undo-and-trades-consistent` change, not spatial; `tests/test_mcp_spatial.py` 6/6) | `npm run test:unit`; `python -m pytest tests/test_mcp_spatial.py` | 2026-08-06, re-verified 2026-09-12 | decays |
| The spatial feature is archived and committed; narrator-fidelity fixes (status mandate, recovery landmarks) landed afterward | `git log` shows `narrator-style-fidelity` + `system-prompt-response-shape` archived, `de9cffe`/`e290ff3` recovery fixes | Git log | 2026-08-06 | low |
| The frontend post-turn refresh seam is `web/static/js/api/streaming.js` (`renderState` fires at lines 29/161/181); sidebar tabs are declared at `web/templates/index.html:296-298` and wired in `ui/screens.js:109` `switchSidebarTab`; a mobile tab bar mirrors them at `index.html:401` | Read streaming.js + index.html + screens.js | Read source | 2026-09-12 | stable — the map panel mount + refresh points |
| The narrator-fidelity acceptance gate PASSED: a natural default-model playtest grew the map **1 → 9 rooms** (via the D6 stale-status recovery backstop; logged at `docs/handoffs/2026-08-05-narrator-style-fidelity.md:50-57`, probe `game/playtest/results-accept-gate-live.json`). The same session surfaced GH #39 (first-person natural actions recorded no walk edges, so rooms grew while edges stayed near 0); that is fixed and covered by `tests/unit/spatialIntegration.test.mjs` | Read handoff + results JSON + unit test | 2026-09-12 | low |

## Unverified assumptions

One assumption remains live; the other two from the original audit are now resolved (evidence in "Verified facts" above).

| Assumption | Cost to check | Status |
| :--- | :--- | :--- |
| BFS over the recorded graph is meaningful — enough walk edges accumulate in real play to make routing useful (the narrator-fidelity gate proved rooms grow, and GH #39 fixed first-person edge recording, but the *edge density* of a natural session is not yet measured) | One natural live playtest (Wanderer scenario), then count rooms/edges in `GET /api/map` and inspect edge density | **LIVE — the pre-build gate for the visualization slice** |
| ~~A natural live playtest grows `/api/map` past 3 rooms~~ | — | **RESOLVED** — acceptance gate passed 1 → 9 rooms (narrator-fidelity handoff) |
| ~~The frontend has a place to mount a map panel without a layout overhaul~~ | — | **RESOLVED** — sidebar tabs (`index.html:296-298`), `switchSidebarTab` (`screens.js:109`), mobile tab bar (`index.html:401`), and a `components/` + `api/` convention already exist |

## Superseded claims

| Was believed | Why it was wrong | Replaced by |
| :--- | :--- | :--- |
| The live "portal-edge missing" finding was an engine bug | Controlled repro across all four layers showed portal edges record correctly; it was narrator variance | Documented false positive (see spatial handoff) |
| Visualization/pathfinding would look broken because the map froze in live play | The freeze was narrator status-line fidelity, now addressed by implemented `narrator-style-fidelity` + recovery-landmark fixes | The QoL layer is buildable; the live-growth gate **PASSED** (1 → 9 rooms, `results-accept-gate-live.json`); the remaining live gate is edge density |
| The renderer must be hand-rolled canvas; a graph library is out of the question | A *vendored* ESM library needs no build step and no CDN, so the zero-build constraint does not exclude it; the real trade-off is payload (~500 KB) vs hand-rolled interaction | Renderer left open — hand-rolled canvas as the v1 default, library as a follow-up |

## Adjacent risks (load-bearing GH issues)

- **#31 frontend zombie store / two render paths per turn** — the visualization slice lands on exactly this render path; the map panel's refresh wiring touches the code #31 flags.
- **#43 OpenSpec spec drift** (`make-undo-and-trades-consistent` `status_turn`, `playtest-diagnostics-hygiene`, `presets.json` runtime override) — affects the `verification.md` adherence matrix and, for `presets.json`, can distort narrator-driven map growth.
- **#34 playtest MCP lacks parallel-session isolation** — affects the acceptance playtest for this change.

## Links out

- GH #35 — the tracking issue this change implements.
- `openspec/changes/archive/2026-08-05-spatial-map-region-graph/architecture.md` — v1 "Non-Goals" that deferred this work; D1 schema, `computeRegions` design.
- `engine/ARCHITECTURE.md` — read-through freshness, MCP tool patterns.
- `openspec/specs/mcp-server/spec.md` — where a `Spatial Pathfinding Tools` requirement would land.
- `docs/handoffs/2026-08-05-spatial-map-handoff.md` — prior context incl. the portal false-positive closure and narrator-fidelity direction.
