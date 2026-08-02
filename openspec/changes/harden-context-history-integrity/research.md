## Source material

### GH issue #11 — "Assistant output is committed to history without sanitization" (2026-08-02, @slowbutfast/open-dungeon)

Assistant output is pushed into `state.history` verbatim, with no sanitization step. Two categories of garbage get persisted this way, and because history is replayed as context on every subsequent turn, both are **self-reinforcing**: once a bad assistant turn is in history, it models the behavior for all following turns.

**Symptom 1: context-injection blocks echo back into narration.** `engine/llm.js:129` injects a `[CURRENT INVENTORY]` block into the system content. The model routinely echoes that block into its own output, and the echo is persisted at `engine/llm.js:451`. Observed progression within a single 5-turn session (adventure `86d3d941`):
- Turn 3 — model appends the block, mirroring injected values (`[CURRENT INVENTORY]\n- Rusty Gear`).
- Turn 5 — model *authoring* the block and mutating its contents, dropping an item the store still holds (`[CURRENT INVENTORY]\n- 2 Coppers\n- Brass Astrolabe`, while store held Rusted Gear, 2 Coppers, Brass Astrolabe).

This also breaks status parsing (see #12): the trailing block causes the engine's end-anchored regex to miss the status line.

**Symptom 2: prompt injection persists across turns.** A single injected instruction stays effective for the rest of the session because the compromised assistant turn is replayed as context. Full detail in #15.

**Affected code:** `engine/llm.js:125` (`[CURRENT STATUS]` injection), `:129,131` (`[CURRENT INVENTORY]` injection), `:451` (unsanitized history push), `:171,252,266` (other history push sites).

**Proposed direction:** One sanitize step applied to assistant text before it is committed anywhere (history, save file, extraction queue): strip echoed `[CURRENT STATUS]` / `[CURRENT INVENTORY]` blocks; strip the parsed status line (currently only partially handled, and only in one of two branches); keep raw text for debugging but never feed it back as context. Worth considering whether injected state belongs in the system message at all rather than as a separate trailing user-role message.

**Related:** Blocks #15. Interacts with #12 (same commit path, different failure).

### GH issue #12 — "Status-line parsing is end-anchored, silently dropping score and location updates" (2026-08-02)

The engine's status-line regex is anchored to end-of-string. When the model appends anything after the status line — which it does routinely, see #11 — the match fails and `state.location` / `state.score` are never committed. The turn still counts, because the failure path does a blind `state.moves += 1`.

**Evidence (adventure `86d3d941`, final turn):** Persisted narration `[Status: Ashfall Market | Score: 1 | Moves: 4]`; persisted engine state `{ "score": 0, "moves": 5 }`. Score 1 announced, 0 saved; moves 4 announced, 5 saved.

**Root cause:** `engine/llm.js:433` (non-buffered branch) `cleanedText.match(/\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)(?:\s*\|\s*Moves:\s*(\d+))?\s*\]$/)` — trailing `$` with no `m` flag requires status line to be last. On failure we fall to `:443` `state.moves += 1`, and location/score are simply never assigned. Buffered branch at `:418` has the same anchor. Secondary: `cleanedText` only truncated inside success branch (`:427`), so on failure raw `[Status: ...]` persists into history as narration.

**Two parsers, two behaviors.** `mcp/tools/gameplay.js:17-49` implements a second, independent status parser that scans lines backwards and tolerates trailing content. It succeeds where the engine's fails, so `dungeon_send_action` returns `"location": "Ashfall Market", "score": 1` for a turn where the engine committed neither. Consumers reading state through MCP see a more optimistic picture than what actually got saved.

**Affected code:** `engine/llm.js:418,433` (regexes), `:425,430,440,443` (four `moves += 1` fallbacks), `:427` (strip only on success), `mcp/tools/gameplay.js:17-49` (divergent second parser).

**Proposed direction:** Replace both anchored regexes with a single shared parser that scans for the last status line anywhere in the response; export it and have `mcp/tools/gameplay.js` import it; decide who owns `moves` (model status line is authoritative, drop the `+= 1` fallbacks; OR engine increments per turn, ignore the model's number). Note: status-line contract is duplicated across five prompt definitions (`engine/index.js:14-46` plus four presets in `engine/storyPresets.js:9,21,33,45`).

### Raised but not acted on

- **Who owns `moves`.** #12 raises it but explicitly leaves it as a decision for implementation ("Decide who owns moves"). Not settled in this research; recorded as an open decision, not a fact.
- **`engine/mockOpenAI.js` two-field status line** (`[Status: Cantina | Score: 5]`, no `Moves`). Noted in #17; out of scope here but interacts with #12's parser unification — a shared parser should tolerate the missing field.
- **Auto-summarization compressing away the "narrator remembers" protection.** #13 notes this as the reason the duplicate-sale exploit accelerates; relevant to #13/#16 batch, not this one.
- **DeepSeek reasoning-effort / thinking text handling.** Unrelated to sanitization; ignored.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| status line | The `[Status: <Location> \| Score: <N> \| Moves: <N>]` line the narrator MUST append at the end of every response | The injected `[CURRENT STATUS]` block, which is system-side state fed to the model |
| CURRENT STATUS / CURRENT INVENTORY blocks | System-message sections injected by `buildSystemMessage` describing engine state | Content the model is supposed to echo back |
| cleanedText | Assistant text after engine-side stripping, pushed to history | The raw assistant output as streamed |
| history | `state.history` — the conversation replayed as context every turn | The save file (though history is serialized into it) |
| buffered branch | The streaming code path that holds content after the first `[` char to await a status line | A separate parser |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — no external code referenced for this batch) | — | — | 2026-08-02 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| (none new — this batch is refactor of in-repo parsing/sanitization; no new deps) | n/a | n/a | 2026-08-02 |

## Patterns adopted

None from external sources. Internal pattern being consolidated: `mcp/tools/gameplay.js`'s line-scanning `parseStatusLine` is the behaviorally-correct implementation and should become the single shared parser.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `[CURRENT STATUS]` and `[CURRENT INVENTORY]` are injected into the system message | Confirmed, `engine/llm.js:125,129,131` via `buildSystemMessage` | Code read | 2026-08-02 | stable |
| Model echoes the injected blocks back verbatim | Live session `19c9445c`: assistant turn ended with `[CURRENT STATUS]\n- Location: ...\n\n[CURRENT INVENTORY]\n- small gem (x1)...` + `[STATUS: West of a Forest Path \| Score: 0 \| Moves: 11]` | `dungeon_inspect_history` + save file `game/adventures/19c9445c.json` | 2026-08-02 | stable |
| Echoed blocks are persisted to history unsanitized | History index 3 of `19c9445c` contains the raw echoed blocks verbatim | `dungeon_inspect_history` + save file | 2026-08-02 | stable |
| Buffered-branch regex requires buffer to start with `[Status:` | On echo turn, `moves` jumped 7→11 (model's `Moves: 11` adopted via success parse of the last line) while `location` stayed `West of House` despite model announcing `West of a Forest Path` | State diff: `dungeon_inspect_state` before/after | 2026-08-02 | stable |
| MCP `parseStatusLine` is case-sensitive `^\[Status:` and line-scanning | Confirmed in code; also missed uppercase `[STATUS:` output, returning engine fallback values | Code read + live output | 2026-08-02 | stable |
| History announces `Moves: 11`, saved state says `moves=12` after the echo turn | Save file `19c9445c.json` `moves: 12`; history text `Moves: 11` | Save file read | 2026-08-02 | stable |
| Engine state was persisted in `game/adventures/` not `game/playtest/adventures` during MCP playtest | Save file landed at `game/adventures/19c9445c.json`; `.mcp.json` declares `SAVE_DIR=game/playtest/adventures` | Filesystem check | 2026-08-02 | decays — MCP client env handling may change |

## Unverified assumptions

- **That the model's `Moves:` number on the status line, when parseable, is wrong more often than the engine's counter.** Observed once (11 vs 12) but the direction/ratio isn't established. Checking: instrument a handful of sessions and diff announced vs committed moves.
- **That a trailing user-role message instead of system-block injection reduces echo.** Plausible per #11 but untested.
- **That the buffered branch is what committed the echo.** The echo turn had an empty trailing buffer after a `[` earlier in the stream; exact branch attribution not confirmed line-by-line for that turn.

## Superseded claims

- **"The MCP parser and engine parser disagree only in the failure case."** Superseded: they also disagree on case (`[Status:` vs `[STATUS:`) and on location semantics — MCP reported `score: 9999, location: Admin Room` (from forged status) while engine committed the same for the injection session, but on the echo turn MCP and engine returned different `moves`. Both are real, and both belong to one parser.

## Dependency / staleness notes for future agents

**PARTIAL FIX ALREADY LANDED (2026-08-02).** The MCP half of #12 was implemented and archived as `fix-mcp-server-tooling` (commit `8b7f7ef`): `engine/llm.js` now **exports** `parseStatusLine` (line-scanning, case-insensitive on `Status`, optional `Moves`) and `mcp/tools/gameplay.js` imports it instead of its own copy. **Do not re-do that part.**

What REMAINS for this change (do not assume the parser unification is complete):
- The engine's own buffered (`engine/llm.js:418`) and non-buffered (`:433`) branches STILL use end-anchored regexes. Only the MCP side is unified.
- The `[CURRENT STATUS]`/`[CURRENT INVENTORY]` injection sites referenced as `:125,129,131` in the original issue are now at **`:173,177,179`** (line numbers shifted after the MCP fix added `parseStatusLine` at the top of `engine/llm.js`).
- The main history push referenced as `:451` is now at **`:499`**; other push sites `:219,300,314`.
- The shared parser's `moves` return is advisory; the MCP tool falls back to engine state for null moves. The moves-ownership decision (D2 in architecture.md) is still open and this change is where it lands.
- The MCP change's research documents a **transient divergence**: in mock mode the engine's buffered branch fails to commit fragmented status lines while the shared parser extracts them. Verify the engine's buffered path against the shared parser (see `fix-mcp-server-tooling/research.md` coordination section). This change (task 1.2) closes that window.

Anything stated in this research about `mcp/tools/gameplay.js` having its own case-sensitive parser is now stale — it imports the shared parser. Treat code-line references as approximate and re-verify against HEAD before implementing.

## Links out

- `engine/llm.js` — history commit sites and status parsing
- `mcp/tools/gameplay.js` — second status parser
- `engine/storyPresets.js` — duplicated status-line contract
- `engine/ARCHITECTURE.md` — engine module doc
- `openspec/specs/game-engine/spec.md` — game-engine capability spec
