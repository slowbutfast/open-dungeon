## Source material

### Playtest report on the just-landed batches (2026-08-03, `general` subagent standing in for the unregistered `playtest` agent)

The two archived batches (`harden-context-history-integrity` #11/#12, `fix-score-progression` #19) were playtested with a mock-mode MCP campaign plus the pytest gates. Both passed, but two real defects surfaced that the batches did not cover:

**Defect A — raw status line leaks into `state.summary` and is replayed as context.** `engine/context.js:89` assigned the summarization LLM's output to `state.summary` verbatim. The summary is serialized to the save file and injected as `[ADVENTURE SUMMARY]` into the system message on every subsequent turn (`engine/llm.js:257`), so a summary containing `[Status: ...]`/`[CURRENT ...]` text IS replayed as context — exactly what the batch-1 spec forbids ("SHALL NOT be replayed as context"). Observed in mock mode: after auto-summarization, `save.summary == "You walk south into the noisy cantina.\n[Status: Cantina | Score: 5]"`.

**Defect B — the session-bound `open-dungeon` MCP server ran against production saves and a real LLM backend.** `dungeon_get_debug_info` reported `save_dir: game/adventures`, `memory_db_path: game/data/memory.db`, a real OpenRouter model, and ~$0.10 accumulated spend. Root cause investigated against the OpenCode docs (`/docs/mcp-servers/`, `/docs/config/`): OpenCode applies env to a local MCP server **only via the per-server `environment` block** (`mcp.<name>.environment`); a top-level `environment` is not reliably propagated to spawned servers, and OpenCode does not read root `.mcp.json` at all. The config declared env in the wrong place, so the server silently fell back to production `SAVE_DIR` and the real backend.

### Retrospective scope decision (2026-08-03)

This change documents the resulting patch and the new playtest subagent. It is a **retrospective** — the work is already implemented and verified; the artifacts record what was done and why.

### Raised but not acted on

- **Hard-failing the MCP server on production SAVE_DIR.** Deliberately kept as a warning, not a hard exit: a human may legitimately target the production save tree or want a real model for fidelity. Only the warning (visible on stderr at startup) is added.
- **Changing the playtest agent to `edit: ask`.** Kept `edit: deny` so the agent reports defects instead of silently patching them; a build agent owns fixes.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| per-server environment | The `environment` object inside `mcp.<name>` in OpenCode config, applied to the spawned server subprocess | The top-level `environment` block (session env, not propagated to MCP servers) |
| mock-first | `MOCK_LLM=1` as the default for the playtest MCP server and agent loops | Never using a real model (fidelity runs still possible by flipping to `0`) |
| retrospective change | An OpenSpec change opened after the work is already done and verified | A forward plan; all tasks are recorded as done |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| OpenCode docs — `/docs/mcp-servers/` | Local MCP servers take `type`, `command`, `cwd`, `environment`, `enabled`, `timeout`; `environment` sets vars "when running the server" | docs (website) | 2026-08-03 |
| OpenCode docs — `/docs/config/` | Config precedence; project config in `opencode.json`; `.opencode` dirs (plural names); `agents/`, `commands/`, etc. | docs (website) | 2026-08-03 |
| OpenCode docs — `/docs/agents/` | Project-level agents: `.opencode/agents/<name>.md`, frontmatter `description`/`mode`/`model`/`permission`, body = system prompt | docs (website) | 2026-08-03 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Top-level `environment` block for MCP env | Rejected | Docs show per-server `environment` is the mechanism; top-level is not propagated to spawned MCP servers | 2026-08-03 |
| Root `.mcp.json` for OpenCode | Rejected | OpenCode does not read `.mcp.json` (it is a Claude-Code-style file); kept only as a consistency copy for other clients | 2026-08-03 |
| Hard-fail server on production saves | Rejected | Warning keeps legitimate production/fidelity use possible while surfacing the hazard loudly | 2026-08-03 |

## Patterns adopted

- Reuse the shared `sanitizeForHistory` (from `harden-context-history-integrity`) as the single sanitization function at every commit point, now including `state.summary`.
- Follow the OpenCode documented per-server `environment` block for MCP server env (matches the existing `mcp.open-dungeon` block shape).

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `state.summary` is assigned raw at `engine/context.js:89` | Confirmed; no sanitization before save | Code read | 2026-08-03 | stable |
| Summary is injected into the system message every turn | `engine/llm.js:257` adds `[ADVENTURE SUMMARY]\n${state.summary}` | Code read | 2026-08-03 | stable |
| Mock auto-summarization produced a raw `[Status: ...]` line in `save.summary` | Repro: 4+ filler turns; `save.summary` contained `[Status: Cantina | Score: 5]` | Playtest save-file read | 2026-08-03 | stable |
| Session-bound MCP server resolved production saves + real backend | `dungeon_get_debug_info` → `save_dir: game/adventures`, real model, ~$0.10 spend | MCP tool output | 2026-08-03 | decays — harness version dependent |
| OpenCode applies env to local MCP servers via `mcp.<name>.environment` only | Docs `/docs/mcp-servers/` "Options" table | Web docs | 2026-08-03 | decays |
| Newly added `playtest` agent not registered until session reload | `Task` tool returned `Unknown agent type: playtest` | Task tool invocation | 2026-08-03 | stable |
| `MOCK_LLM=1` is the offline, cost-free path | `engine/llm.js:9` `getBackendType()` returns `"mock"` when `MOCK_LLM === "1"` | Code read | 2026-08-03 | stable |

## Unverified assumptions

- **That the per-server `environment` block will be applied by the currently-running OpenCode harness version.** The config now matches the documented schema; a post-restart check of `dungeon_get_debug_info` should confirm `save_dir: game/playtest/adventures` and the mock backend.
- **That the summary leak reproduces in real-model mode, not just mock.** The mock summarizer's fixed output includes a status line; a real model could also echo one. The commit point is unsanitized regardless of model, so the fix is model-independent.

## Superseded claims

- **"The session MCP server env block in `.mcp.json` is applied."** Superseded: OpenCode reads `.opencode/opencode.jsonc`, not `.mcp.json`, and requires the env in the per-server `environment` object.

## Links out

- `engine/context.js` — `summarizeOldTurns`, summary commit point
- `engine/llm.js` — `buildSystemMessage` `[ADVENTURE SUMMARY]` injection, shared `sanitizeForHistory`
- `mcp/server.js` — startup save-dir log + guard
- `.opencode/opencode.jsonc` — session + per-server MCP env
- `.opencode/agents/playtest.md` — project-level playtest subagent
- `tests/test_engine_status_parsing.py` — `TestSummarySanitization`
- `openspec/specs/game-engine/spec.md` — `Sanitized History Commit` requirement
