# Proposed GitHub Issues for Open Dungeon

This document outlines the drafts for four new GitHub issues to improve session initialization, user onboarding navigation, OpenRouter model support, and game state status line alignment.

---

## 1. Run Inventory Summarization After First Initial User Prompt
* **Category**: Bug / Performance
* **Label**: `bug`, `enhancement`
* **Target Files**:
  * [web/routes/game.js](file:///path/to/open-dungeon/web/routes/game.js)
  * [engine/llm.js](file:///path/to/open-dungeon/engine/llm.js)
  * [engine/memory/memoryManager.js](file:///path/to/open-dungeon/engine/memory/memoryManager.js)

### Description
When a new adventure session starts, the character's description and opening scene often introduce starting inventory items (e.g., a "steel sword and shield" for Valen the Warrior). However, the memory system's `flushIfReady` method only extracts events and inventory changes when the buffer reaches a batch size of `3` turns. This causes the player's initial inventory to remain empty for the first several turns of gameplay.

### Proposed Changes
1. **Buffer Turn 1**: In `/api/init` in `web/routes/game.js`, after the opening scene is generated, buffer the initial turn pair (`turnIndex = 1` with player as character description, DM as opening scene):
   ```javascript
   activeEngine.memory.bufferTurnPair({
       turnIndex: 1,
       player: `Character description: ${descNode}`,
       dm: openingScene
   });
   ```
2. **Force-Flush on Turn 2**: In `engine/llm.js` within the stream generation's async background runner, detect if the first player action has completed (i.e. `state.moves === 2`). If so, force a flush on the memory manager.
3. **Extend MemoryManager**: Update `flushIfReady` in `engine/memory/memoryManager.js` to accept a `force` parameter, allowing immediate event extraction even if the queue has fewer than `batchSize` items.

---

## 2. Refactor New User Setup Menu Flow & Navigation
* **Category**: UX Enhancement
* **Label**: `enhancement`, `good first issue`
* **Target Files**:
  * [web/templates/index.html](file:///path/to/open-dungeon/web/templates/index.html)
  * [web/static/js/app.js](file:///path/to/open-dungeon/web/static/js/app.js)
  * [web/static/js/ui/screens.js](file:///path/to/open-dungeon/web/static/js/ui/screens.js)

### Description
The new user setup flow goes through Universe Preset (`preset-screen`), boundaries customization (`custom-preset-screen`), and Hero Genesis (`character-screen`). 

Currently, back-button routing is fragile and disregards the user's path. For example, if a user customizes a preset and then clicks "Back" from the `character-screen`, they are routed to the main `preset-screen` instead of the customization form (`custom-preset-screen`), losing their edits.

Additionally, the UI lacks a clear step indicator to guide the user through the setup process.

### Proposed Change
1. **Improve Back-Button Navigation**: Update the routing logic on "Back" to check `window.storyCustomized` or similar states and return the user to the custom configuration screen if they came from there.
2. **Add Setup Progress Indicator**: Add a retro visual progress indicator at the top of the setup wizard panels:
   ```
   [STEP 1: SELECT UNIVERSE] ──▶ [STEP 2: BOUNDARIES] ──▶ [STEP 3: HERO GENESIS]
   ```
3. **Consolidate Keyboard Focus**: Ensure that when switching screens, keyboard navigation focus is correctly set to active buttons to keep the arcade/CRT terminal experience seamless.

### Notes

Do more research on possible session flows inspired by SillyTavern or ai-dungeon. Above is the first AI draft flow.

---

## 3. Support Additional Model Defaults for OpenRouter
* **Category**: Enhancement
* **Label**: `enhancement`
* **Target Files**:
  * [web/routes/game.js](file:///path/to/open-dungeon/web/routes/game.js)

### Description
When using the OpenRouter backend (`LLM_BACKEND=openrouter`), the model select dropdown in the sidebar is populated only with the single model specified in `process.env.OPENROUTER_MODEL` (e.g., `deepseek/deepseek-v4-flash`). Users cannot change the model dynamically from the interface.

### Proposed Changes
1. **List Common Models**: Update the `/api/ping` endpoint in `web/routes/game.js` to return a list of standard default models when OpenRouter is selected.
2. **Default List**:
   - `google/gemini-2.5-flash` (highly cost-efficient, fast)
   - `deepseek/deepseek-chat` (extremely cost-efficient, standard chat)
   - `meta-llama/llama-3.3-70b-instruct` (high-quality, cost-efficient 70B model)
   - `qwen/qwen-2.5-72b-instruct` (excellent performance and cost-efficiency)
   - `google/gemini-2.5-pro` (mid-range, higher capability)
   - `deepseek/deepseek-r1` (premium reasoning model for complex moves)
3. **Preserve User Config**: Ensure that the model set in `process.env.OPENROUTER_MODEL` is always included at the top of the list and selected by default.

---

## 4. Align System Prompts and Engine to Track Moves via Status Line
* **Category**: Feature Alignment
* **Label**: `enhancement`, `bug`
* **Target Files**:
  * [engine/index.js](file:///path/to/open-dungeon/engine/index.js)
  * [engine/storyPresets.js](file:///path/to/open-dungeon/engine/storyPresets.js)
  * [engine/llm.js](file:///path/to/open-dungeon/engine/llm.js)

### Description
The system message provides the model with the current moves counter under `[CURRENT STATUS]`, but the system prompts and preset examples only instruct the model to output a status line with `Location` and `Score` (`[Status: <Location Name> | Score: <Current Score>]`). 

This causes reasoning models like DeepSeek-R1 to become confused about whether they should increment and output moves, ultimately deciding to omit it. The engine then blindly increments the moves by 1 on each turn regardless of what the LLM does, which can cause drift.

### Proposed Changes
1. **Update System Prompt Status Format**: Update the `DEFAULT_SYSTEM_PROMPT` in `engine/index.js` and all presets in `engine/storyPresets.js` to instruct the model to append the moves counter to the status line:
   ```
   [Status: <Location Name> | Score: <Current Score> | Moves: <Current Moves>]
   ```
2. **Update Narrator Examples**: Update all examples in the system prompts to show the moves count (e.g. `[Status: West of House | Score: 0 | Moves: 1]`).
3. **Parse Moves from LLM Output**: Update the status regex pattern in `engine/llm.js` to capture the moves count and update `state.moves` from the LLM's response rather than just incrementing it by 1 on every response:
   ```javascript
   const statusMatch = buffer.trim().match(/^\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\|\s*Moves:\s*(\d+)\s*\]$/);
   ```
