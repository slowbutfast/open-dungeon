## Why

Assistant output is committed to `state.history` verbatim and replayed as context every turn, so a single bad turn self-reinforces: the model echoes the injected `[CURRENT STATUS]`/`[CURRENT INVENTORY]` blocks back as narration, and those echoes (and the raw `[Status: ...]` line) are persisted and fed forward. Separately, the engine's status-line parser is end-anchored, so whenever the model appends anything after the status line — which the echo behavior makes routine — location/score updates are silently dropped and the narration/state drift apart. Both are in the same commit path (`engine/llm.js`), and #12's parser unification already has its MCP half landed.

## What Changes

- **Sanitize assistant output before it is committed anywhere.** Strip echoed `[CURRENT STATUS]` / `[CURRENT INVENTORY]` blocks and the raw status line from text pushed to history, the save file, and the extraction queue. Keep raw text available for debugging but never feed it back as context.
- **Unify the engine's status parsing onto the shared parser.** Replace both end-anchored regexes (`engine/llm.js` buffered and non-buffered branches) with the exported line-scanning, case-insensitive `parseStatusLine` that `engine/llm.js` already exports and `mcp/tools/gameplay.js` already imports. Resolve who owns `moves` (single owner, drop the blind `moves += 1` fallbacks).
- **Add a sanitize step to the remaining history-push sites** (`:171` user turn, `:252,266` rejection texts) so only `cleanedText`-equivalent content enters history.

## Capabilities

### New Capabilities
<!-- None — this modifies existing capabilities -->

### Modified Capabilities
- `game-engine`: modify `Generate Response Stream` (status parsing must use the shared parser; narration committed to history must be sanitized) and add a sanitization requirement.
- `llm-routing`: no requirement change (client construction untouched) — included only if a new history-sanitization concern lands there; otherwise leave out.

## Impact

- `engine/llm.js` — injection sites (`:173,177,179`), history push sites (`:219,300,314,499`), status parsing (`:418,433`)
- `engine/storyPresets.js` — duplicated status-line contract (five prompt definitions); format must stay consistent with the shared parser
- `engine/mockOpenAI.js` — two-field status line tolerance (already handled by shared parser)
- `engine/ARCHITECTURE.md` — engine module doc update
- Tests: engine-level status-parsing unit tests; history-sanitization tests
- No new dependencies.
