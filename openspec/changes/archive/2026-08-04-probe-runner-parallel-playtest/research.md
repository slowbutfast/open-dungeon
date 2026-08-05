## Source material

2026-08-04, discussion with the maintainer (rounds 1-3 on GH #34, "Playtest MCP: no parallel-session isolation — concurrent subagents collide, OOM-kill servers, lose reports"):

> Round 1 — maintainer: "open a gh issue for issues running the playtest mcp in parallel with multiple playtesting subagents. this is the transcript of one of those subagents: (probe #13) ..."

Probe #13 transcript (abridged, verbatim), 2026-08-04 12:29-04:32 UTC:

> The registered open-dungeon MCP tools are MOCK-pinned (MOCK_LLM=1). DO NOT use them. Spawn your OWN server: SAVE_DIR=game/playtest/adventures/probe-B2 MOCK_LLM=0 LLM_BACKEND=openrouter PORT=5102 node web/server.js
>
> /tmp/opencode write is blocked by the sandbox policy here — keep the log in the repo sandbox dir.
> Server is up with the real model (cognitivecomputations/dolphin-mistral-24b-venice-edition).
> The action endpoint streams SSE. I'll write a helper script to drive actions.
> Item acquired: credits (held). ... datapad (turn 7).
> Connection dropped — checking server health:
> Server died. Process died silently (no crash trace). Save may be persisted — restart and check.
> Server restarted and the save e0ce7b03.json persisted. Check if state auto-restored:
> State wasn't auto-restored. Load the save:
> Server died again on an SSE action request. Server dies silently on SSE action requests.
> [transcript cuts off mid-turn — probe #13 never returned its report]

Corroborating artifacts, `game/playtest/adventures/probe-B2/`:
- `server.log` — 3 startups, then `EXIT_CODE=137 at Tue Aug  4 04:32:31 UTC 2026` (SIGKILL, consistent with OOM)
- `run.sh` — hand-written spawn: `SAVE_DIR=.../probe-B2 MOCK_LLM=0 LLM_BACKEND=openrouter PORT=5102 node web/server.js >> server.log 2>&1`
- `act.js` — hand-written SSE→text parser for `/api/action`
- `e0ce7b03.json` — persisted save; state was NOT auto-restored after restart

Round 2 — maintainer: "fixing this", then "implementing A", then "then would be the cost factor for implementing option B from the previous round instead of A2?", then "implementing B".

Decision reached (round 3): implement **Option B — a supervised probe runner** rather than Option A2 (multi-session MCP server). Reasons: B fixes the observed transcript failures directly, touches no engine code, and packages infrastructure that already exists. A2 fixes a collision the probes never hit (they bypass the registered MCP because it is mock-pinned).

### Raised but not acted on

- **Option A2 (multi-session MCP server, `Map<sessionId, AdventureEngine>`)** — deferred. The engine's persistent layer is already multi-tenant (memory.db, vectra indexes, save files all keyed by adventure_id), so A is feasible, but: it needs per-session LLM backend config (LlmOrchestrator reads MOCK_LLM at construction, engine/llm.js:225), llmTracker is module-global and would need the 0/16 `playtest-diagnostics-hygiene` scoping first, and it adds a cost-guardrail problem (registered MCP becomes real-model-capable). Not needed until parallel mock subagents actually collide on the shared registered MCP — no such repro exists today.
- **Auto-restore on boot** (web server loads the latest save at startup) — deliberately NOT in scope. The runner performs resume via `POST /saves/:save_id`, which already exists (`web/routes/saves.js:11`). Adding boot-time auto-restore to the web server is a behavior change for the web UI and production saves; out of scope for a tooling fix.
- **Multi-session in one process** (A2's memory model — N engines, ~same RSS as one process) — superseded by B; see Superseded claims.
- **Sandbox `/tmp/opencode` write policy** — the transcript notes the sandbox blocks `/tmp/opencode` writes, so probe logs land in the repo sandbox dir instead. This is a sandbox/environment fact, not something the runner changes; the runner should log to the repo's gitignored `game/playtest/` tree to match.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| probe | A single autonomous playtest run driving one isolated server (e.g. probe-B2, probe #13) | The registered MCP `dungeon_*` tool set |
| runner | A supervisor process that spawns/health-checks/tears-down one or more probe servers | The MCP server; the web server; a test |
| registered MCP | The `open-dungeon` MCP server launched by the opencode client (`mcp/server.js`, MOCK_LLM=1) | A probe's own `node web/server.js` |
| SAVE_DIR | Directory where `{adventureId}.json` save files land; set per process | The shared `dataDir` memory.db (derived from SAVE_DIR's parent) |
| resume | Restoring a probe's in-memory state from its persisted save after a server crash/restart | The runner's own health-check retry loop |
| concurrency cap | `--max-concurrent N` limiting how many probe servers run at once | A per-process resource limit; an OOM fix |
| probe-B2 dir | The `game/playtest/adventures/probe-B2/` sandbox SAVE_DIR (gitignored) | Any committed file |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| `better-sqlite3` WAL mode (`engine/memory/structuredStore.js:31-33`) | Multiple connections to one memory.db are safe in-process; WAL allows concurrent readers + one writer; better-sqlite3 is synchronous | MIT (in-repo dependency) | 2026-08-04 |
| vectra `LocalIndex` (`engine/memory/vectorStore.js`) | Per-adventure index dirs `dataDir/indexes/{adventureId}/`; no server; per-adventure isolation already present | Apache-2.0 (in-repo dependency) | 2026-08-04 |
| opencode MCP client config (`.opencode/opencode.jsonc`) | Registered MCP pinned `SAVE_DIR=game/playtest/adventures`, `MOCK_LLM=1`; bash-side servers inherit shell env, not this block | repo-internal | 2026-08-04 |

Failed lookups: cgroup memory limit at `/sys/fs/cgroup/memory.max` — read blocked by sandbox policy (external-dir deny). OOM hypothesis is therefore UNVERIFIED; `EXIT_CODE=137` (SIGKILL) is consistent with OOM but also with a sandbox watchdog. See Unverified assumptions.

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Python runner (`tests/probe_runner.py`) | **Adopted** | Sits beside `tests/adventures_pt_shared/_pt_runner.py` and the pytest gates; probes already used Python (`driver.py`) and the parallel-isolation precedent is Python | 2026-08-04 |
| Node runner | Rejected | `autoplay_runner.js` is MCP-client-side, not a web-server supervisor; no `scripts/` dir exists; Python keeps the runner adjacent to test tooling | 2026-08-04 |
| `?format=json` on `/api/action` | Adopted as optional piece | Removes per-probe SSE parser for every curl probe; runner keeps its own SSE parser as fallback so it does not depend on the server change | 2026-08-04 |
| New `scripts/` or `tools/` dir | Rejected | No such dir exists; runner is a test-harness artifact, belongs under `tests/` where `_pt_runner.py` and `autoplay_runner.js` already live | 2026-08-04 |

## Patterns adopted

| Pattern | From | Lands in |
| :--- | :--- | :--- |
| Isolated spawn per agent (unique SAVE_DIR per spawned server) | `tests/adventures_pt_shared/_pt_runner.py` | `tests/probe_runner.py` |
| State-file resume (save adventure_id, reload before each op) | `tests/autoplay_runner.js` | `tests/probe_runner.py` resume-on-crash path |
| Health-check before driving | web `GET /api/ping` (`web/routes/game.js:66`) + probe hand-rolled curl | runner startup + restart loop |
| Resume via existing route | `POST /saves/:save_id` (`web/routes/saves.js:11`) | runner crash-recovery |
| SSE→text parse | probe `act.js` / `driver.py` | runner's SSE parser (fallback; JSON mode preferred) |

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Web server has a resume route | `POST /saves/:save_id` calls `engine.load` and returns title | Read `web/routes/saves.js:11-19` | 2026-08-04 | stable |
| Web server has a health route | `GET /api/ping` returns status/backend/cost | Read `web/routes/game.js:66-238` | 2026-08-04 | stable |
| `/api/action` is SSE-only | Always sets `Content-Type: text/event-stream` and streams `data: {...}` frames | Read `web/routes/game.js:385-405` | 2026-08-04 | stable (this change may add optional JSON) |
| SAVE_DIR is per-process env, no safe default | `engine/index.js:49-58`: falls back to `game/adventures` if unset; `web/server.js:20-22` defaults MOCK_LLM=1 | Read engine + web startup | 2026-08-04 | stable |
| `dataDir` is derived from SAVE_DIR | `engine/index.js:66`: `path.join(saveDir, '..', 'data')`; probe-B2 → `game/playtest/adventures/data` | Read engine; `node -e` path resolution | 2026-08-04 | stable |
| Memory store is multi-tenant | `memory.db` rows keyed by adventure_id (events, inventory, lore, extraction_state); vectra indexes per-adventure dir | Read `engine/memory/structuredStore.js` + `vectorStore.js` | 2026-08-04 | stable |
| Registered MCP is mock-pinned | `.opencode/opencode.jsonc` sets `MOCK_LLM=1`, `SAVE_DIR=game/playtest/adventures` | Read config | 2026-08-04 | decays |
| Probe server died with SIGKILL | `probe-B2/server.log` final line `EXIT_CODE=137` | Read log | 2026-08-04 | stable artifact |
| Probe state not auto-restored after restart | Transcript: "State wasn't auto-restored. Load the save:" | Transcript + `e0ce7b03.json` persisted | 2026-08-04 | stable |
| Probe sandbox dirs are gitignored | `.gitignore` has `game/playtest/` | Read `.gitignore`; `git check-ignore` probe dirs | 2026-08-04 | stable |
| `playtest-diagnostics-hygiene` change exists (llmTracker scoping) | 0/16 tasks; proposal scopes `engine/llmTracker.js` per-adventure | `openspec list --json` + read proposal | 2026-08-04 | decays |
| No `scripts/` or `tools/` dir exists | `ls scripts/ tools/` empty | shell | 2026-08-04 | stable |

## Unverified assumptions

- **OOM was the kill cause.** `EXIT_CODE=137` = SIGKILL; the sandbox cgroup limit could not be read (blocked). Could equally be a sandbox watchdog or an external kill. The runner's concurrency cap + guaranteed teardown mitigate orphans regardless; the cap value should be conservative. Cost to check: reading the sandbox cgroup limit / dmesg from outside the blocked paths.
- **Real-model server RSS ≈ 150-200 MB.** Observed `~170MB` via `ps` on the two surviving `node web/server.js` PIDs; the cgroup read was blocked, so the multiplier under load is unconfirmed.
- **`_pt_runner.py` can be extended rather than copied.** It is MCP-stdio based and MOCK-only; whether the same file grows a web-server path or a sibling is created is a design decision, not yet made.
- **A parallel real-model fan-out is the intended workload.** The 2026-08-03 sweep (probes B1-B4) is the evidence; issue #33 (experiment matrix) implies more such sweeps. Reasonable, not contractual.

## Superseded claims

- **"The engine can't host concurrent sessions."** Originally the issue framed #34 as a server-isolation defect. Investigation showed the persistent layer (memory.db, vectra indexes, save files) is already multi-tenant keyed by adventure_id, and `MemoryManager.flushIfReady` re-initializes on adventure switch (`memoryManager.js:55`). What remains single-slot is the in-memory `AdventureState`/`MemoryManager` per engine instance — which is why the fix chosen (B, process-per-probe) sidesteps it entirely rather than refactoring it.
- **"A2's engine registry is the root fix."** Replaced by B after cost analysis: the transcript failures all occur in the side-server workflow, not the registered MCP; B fixes them with no engine churn. A2 remains a valid future direction if parallel *mock* subagents collide on the shared registered MCP.

## Links out

- `openspec/changes/playtest-diagnostics-hygiene/` — per-adventure llmTracker scoping; the 0/16 change that A2 would depend on. B does not depend on it.
- `tests/ARCHITECTURE.md` — test-suite architecture doc (AGENTS.md requires updating it for test changes).
- `.opencode/skills/open-dungeon-cli-playtest/SKILL.md` — the CLI/probe playtest skill that documents spawn/SAVE_DIR/PORT; the runner should be referenced here.
- GH #34 — the issue this change addresses; GH #33 — the experiment-matrix consumer of parallel probes.
