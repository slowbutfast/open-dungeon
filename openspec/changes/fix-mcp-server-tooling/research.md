## Source material

### MCP server issues discovered during the 2026-08-02 bug-reproduction playtest

Sourced from live MCP playtesting sessions (adventures `19c9445c`, `a7acd174`, `1a3d2686`) run against `node mcp/server.js` on OpenRouter model `cognitivecomputations/dolphin-mistral-24b-venice-edition`, and from code review of `mcp/tools/*.js`.

**Issue M1 — `.mcp.json` `SAVE_DIR` env is not honored by the MCP client; playtest saves land in the production directory.**

- `.mcp.json:6-9` declares `"SAVE_DIR": "game/playtest/adventures"` in the `env` block of the `open-dungeon` server config, alongside `"MOCK_LLM": "${OPEN_DUNGEON_MOCK_LLM:-0}"`.
- During live playtest, `dungeon_init_session` created saves at `game/adventures/<id>.json` (production fallback path from `engine/index.js:53`), not `game/playtest/adventures/`.
- Filesystem check: `game/adventures/19c9445c.json`, `a7acd174.json`, `1a3d2686.json` existed; `game/playtest/adventures/` contained only older pre-existing saves (`86d3d941.json` etc.).
- Root cause hypothesis: the `${OPEN_DUNGEON_MOCK_LLM:-0}` shell-style variable expansion in the env block is either dropped by the MCP client or causes the whole env block (including `SAVE_DIR`) to be rejected. The engine falls back to `game/adventures/` when `SAVE_DIR` is unset.
- This silently defeats the test-save isolation work (GH issue #6 and archived changes `2026-07-27-isolate-test-save-directories`, `2026-07-29-isolate-test-saves`). A playtest agent's sessions are indistinguishable from production saves and risk being swept up by production cleanup.

**Issue M2 — two divergent status-line parsers; the MCP one is case-sensitive and reimplements parsing.**

- `mcp/tools/gameplay.js:17-49` `parseStatusLine` scans lines backwards and strips a `[Status: ... | Score: N | Moves: N]` line. It is a second, independent implementation from the engine's parser in `engine/llm.js:418,433`.
- The MCP regex is `^\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\|\s*Moves:\s*(\d+)\s*\]$` — case-sensitive on `Status`. When the model emits an uppercase `[STATUS: ...]` line (observed live), the MCP parser misses it and returns engine fallback values, masking the actual drift.
- The engine and MCP parsers disagree in behavior (backward-scan vs end-anchored; case tolerance; strip-on-success vs strip-always). The MCP layer returned `score: 9999, location: Admin Room` (from a forged status line) while on another turn the engine and MCP returned different `moves`. Consumers reading state through MCP see different numbers than what is saved.
- This is the same root as GH issue #12 (shared parser), but the MCP half is a distinct defect: it does not import the engine parser and it is case-sensitive.

**Issue M3 — `dungeon_inspect_lore` reads stale in-memory cards instead of the SQLite `lore` table.**

- `mcp/tools/memory.js` force-flushes before reads for `dungeon_inspect_inventory`, `dungeon_inspect_events`, and `dungeon_inspect_stats` (via `forceFlushBeforeRead`, `memory.js:18-31`).
- `dungeon_inspect_lore` in `mcp/tools/state.js:95-132` does NOT force-flush and reads `engine.cards` (the in-memory `state.cards` array) instead of querying the structured store's `lore` table.
- Live observation on adventure `1a3d2686`: `dungeon_inspect_lore` returned `[]` while the SQLite `lore` table held rows for that adventure (`AI Dungeon`, `Dungeon Master`), and `dungeon_inspect_stats` reported `lore: 2`.
- Because lore cards are the auto-injected context trigger surface (see #14/#15), reading stale cards misleads agents about what will actually fire in the next prompt.

### Raised but not acted on

- **Whether to fix the `${...}` expansion client-side or remove it.** The `.mcp.json` env handling is outside this repo's control (client-specific). Only the repo-side behavior — rejecting or tolerating the config — is in scope.
- **Whether `dungeon_inspect_lore` should also return disabled cards.** Today it returns `enabled` flags but reads only in-memory cards; the store has `enabled` for all. Not decided.
- **Whether the shared parser should live in `engine/` or a neutral util.** Tied to #12's decision; recorded as an open design choice.
- **Auto-healing / migrating stray production saves back into the sandbox.** Out of scope; manual cleanup done during playtest.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| SAVE_DIR | Env var the engine reads at construction to set the save directory (`engine/index.js:50-51`) | A runtime-changeable setting |
| .mcp.json env block | `env` object on an MCP server entry that the client is supposed to set in the server process | Shell environment that the server can read/expand itself |
| status line | The `[Status: <Location> \| Score: <N> \| Moves: <N>]` line the narrator appends | The injected `[CURRENT STATUS]` system block |
| force-flush-before-read | Pattern in `memory.js:18-31` that flushes pending extraction before returning data | Reading directly from the store |
| engine.cards | The in-memory `state.cards` array (synced from `lore` on flush) | The SQLite `lore` table (authoritative) |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — in-repo MCP tooling fixes; no external code referenced) | — | — | 2026-08-02 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| (none new) | — | M1 is config/env handling; M2 is parser consolidation; M3 is a read-path fix. No new dependencies. | 2026-08-02 |

## Patterns adopted

- Existing repo pattern to extend: `forceFlushBeforeRead` (`memory.js:18-31`) — `dungeon_inspect_lore` should adopt it and query the structured store like its sibling tools.
- Existing repo pattern to consolidate: the engine's line-scanning status parser (to be shared, per #12) — MCP should import it, not reimplement.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `.mcp.json` declares `SAVE_DIR: game/playtest/adventures` | Confirmed in `.mcp.json:7` | File read | 2026-08-02 | stable |
| Live MCP sessions persisted to `game/adventures/` (production) not the sandbox | `game/adventures/19c9445c.json` etc. existed; `game/playtest/adventures/` only held older saves | Filesystem `ls` | 2026-08-02 | decays — env handling depends on the MCP client |
| Engine falls back to `game/adventures/` when `SAVE_DIR` is unset | `engine/index.js:53` | Code read | 2026-08-02 | stable |
| `mcp/tools/gameplay.js` has its own `parseStatusLine`, case-sensitive `^\[Status:` | Code read, `gameplay.js:17-49,28` | 2026-08-02 | stable |
| MCP parser missed an uppercase `[STATUS:` line live | Echo turn on `19c9445c` returned engine fallback (location `West of House`, moves 12) while history text had `[STATUS: ...]` | `dungeon_inspect_state` vs save file | 2026-08-02 | stable |
| `dungeon_inspect_lore` does not force-flush and reads `engine.cards` | Code read, `state.js:95-132`; no `forceFlushBeforeRead` import | 2026-08-02 | stable |
| `dungeon_inspect_lore` returned `[]` while `lore` table had rows | `1a3d2686`: inspect returned `[]`; SQLite `lore` had 2 rows; `dungeon_inspect_stats` reported `lore: 2` | Live inspect + SQLite query | 2026-08-02 | stable |
| Sibling inspect tools (`inventory`, `events`, `stats`) do force-flush before read | Code read, `memory.js:18-31,53,101,147` | 2026-08-02 | stable |

## Unverified assumptions

- **That the MCP client drops the `${OPEN_DUNGEON_MOCK_LLM:-0}` expansion and consequently the whole env block.** High confidence (SAVE_DIR was plainly not applied) but the client-side mechanism is not directly observable from this repo. Checking cost: run an MCP server with a logged env dump, or a client that reports resolved env.
- **That `dungeon_inspect_lore` should be DB-backed like the others.** Reasonable but a design decision — an argument exists for "lore = what will fire next" (state.cards) vs "lore = what exists" (store).
- **That no other MCP tool reads stale in-memory state.** Only `inspect_lore` was observed; others (barter, goals) query the store.

## Superseded claims

- None yet.

## Links out

- `mcp/tools/state.js` — `dungeon_inspect_lore` (stale read)
- `mcp/tools/memory.js` — `forceFlushBeforeRead` pattern
- `mcp/tools/gameplay.js` — second status parser
- `engine/llm.js:418,433` — engine status parser
- `engine/index.js:48-57` — SAVE_DIR resolution
- `.mcp.json` — server env config
- `openspec/specs/mcp-server/spec.md` — MCP server capability spec
- `openspec/changes/harden-context-history-integrity/research.md` — related #12 parser unification research
