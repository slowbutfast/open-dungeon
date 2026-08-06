## Source material

Exploration (2026-08-06, peer-engineer whiteboard):

- "can we build a visualization or pathfinding layer on top of it? do we have empirical evidence to prove our feature is hardened enough to add this QoL feature/enhancement?"
- Prior exploration of the spatial feature (2026-08-04) explicitly deferred these as phase-2: "dungeon_path_to (BFS), dungeon_navigate, frontend map render — deferred to phase 2+."
- The peer asked to "propose a new openspec change for this visualization/pathfinding feature, but only write the research.md and proposal.md artifacts."
- GH #35 ("Spatial map visualization + pathfinding (phase 2 of spatial-map-region-graph)") is the tracking issue for this exact work; its body scopes the two features (visualization modes + BFS routing) and the open questions (shortest-vs-first route; time-edge routability).

### Raised but not acted on

- **`dungeon_navigate` (LLM-free movement along a known edge)** — mentioned in early exploration, deferred. Not in GH #35's scope; could be a follow-up once `dungeon_path_to` exists.
- **Frontend graph-dependency / canvas library** — rejected at proposal level (vanilla JS, no build step; the render is DOM/canvas, not a library).
- **A "closed region" flag** (mark an old region unreachable forever) — deferred in the spatial change; not needed for visualization/pathfinding.
- **Live-narrator re-verification gate** — the peer raised that the QoL layer's *visible payoff* depends on the narrator actually moving the player (the status-line fidelity work). This change should not block on it, but the acceptance evidence should note it. See research "Unverified assumptions".

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
| Graph-rendering library (e.g. d3-force, cytoscape) | Rejected | The frontend is zero-build vanilla JS; a library is a heavy dependency for a 2-mode render that is hand-rollable in DOM/canvas | 2026-08-06 |
| Canvas-based custom renderer | Adopted (planned) | Matches the zero-build constraint; both modes (cartographic paths + node graph) are drawable with canvas primitives | 2026-08-06 |
| Pure BFS in a new `engine/memory/pathfinding.js` module | Adopted (planned) | Mirrors `scoring.js`/`roomMap.js` pure-module pattern; unit-testable without an LLM | 2026-08-06 |
| `dungeon_path_to` MCP tool + `GET /api/path?to=<roomId>` | Adopted (planned) | Reuses the read-through freshness pattern already established for `dungeon_inspect_map`/`room` | 2026-08-06 |

## Patterns adopted

- **Pure module + thin engine proxy** (from `scoring.js`, `roomMap.js`): BFS lives in a pure `pathfinding.js`; `AdventureEngine.getPath(...)` proxies; MCP/web stay thin.
- **Read-through freshness** (from `memory-freshness-read-through`): the new MCP tool reuses the shared `forceFlushBeforeRead` helper, not a per-tool ceremony.
- **Registry/API shape reuse**: `/api/map` already returns `{ rooms, edges, regions, current_room_id }`; visualization consumes it directly, pathfinding extends it.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `computeRegions` is union-find over walk edges only | It skips non-walk kinds and unions only `walk` edges; returns `[{ room_ids }]` per component | Read `engine/memory/roomMap.js:272-317` | 2026-08-06 | low |
| `GET /api/map` returns `{ rooms(id,name,first_turn,last_visit_turn,visit_count), edges(from,direction,to,kind,inferred), current_room_id, regions }` | Read `engine/index.js:360-383` | 2026-08-06 | low |
| No BFS / pathfinding exists anywhere in engine, MCP, or web | grep for `bfs\|pathfind\|getPath\|dungeon_path` returned nothing outside node_modules | Grep | 2026-08-06 | stable — clean surface |
| Frontend UI modules live in `web/static/js/ui/` (`renderers.js`, `screens.js`, `toast.js`), zero build step | `ls web/static/js/ui/`; repo has no bundler in package.json | Read filesystem + package.json | 2026-08-06 | stable |
| `GET /api/map` route exists at `web/routes/game.js:267`; MCP tools under `mcp/tools/` incl. `map.js` | Read route file + tool dir | 2026-08-06 | stable |
| Spatial unit/MCP coverage is green (138/141; the 3 red are `INTENDED TO FAIL TODAY` TDD scaffolding for the separate make-undo change, not spatial) | `npm run test:unit` | 2026-08-06 | decays |
| The spatial feature is archived and committed; narrator-fidelity fixes (status mandate, recovery landmarks) landed afterward | `git log` shows `narrator-style-fidelity` + `system-prompt-response-shape` archived, `de9cffe`/`e290ff3` recovery fixes | Git log | 2026-08-06 | low |

## Unverified assumptions

| Assumption | Cost to check |
| :--- | :--- |
| A natural live playtest against current HEAD grows `/api/map` past 3 rooms (the narrator-fidelity fix is effective in practice) | Run one natural live playtest (Wanderer scenario) and count rooms/edges |
| BFS over the recorded graph is meaningful (enough walk edges exist in real play) | Same live playtest; inspect edge density |
| The frontend has a place to mount a map panel without a layout overhaul | Read the current index.html / screens structure |

## Superseded claims

| Was believed | Why it was wrong | Replaced by |
| :--- | :--- | :--- |
| The live "portal-edge missing" finding was an engine bug | Controlled repro across all four layers showed portal edges record correctly; it was narrator variance | Documented false positive (see spatial handoff) |
| Visualization/pathfinding would look broken because the map froze in live play | The freeze was narrator status-line fidelity, now addressed by implemented `narrator-style-fidelity` + recovery-landmark fixes | The QoL layer is buildable; the live-growth proof is a pending acceptance check |

## Links out

- GH #35 — the tracking issue this change implements.
- `openspec/changes/archive/2026-08-05-spatial-map-region-graph/architecture.md` — v1 "Non-Goals" that deferred this work; D1 schema, `computeRegions` design.
- `engine/ARCHITECTURE.md` — read-through freshness, MCP tool patterns.
- `openspec/specs/mcp-server/spec.md` — where a `Spatial Pathfinding Tools` requirement would land.
- `docs/handoffs/2026-08-05-spatial-map-handoff.md` — prior context incl. the portal false-positive closure and narrator-fidelity direction.
