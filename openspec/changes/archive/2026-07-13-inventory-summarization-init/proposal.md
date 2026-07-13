## Why

When a new adventure session starts, the character's description and opening scene introduce starting items (e.g., weapons or shields). However, the memory extraction system buffers turns in batches of 3, meaning these starting items are not processed or populated in the user's inventory until several moves into the game, resulting in an empty and confusing inventory screen at start.

## What Changes

- **Buffer Start Turn**: Buffer the initial setup turn pair (turn 1: character description & opening scene) during session initialization (`/api/init`).
- **On-Demand Force-Flush**: Introduce an on-demand forced flush mechanism in the memory manager that is triggered whenever the client queries the inventory, events, or stats APIs. This ensures the player's inventory and events are immediately up-to-date in the UI.
- **Concurrency Safety**: Add an `isFlushing` lock in the memory manager to prevent background auto-summarization and on-demand flushes from running concurrently.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `game-engine`: Align the parser and prompts to parse the moves counter directly from the trailing status line (`[Status: <Loc> | Score: <Sc> | Moves: <M>]`) instead of incrementing moves blindly in the backend.
- `context-compression`: Enable immediate/forced context extraction upon client state reads, ensuring inventory changes are synchronized instantly when requested.

## Impact

- **Files Affected**:
  - `web/routes/game.js` (buffer turn 1 in `/init`)
  - `web/routes/memory.js` (force flush in GET endpoints before database reads)
  - `engine/memory/memoryManager.js` (add force option and concurrency lock to `flushIfReady`)
  - `engine/llm.js` (update regex parser and status extraction)
  - `engine/index.js` (update default system prompt status rules)
  - `engine/storyPresets.js` (update preset status examples)
- **APIs**: No changes to existing REST endpoints signatures, but `/api/memory/*` queries will now perform immediate flushes of the memory buffer if needed.
