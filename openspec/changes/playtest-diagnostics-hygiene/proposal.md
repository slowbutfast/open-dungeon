## Why

Three small independent defects found during MCP playtesting, each a few lines but with real costs: whitespace-only actions are accepted (spending a full LLM call and polluting history/extraction); `llmTracker` state is process-global so `dungeon_get_debug_info` reports costs and calls across every adventure the process has touched; and cost accounting only counts narration calls — extraction/summarization/embedding are tracked at zero tokens, so the reported "session cost" understates actual spend.

## What Changes

- **Reject empty/whitespace-only player actions** before the request is built, so no LLM call is spent and no junk turn enters history or the extraction queue.
- **Scope `llmTracker` state per adventure** (or reset on `newAdventure`/`load`), so `dungeon_get_debug_info` reflects the current session only — calls, cost, and debug logs.
- **Account for non-narration LLM calls** — capture usage tokens for extraction, summarization, and embedding calls, or relabel/break out cost by call type so the reported figure is honest.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `mcp-server`: modify `Core Gameplay Tools` (reject blank actions) and `Diagnostics Tools` (per-session debug info, honest cost).
- `diagnostics-suite`: modify `Loaded Model Identification`-adjacent diagnostics if the tracker lives there (otherwise just the MCP tool surface).

## Impact

- `engine/llmTracker.js` — per-adventure scoping + usage capture for non-narration calls
- `mcp/tools/gameplay.js` — input validation in `dungeon_send_action`
- `mcp/tools/diagnostics.js` — `dungeon_get_debug_info` reads per-session tracker
- `engine/memory/eventExtractor.js` / `engine/context.js` — usage capture on extraction/summarization/embedding calls
- `engine/mockOpenAI.js` — (optional) two-field status line alignment with #12
- Tests: blank-action rejection, tracker scoping, cost accounting
- No new dependencies.
