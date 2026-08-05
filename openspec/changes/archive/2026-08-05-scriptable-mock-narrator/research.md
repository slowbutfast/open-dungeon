## Source material

2026-08-04, review of a parallel-agent proposal for spatial-map playtesting (agent discussing missions A-G against the `spatial-map-region-graph` feature):

> The verified mock path drives `node web/server.js` with the canned `MockOpenAI`, which emits a fixed `[Status: Cantina]` every single turn (`mockOpenAI.js:37`).
>
> MOCK + SPATIAL: "go west" → narrator: "[Status: Cantina]" → resolve("Cantina"); every turn → same room node → visit only, no edge. Exercisable: single-room canonicalization, undo, save/load, /api/map, /api/state. NOT exercisable: backtracking, reverse inference, self-heal, portal/time edges, name drift, region grouping, stress.
>
> The fix: `MOCK_SCRIPT_FILE` (minimal, additive). Only when process.env.MOCK_SCRIPT_FILE is set (default path unchanged, byte-identical canned narration → zero impact on existing mock tests). File = JSON array of canonical status lines. narration intent emits the next line per turn (exhaust → cycle or stop). Reuses fragmentedNarrationChunks() + appends the scripted status line — exactly what spatialIntegration.test.mjs already proves works. Engine still owns score/moves (scripted Score/Moves fields are advisory).
>
> Alternative considered and rejected: a `POST /api/playtest/mock-status` control endpoint for mid-run adaptation — more adaptive, but adds test-only surface to web/routes/game.js and couples the mock to the HTTP layer. `MOCK_SCRIPT_FILE` keeps the scripting inside the mock module where it belongs.
>
> probe_runner spawns: MOCK_SCRIPT_FILE=game/playtest/scripts/<probe>.json SAVE_DIR=game/playtest/adventures/probe-<name>/ PORT=<private>

2026-08-04, maintainer review (this session): the mechanism is sound; the mock dispatch is intent-keyed so the script must be explicit about which intents it overrides (narration, and decide opening_scene/suggestion handling); the change is a NEW spec (mock-narration-scripting), not a delta on llm-routing or game-engine, because neither owns "the mock's narration content source."

### Raised but not acted on

- **HTTP control endpoint (`POST /api/playtest/mock-status`)** for mid-run mock adaptation — rejected by the agent (adds test-only surface to `web/routes/game.js`, couples the mock to HTTP). This change agrees; not acted on.
- **Scripting arbitrary intents beyond narration** — the proposal only needs narration varied for spatial missions. opening_scene/suggestion behavior is documented but not changed (they keep their existing canned responses).
- **Folding this into `probe-runner-parallel-playtest`** — rejected because that change is complete (29/29, verified) and the mock capability is generic (usable without the runner).
- **Implementing the spatial fan-out now** — the 7-mission parallel sweep is NOT in scope here; `spatial-map-region-graph` is still 0 tasks done (uncommitted WIP). This change provides the mock capability; the sweep waits on the feature.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| MOCK_SCRIPT_FILE | env var path to a JSON array of canonical status lines the mock narration serves | A mock configuration format; an HTTP endpoint; a per-intent script |
| status line | canonical three-field `[Status: <Location> | Score: <N> | Moves: <N>]` line parsed by `parseStatusLine` | Narration prose |
| intent | the adapter tag on each mock-mode request (`narration`, `event_extraction`, `opening_scene`, `suggestion`, ...) used for dispatch (`mockOpenAI.js:63`) | A prompt substring |
| scripted narrator | a mock whose narration serves scripted lines instead of the canned Cantina narrative | The engine's real narrator; a real LLM |
| default path | behavior when MOCK_SCRIPT_FILE is unset: byte-identical canned output | The scripted path |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| `spatialIntegration.test.mjs` (in-repo, untracked) | The proven pattern: monkey-patch `client.chat.completions.create` to serve scripted narration streams and assert the room graph forms | repo-internal | 2026-08-04 |

Failed lookups: none. (The mock is fully in-repo; no external reference needed.)

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| `MOCK_SCRIPT_FILE` env var, JSON array of status lines | **Adopted** | Minimal, additive, lives in the mock module where narration content belongs | 2026-08-04 |
| HTTP control endpoint (`POST /api/playtest/mock-status`) | Rejected | Adds test-only HTTP surface + couples mock to web layer | 2026-08-04 |
| Per-intent script file (multiple files / object keyed by intent) | Rejected for v1 | Only narration needs scripting for spatial; a single array keeps it simple. Revisit if other intents need scripting | 2026-08-04 |
| Reuse `spatialIntegration.test.mjs`'s monkey-patch in probe_runner instead of a mock change | Rejected | That path requires engine access; probes drive an HTTP server and cannot monkey-patch its in-process client | 2026-08-04 |

## Patterns adopted

| Pattern | From | Lands in |
| :--- | :--- | :--- |
| Scripted narration stream served by the mock | `tests/unit/spatialIntegration.test.mjs` (installScriptedNarrator) | `engine/mockOpenAI.js` narration intent, env-gated |
| Intent-keyed dispatch preserved | `engine/mockOpenAI.js` (llm-adapter-unification, #28) | scripted narration lives INSIDE the existing `narration` case; no new dispatch key |
| Env-gated default-unchanged behavior | `probe-runner-parallel-playtest` runner env pattern | `MOCK_SCRIPT_FILE` gating in mockOpenAI.js |

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Mock hardcodes one status line | `mockOpenAI.js:37` `CANONICAL_STATUS_LINE = '[Status: Cantina \| Score: 5 \| Moves: 0]'`; narration always emits it | Read file | 2026-08-04 | stable |
| Mock dispatch is intent-keyed | `mockOpenAI.js:63` reads `options.intent`; `narration` is the default case | Read file | 2026-08-04 | stable |
| `fragmentedNarrationChunks()` exists and yields word-by-word chunks + trailing status line | `mockOpenAI.js:51-58` | Read file | 2026-08-04 | stable |
| Spatial reconcile reads status-line location as a proposal | `engine/llm.js:362` `_reconcileLocation` passes `proposedLocation` (from status line) into `reconcile` | Read file | 2026-08-04 | stable |
| Scripted narrator pattern is proven | `tests/unit/spatialIntegration.test.mjs` monkey-patches create() and asserts the room graph (west→north→east→south + reverse edges) | Read test | 2026-08-04 | stable |
| No existing `MOCK_SCRIPT_FILE` hook | `grep MOCK_SCRIPT_FILE` across engine/web/tests → empty | grep | 2026-08-04 | stable |
| Mock default is pinned by existing status-contract tests | `test_mcp_*.py`, `test_engine_status_parsing.py`, shared `parseStatusLine` contract | Repo test suite + `game-engine` spec (status-format requirement) | 2026-08-04 | stable |
| `game/playtest/scripts/` is gitignored | `git check-ignore game/playtest/scripts` → ignored (via `game/playtest/`) | git check-ignore | 2026-08-04 | stable |
| probe_runner passes env through | `tests/probe_runner.py` `environment()` builds `PORT`/`SAVE_DIR`/`MOCK_LLM`/`LLM_BACKEND`/`OPENROUTER_MODEL` | Read runner | 2026-08-04 | decays (runner may grow) |
| Spatial feature is uncommitted WIP | `roomMap.js` untracked; `engine/llm.js`/`state.js` modified; `spatial-map-region-graph` 0 tasks done | git status + openspec status | 2026-08-04 | decays (once feature lands) |

## Unverified assumptions

- **The scripted status line's `Score`/`Moves` fields are safely ignored by the engine.** The engine owns score/moves (single-owner invariant), but the exact commit path under a scripted mock hasn't been exercised for this change yet — `spatialIntegration.test.mjs` used `Score: 0`/`Moves: N` and the graph assertions passed, so this is low-risk but worth a smoke assertion. Cost to check: one integration test asserting committed score/moves come from the engine, not the script.
- **Exhausting the script (index past the last line) should cycle or hold last.** The test pattern uses `narrations[Math.min(idx, len-1)]` (hold last). This change should match that (hold last) for determinism. Cost to check: trivial; just decide and pin in a test.
- **The mock reads `MOCK_SCRIPT_FILE` at construction vs per-call.** `MockOpenAI` is constructed once per engine; a per-instance script index needs the file read either lazily per narration call or loaded at construction with a mutable index. Unchecked; implementation detail for the architecture.

## Superseded claims

- **"The registered MCP can be used for spatial playtests."** The registered `open-dungeon` MCP is mock-pinned AND single-engine; parallel spatial probes must use isolated `web/server.js` via the runner (established in `probe-runner-parallel-playtest`). Not re-litigated here.
- **"spatialIntegration.test.mjs's monkey-patch can serve probe runs."** It proves the *streaming* pattern but only works in-process; probes talk to an HTTP server, so the mock itself must support scripting. Superseded by `MOCK_SCRIPT_FILE` living in the mock module.

## Links out

- `openspec/changes/probe-runner-parallel-playtest/` — the verified container this mock capability feeds; runner env passthrough will reference `MOCK_SCRIPT_FILE`.
- `openspec/changes/spatial-map-region-graph/` — the consumer (spatial feature, 0 tasks done); missions A-G fan-out waits on it.
- `openspec/specs/llm-routing/spec.md` and `openspec/specs/game-engine/spec.md` — existing specs that pin backend selection and the status-line format contract; neither is modified by this change (new capability only).
