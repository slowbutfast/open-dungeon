---
name: open-dungeon-cli-playtest
description: Run OpenDungeon playtests from the terminal — start the web server or Python CLI, drive the HTTP API or MCP SSE transport, and verify state without the registered MCP tools. Companion to open-dungeon-playtest (MCP-based). Merge target: both skills cover the same game; keep CLI vs MCP sections clearly separated so they can be consolidated into one SKILL.md.
license: MIT
compatibility: Requires Node.js, Python 3, and the repo's .env (or MOCK_LLM=1 for offline runs).
metadata:
  author: opencode
  version: "1.0"
---

# Open Dungeon CLI Playtest

Playtest or debug OpenDungeon **from the shell** — spawning the backend, driving the
HTTP API, and exercising the MCP server's SSE transport. For interactive
MCP-tool-driven playtesting (the `dungeon_*` tools), use `open-dungeon-playtest` instead.

> **Merge note (do not drift):** this skill and `open-dungeon-playtest` document the same
> game. When they are consolidated into one `SKILL.md`, keep a `## CLI` section here and a
> `## MCP Tools` section there, and delete the overlapping "run the server" prose from one
> of them. The run commands below are the source of truth.

---

## 1. Environment & Backends

The engine reads `.env` via dotenv (`engine/llm.js:2`). Key switches:

| Env var | Values | Effect |
| :--- | :--- | :--- |
| `MOCK_LLM` | `1` / `0` (unset) | `1` = offline mock (`MockOpenAI`), no API cost; unset/`0` = real backend |
| `LLM_BACKEND` | `openrouter` / `lmstudio` | Which backend the client builds |
| `OPENROUTER_MODEL` | e.g. `deepseek/deepseek-v4-flash` | Model used on OpenRouter |
| `SAVE_DIR` | path | Where save files land. **Unset falls back to production `game/adventures/`** — always set for playtest |
| `PORT` | int (default 5001) | Web server port |
| `MOCK_LLM=1` default | — | `web/server.js` forces `MOCK_LLM=1` if unset and binds `127.0.0.1` |

**Cost guardrail:** real backends (OpenRouter) cost money per call. Prefer `MOCK_LLM=1`
for routine playtest loops; use a real model only for fidelity checks.

---

## 2. Start the Backend (Web Server)

```bash
# Offline mock (no cost, binds 127.0.0.1)
SAVE_DIR=game/playtest/adventures MOCK_LLM=1 node web/server.js

# Real OpenRouter (costs money; binds 0.0.0.0)
SAVE_DIR=game/playtest/adventures node web/server.js
```

Serves:
- `GET /` — web UI (`web/templates/index.html`)
- `GET /static/*` — frontend assets
- `/api/*` — JSON API (game, saves, lore, memory routers)

HTTP API surface (verified against `web/routes/*.js`, all under `/api`):
- **game.js** — `GET/POST /presets`, `GET/PUT/DELETE /presets/:index`, `GET /ping`,
  `GET/POST /state`, `POST /init`, `POST /action`, `POST /system`, `POST /summary`,
  `POST /settings`, `GET /cost`, `POST /trade/offer`, `GET /trade/offers`,
  `POST /trade`, `POST /goals`, `GET /goals`, `POST /goals/accept`,
  `POST /goals/fail`, `POST /goals/complete`, `GET /debug/info`
- **saves.js** — `GET /saves`, `POST /saves/:save_id`, `DELETE /saves/:save_id`
- **lore.js** — `POST /lore`, `POST /scan`
- **memory.js** — `GET /memory/inventory`, `GET /memory/events`,
  `POST /memory/search`, `POST /memory/inventory/add`, `GET /memory/stats`

---

## 3. Drive the HTTP API from the Shell

### Parallel Probe Runner (GH #34)

Use the supervised runner rather than hand-rolled server processes for parallel
probes (GH #34; the multi-session MCP Option A remains deferred):

```bash
python3 tests/probe_runner.py run --probes probe-B1 probe-B2 \
  --mock 1 --max-concurrent 2
```

`--mock 0 --llm-backend openrouter` enables a real-model fidelity run;
`--timeout` controls readiness/request timeouts. The runner allocates `PORT`
itself, sets each probe's `SAVE_DIR` to the distinct gitignored
`game/playtest/adventures/probe-<name>` directory, and tears down every child on
normal exit or interrupt. It resumes a saved adventure after a child crash and
caps restarts. `--max-concurrent` is optional; without it all requested probes
run concurrently. `OPENROUTER_MODEL` can be passed with `--openrouter-model`.

Playtest state changes via `curl` (or any HTTP client). Examples:

```bash
BASE=http://127.0.0.1:5001/api

# Initialize a session. Param is `preset_idx` (0=LOTR, 1=Cyberpunk, 2=Coruscant
# Underworld, 3=Outer Rim). Optional: title / summary / system_prompt / character.
curl -s -X POST $BASE/init -H 'Content-Type: application/json' \
  -d '{"title":"CLI Playtest","preset_idx":2}'

# Send an action (do / say / story)
curl -s -X POST $BASE/action -H 'Content-Type: application/json' \
  -d '{"action_type":"do","text":"look around"}'

# Inspect state / inventory / events / stats / offers / goals / debug
curl -s $BASE/state
curl -s $BASE/memory/inventory
curl -s $BASE/memory/events
curl -s $BASE/memory/stats
curl -s $BASE/trade/offers
curl -s $BASE/goals
curl -s $BASE/debug/info

# Semantic memory search
curl -s -X POST $BASE/memory/search -H 'Content-Type: application/json' \
  -d '{"query":"the datachip","topK":5}'

# Execute a barter trade (trader_name + required_item)
curl -s -X POST $BASE/trade -H 'Content-Type: application/json' \
  -d '{"trader_name":"Liss","required_item":"datachip"}'

# Complete a quest goal (goal_id)
curl -s -X POST $BASE/goals/complete -H 'Content-Type: application/json' \
  -d '{"goal_id":"<id>"}'

# Undo last action — via the action endpoint with action_type "undo" (web/routes/game.js:376)
curl -s -X POST $BASE/action -H 'Content-Type: application/json' \
  -d '{"action_type":"undo","text":""}'
```

---

## 4. MCP Server (SSE) for Agent Playtesting

For tool-driven playtesting without the registered `dungeon_*` tools, run the MCP server
directly over SSE and call it like any MCP endpoint:

```bash
# stdio (default) — what the registered open-dungeon MCP config uses
node mcp/server.js

# SSE transport for HTTP-based MCP clients
node mcp/server.js --transport sse           # http://localhost:3100/sse
node mcp/server.js --transport sse --port 8080
```

- `GET /health` — health check
- `GET /sse` — SSE connection (sessionId)
- `POST /message?sessionId=<id>` — JSON-RPC messages
- Tools exposed: `dungeon_init_session`, `dungeon_send_action`, `dungeon_inspect_state`,
  `dungeon_inspect_inventory`, `dungeon_inspect_history`, `dungeon_inspect_stats`,
  `dungeon_inspect_goals`, `dungeon_complete_goal`, `dungeon_inspect_lore`,
  `dungeon_inspect_events`, `dungeon_search_memories`, `dungeon_inspect_offers`,
  `dungeon_execute_trade`, `dungeon_get_debug_info`, `dungeon_undo_action`,
  `dungeon_list_saves`, `dungeon_load_save`.

The MCP server logs the resolved `SAVE_DIR` at startup — check stderr to confirm saves
will land in the sandbox, not production.

---

## 5. Python CLI Game (macOS terminal launcher)

```bash
# Direct CLI playtest (macOS/any shell)
python3 game/aidungeon_cli.py

# Launch in a new macOS Terminal window (scales font, runs CLI, restores on exit)
./game/run_game.sh

# Load a specific saved adventure on startup
python3 game/aidungeon_cli.py --load <adventure_id>
```

> The Python CLI proxy (`game/adventure_engine.py`) and its tests
> (`test_cli_behavior.py`, `test_pty_integration.py`, `simulate_playtest.py`) are
> **deprecated** per AGENTS.md — may fail; don't block work on them.

---

## 6. Diagnostics Utilities (`diagnostics/`)

```bash
python3 diagnostics/chat.py                    # interactive chat; -s prompt, -t temp
python3 diagnostics/diagnose_network.py        # connectivity to configured host:port
python3 diagnostics/list_models.py             # list loaded models on the backend
python3 diagnostics/test_openai_client.py      # verify OpenAI SDK client setup
python3 diagnostics/test_openai_streaming.py   # verify streaming completions
python3 diagnostics/test_requests.py           # verify requests/HTTP setup
```

---

## 7. Automated Verification (pytest)

```bash
# Fast unit tests
python3 -m pytest -m unit -v

# Integration (spawns Node / MCP subprocess; sets isolated SAVE_DIR)
python3 -m pytest -m integration -v

# MCP test suite
python3 -m pytest tests/test_mcp_*.py -v

# E2E (Playwright browser tests against a test backend)
python3 -m pytest -m e2e -v

# Everything except the deprecated Python CLI tests
npm test
```

`tests/conftest.py` injects a fallback `SAVE_DIR=tests/.tmp_saves/default` under pytest,
so unconfigured tests never touch `game/adventures/`. Manual `node web/server.js` launches
**do not** get that default — pass `SAVE_DIR` explicitly (see §1).

---

## 8. Suggested CLI Playtest Workflow

1. Pick a mode: **mock offline** (`MOCK_LLM=1`) for routine loops, **real** for fidelity.
2. Start the server with an explicit `SAVE_DIR` sandbox (`game/playtest/adventures`).
3. Drive the loop (HTTP API §3 or SSE MCP §4), checkpointing state every few turns.
4. Verify with the inspect endpoints (state/inventory/events/stats/lore).
5. For cost visibility, read the MCP `dungeon_get_debug_info` or check `server.log`.
6. Clean up test sessions and stray saves when done.

---

## Merge plan (for consolidating into one skill)

When merging with `open-dungeon-playtest`:
- Keep this skill's §1, §2, §3, §4, §5, §6, §7 as a single `## CLI Playtesting` section.
- Keep `open-dungeon-playtest`'s MCP tool table + interactive protocol as the adjacent
  `## MCP Tools` section.
- Delete any duplicated "start the server" prose (this skill's §2 is authoritative).
- Preserve the "upfront mode selection" step from `open-dungeon-playtest` as the entry
  point, with a CLI-vs-MCP branch.
