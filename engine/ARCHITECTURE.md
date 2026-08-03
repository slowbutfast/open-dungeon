# Backend Status & Architecture Documentation

This document describes the current architecture, components, features, and API specifications for the backend of the Local LLM Text-Adventure project.

---

## 🏗️ Architecture Overview

The backend has been refactored from Python (Flask) to Node.js (Express), with a modular structure:
1. **Express Web Server (`web/server.js`)**: Serves static templates/assets and mounts modular route handlers.
2. **Modular Game Engine (`engine/`)**: Implements game state management, context summarization, and LLM streaming/completion coordination.
3. **HTTP Client Proxy (`game/adventure_engine.py`)**: A transparent client wrapper that allows the existing Python CLI (`game/aidungeon_cli.py`) and unit test cases to communicate with the Express backend, with a local Python fallback for isolated test mocks.

```mermaid
graph TD
    UI[Web UI / app.js] <-->|HTTP REST / SSE| Server[Express Server / server.js]
    CLI[Python CLI / aidungeon_cli.py] <-->|Method Calls| Proxy[Client Proxy / adventure_engine.py]
    Proxy <-->|HTTP REST / SSE| Server
    Server <-->|Engine Instance| Engine[JS Game Engine / engine/index.js]
    Engine <-->|REST API / SDK| LM[LM Studio Server]
    Engine <-->|JSON Files| Disk[(Save Directory / game/adventures/)]
```

---

## ⚙️ Core Enhancements & Status

### 1. Dynamic Model Resolution (`get_loaded_model`)
*   **Status**: **Fully Operational**
*   **Behavior**: Instead of hardcoding model names (e.g., `gemma-4-26b-a4b-it`), the engine queries LM Studio’s native `/api/v1/models` endpoint at startup, loading, and turn execution.
*   **Mechanics**:
    1. Probes `/api/v1/models` to find any model of type `llm` with non-empty `loaded_instances` (currently in VRAM/RAM).
    2. Falls back to the first available `llm` model key.
    3. Falls back to standard OpenAI compatible `/v1/models` if the v1 native endpoint fails.
    4. Automatically filters out `embedding` models.
    5. Checks types (`isinstance(model_id, str)`) to prevent unit test mocks (`MagicMock`) from leaking into state variables, keeping unit tests clean.

### 2. Backend Stream Interception & Buffering
*   **Status**: **Fully Operational**
*   **Behavior**: Hides the bracketed game status line `[Status: <Location> | Score: <Score>]` from streaming to the client, parses it via the shared parser, and sanitizes history.
*   **Mechanics**:
    *   As chunks arrive from LM Studio, the backend checks for the `[` character.
    *   If `[` is found, the engine pauses streaming and buffers the text.
    *   If the buffer length exceeds `150` characters (meaning it's regular story text), the buffer is flushed and streamed.
    *   At the end of the stream, the engine feeds the **full accumulated assistant text** into the shared `parseStatusLine` (the same line-scanning, case-insensitive parser `mcp/tools/gameplay.js` imports — see `engine/llm.js`). It commits `location` from the *last* status line anywhere in the response, so trailing content (or echoed context blocks) no longer breaks the parse.
    *   **Forged-status guard (`isSuspiciousStatus`, `close-prompt-injection-backdoor`)**: before `location` is committed, the parsed line is checked against plausible engine state. A line whose Location contains game-mechanical vocabulary (`admin`, `system`, `prompt`, `parser`, `api`, `interface` — e.g. the live `[Status: Admin Room | Score: 9999 | Moves: 0]`) or whose Score implies a per-turn jump beyond `MAX_PLAUSIBLE_SCORE_JUMP` (50) is treated as forged and NOT committed — the engine keeps its own location. Conservative by design; legitimate narration locations and small score drift (a flush can lag the narrative) pass.
    *   **`score` ownership (engine-driven)**: score is **engine-computed**, not adopted from the narrator. A deterministic rule over extracted milestone events (`engine/scoring.js`, D1) is recomputed from the store's distinct events at every extraction flush (`MemoryManager.computeScore`) and after every undo. The narrator's `Score:` field on the status line is **advisory and ignored** (D2) — a missed or wrong status line can never freeze or inflate score.
    *   **`moves` ownership**: the engine is the single owner of the counter. It increments exactly once per completed turn and **ignores** the model's `Moves` field (advisory only). The MCP `dungeon_send_action` tool reports `engine.moves`, keeping it in agreement with `dungeon_inspect_state`.
    *   Before anything is committed, `sanitizeForHistory` (exported from `engine/llm.js`) strips status-line-shaped lines and echoed `[CURRENT STATUS]` / `[CURRENT INVENTORY]` blocks. The cleaned narration is what reaches `state.history`, the save file, and the memory extraction queue (`bufferTurnPair`). Raw assistant text is retained only in debug/log paths (`llmTracker`/`addDebugLog`) and streaming chunks — never replayed as context.
    *   The buffered tail is flushed as a plain text chunk if it never formed a status line; a status-line-shaped buffer stays hidden (dropped with the parsed metadata).

### 3. Engine-Driven Score Progression

*   **Status**: **Fully Operational**
*   **Behavior**: `score` advances deterministically over extracted milestone events, independent of the narrator's status-line wording (`fix-score-progression`). The engine is authoritative; the narrator's `Score:` claim is advisory.
*   **Mechanics**:
    *   `engine/scoring.js` — pure module. `MILESTONE_WEIGHTS = { discovery: 2, quest: 10, combat: 5, trade: 3 }` (only these four types score). `scoreRule(events, priorScore)` sums each milestone's weight once, deduping on a normalized `type:summary` key (case-insensitive, trimmed); movement/dialogue/death/unknown types contribute 0. Accepts extractor events (`type`) and store rows (`event_type`).
    *   `MemoryManager.computeScore(adventureId)` — full recompute over the store's distinct events (already deduped by event id) with priorScore 0, making scoring idempotent. Called from `_extractAndStore` after each flush (score is persisted with the same `saveFn` that persists extraction), and from `engine.undo()` after `rollbackTurns` so score stays consistent with the rolled-back store.
    *   Persisted score is authoritative on load (no recompute) — save/load round-trip is preserved.
*   **MCP surface**: `dungeon_send_action` force-flushes pending extraction (`forceFlushBeforeRead`) before building its result so `dungeon_send_action.score` agrees with `dungeon_inspect_state.score` (both report `engine.score`).

### 4. Universal Barter & Quest Goal Engine

*   **Status**: **Fully Operational**
*   **Behavior**: Provides a deterministic, SQLite-backed barter trade system and NPC quest goal state machine, supporting item-for-item swaps with no currency and state transitions (`NOT_STARTED` → `COMPLETED`).
*   **Components**:
    *   `engine/memory/barterEngine.js` — `BarterEngine` class managing `barter_offers` and `quest_goals` tables.
    *   `engine/memory/structuredStore.js` — Added `hasItem()`, `executeTrade()` methods for pre-action gating and atomic swaps.
    *   `engine/index.js` — Exposes `registerOffer()`, `executeBarter()`, `getOffers()`, `createGoal()`, `getGoals()`, `completeGoal()` proxy methods.
    *   `engine/llm.js` — Pre-action gating now detects `barter X to Y` and `exchange X for Y` patterns in addition to `trade X for Y`.
*   **Trade Flow**:
    1. `hasItem()` checks inventory for `status = 'held'` with case-insensitive name match (pre-action gate, $0 LLM cost).
    2. `executeTrade()` runs an atomic SQLite transaction: marks required item as `'traded'`, inserts/replaces offered item as `'held'`.
    3. On success, a `[SYSTEM EVENT: Barter successful! Traded 'X' for 'Y'.]` message is injected into the SSE stream before LLM narration.
*   **Quest Goal Flow**:
    1. `createGoal()` inserts a goal with `status = 'NOT_STARTED'`.
    2. `completeGoal()` validates `hasItem()`, transitions to `'COMPLETED'`, and grants the reward item via `executeTrade()`.
*   **API Endpoints**:
    *   `POST /api/trade/offer` — Register a barter offer.
    *   `GET /api/trade/offers?trader=<name>` — List offers for a trader.
    *   `POST /api/trade` — Execute a trade (SSE stream with system event + LLM narration).
    *   `POST /api/goals` — Create a quest goal.
    *   `GET /api/goals` — List active (non-completed) goals.
    *   `POST /api/goals/complete` — Complete a goal (SSE stream).

### 4b. Narrated Trade / Offer / Goal Extraction

*   **Status**: **Fully Operational**
*   **Behavior**: The event extractor now speaks item *removal* and can emit `offers[]` / `goals[]`, so narrative play populates the same `barter_offers` / `quest_goals` tables the HTTP endpoints and MCP tools read.
*   **Components**:
    *   `engine/memory/itemNames.js` — `normalizeItemName()` / `itemNamesMatch()` canonical-name matching (shared with `validate-memory-extraction`).
    *   `engine/memory/barterEngine.js` — `executeBarter()` resolves offers/possession by canonical name; `createGoal()` accepts an explicit status (narrated goals start `IN_PROGRESS`).
    *   `engine/memory/memoryManager.js` — Registers extracted offers, creates narrated goals, and routes `inventory_changes[].action = "traded"` through `executeBarter`.
*   **Trade Flow**: A classified narrated trade routes through `executeBarter` (possession check + atomic swap). Success releases the sold item as `'traded'` (excluded from `getInventory`) and grants the offered item; a refused or ambiguous trade logs a refusal and applies **neither** side (duplicate-sale protection). With no registered offer, removal is applied directly so the sold item is never silently retained.
*   **Offer / Goal Flow**: `offers[]` from narration (e.g. "bring me X and I'll give you Y") feed `registerOffer()`; `goals[]` (e.g. "find my daughter's locket") feed `createGoal(..., 'IN_PROGRESS')`, deduplicated by `(npc_name, goal_title)`.

### 4c. Extractor Output Validation (`validate-memory-extraction`)

*   **Status**: **Fully Operational**
*   **Behavior**: The event extractor's raw model output is schema-checked before anything touches SQLite. `validateExtractorOutput()` (`engine/memory/eventExtractor.js`) validates `events` / `inventory_changes` / `lore_facts` rows (missing fields, invalid types, invalid trigger tokens); malformed rows are skipped and counted in the debug log line, valid rows flow on. `offers[]` / `goals[]` pass through unchanged.
*   **Trigger filtering**: lore trigger tokens shorter than 3 chars, single common words, and game-mechanical vocabulary (`score`, `inventory`, `status`, `admin`, `system`, `prompt`, plus codebase tokens like `location`/`moves`/`summary`/`quantity`/`trigger`/`current`, and the observed over-triggerers `trade`/`north`/`door`) are rejected before `upsertLore`; a card whose entire trigger list is rejected is dropped (half of the #15 injection defense).
*   **Quantity parsing & name canonicalization**: `normalizeInventoryChange()` (`engine/memory/structuredStore.js`) parses a leading numeral out of `item_name` into `quantity`; `upsertInventoryItem` keys rows by the canonical (normalized) name while preserving the narrated display spelling, and read lookups (`hasItem`, `executeTrade`) resolve equivalent spellings via the shared `itemNamesMatch` (now stem-aware: "Rusty Gear" == "Rusted Gear", "Gem" == "Gems"). Legacy rows ("2 Coppers") resolve on read.
*   **Summary voice**: the summarization prompt (`engine/context.js`) mandates second person, and the committed summary is passed through `sanitizeForHistory` so echoed status blocks/lines never re-inject.

### 4d. Prompt-Injection Defense (`close-prompt-injection-backdoor`)

*   **Status**: **Fully Operational**
*   **Behavior**: Defense-in-depth against a prompt injection in a player action planting a persistent, auto-triggering lore backdoor (GH #15). The merged layers:
    1. **Sanitization (#11)** — a single bad turn's status line and echoed `[CURRENT STATUS]`/`[CURRENT INVENTORY]` blocks never reach history, the save file, or the extraction queue.
    2. **Extraction validation (#14)** — injected content cannot become a lore card (mechanical trigger tokens rejected; a card whose entire trigger list is rejected is dropped).
    3. **Delimiter framing (D1)** — player action text is wrapped in explicit `<player_action>...</player_action>` delimiters when placed in the prompt, with a `[PLAYER INPUT]` instruction in `buildSystemMessage` that the delimited content is in-fiction input, never instructions. Applied in the message-building loop of `generateResponseStream` (`engine/llm.js`); `continue` turns (bare `[Continue]`) are not wrapped.
    4. **Forged-status guard (D2)** — `isSuspiciousStatus` (`engine/llm.js`) rejects status lines that contradict plausible engine state; the engine keeps its own committed location/score/moves.
    5. **Lore escape hatch (D3)** — `dungeon_delete_lore_card` (MCP, `mcp/tools/state.js`) removes a card by ID from the SQLite `lore` table (`StructuredStore.deleteLore`) and from `state.cards` (`engine.deleteCard`), so its triggers no longer auto-inject. The frontend `/api/lore` delete path routes through the same `engine.deleteCard`, so both surfaces share the store-backed recovery path.
*   **Verification**: `tests/test_injection_defense.py` re-runs the full four-step #15 reproduction in mock/replayable mode and asserts all four steps are blocked.

### 5. Dynamic Local Network (LAN) Binding
*   **Status**: **Fully Operational**
*   **Behavior**: Enables remote devices on the same Wi-Fi/local network to access the web panel without compromising automated test environments.
*   **Mechanics**:
    *   When running test suites (where environment variable `MOCK_LLM=1` is set), the server binds to `127.0.0.1` (localhost) to avoid macOS firewall permission prompts and network lookup delays.
    *   In normal play mode, the server binds to `0.0.0.0:5001` (all network interfaces), making the game server reachable on the local network (e.g. at `http://<your-mac-ip>:5001`).

---

## 🔌 API Endpoint Specifications

### 1. General & Connectivity
*   **`GET /`**: Renders the main retro UI (`index.html`).
*   **`GET /api/presets`**: Returns available story templates (preset universes, descriptions, and character templates).
*   **`GET /api/ping`**: Probes the LM Studio port and returns status, active model, and list of all available models.
*   **`GET /api/debug/info`**: Returns LLM call info and system debug logs.
    *   *Output*:
        ```json
        {
          "status": "online" | "mock" | "offline",
          "host": "192.168.1.100",
          "port": "1234",
          "model": "gemma-4-e4b-uncensored-hauhaucs-aggressive",
          "models": ["gemma-4-e4b-uncensored-hauhaucs-aggressive", "google/gemma-4-e4b"],
          "base_url": "http://192.168.1.100:1234/v1"
        }
        ```

### 2. Game Lifecycle & State
*   **`POST /api/init`**: Initializes a new game instance.
*   **`POST /api/state`**: Updates server state with provided parameters.
*   **`GET /api/state`**: Returns current game variables, suggestion chips, system prompts, lore context cards, and history.
    *   *Output*:
        ```json
        {
          "adventure_id": "dbe9a132",
          "title": "Star Wars: The Outer Rim",
          "location": "Starting Location",
          "score": 0,
          "moves": 1,
          "history": [{"role": "user", "text": "..."}, {"role": "assistant", "text": "..."}],
          "cards": [],
          "summary": "The Galactic Empire...",
          "system_prompt": "You are the narrator...",
          "suggestions": ["Search the area", "Talk to the pilot"],
          "max_tokens": 300,
          "model": "gemma-4-e4b-uncensored-hauhaucs-aggressive"
        }
        ```

### 3. Gameplay Turns (SSE Stream)
*   **`POST /api/action`**: Receives an action and returns a text/event-stream Server-Sent Events (SSE) feed.
    *   *Input*: `{"action_type": "do" | "say" | "continue" | "retry" | "undo", "text": "open mailbox"}`
    *   *Events Yielded*:
        *   `data: {"type": "status", "content": "Querying model..."}`
        *   `data: {"type": "system", "content": "LORE ACTIVATED: Korr"}` *(optional)*
        *   `data: {"type": "chunk", "content": "You open the small "}` *(narrative text stream)*
        *   `data: {"type": "done", "content": "You open the small mailbox."}` *(generation finished)*
        *   `data: {"type": "error", "content": "error message details"}` *(on failure)*

### 4. Settings & Utilities
*   **`POST /api/settings`**: Updates runtime configuration values.
    *   *Input*: `{"max_tokens": 200, "model": "google/gemma-4-e4b"}`
    *   *Output*: `{"status": "success", "changed": ["max_tokens=200", "model=google/gemma-4-e4b"]}`
*   **`POST /api/system`**: Manually overwrites the active narrator prompt rules.
    *   *Input*: `{"system_prompt": "New system prompt instructions..."}`
*   **`POST /api/summary`**: Overwrites the compressed adventure memory summary.
    *   *Input*: `{"summary": "Updated adventure summary..."}`

### 5. Lorebook Configuration
*   **`POST /api/lore`**: Manually edits context cards.
    *   *Input options*:
        *   Add card: `{"action": "add", "card": {"name": "Staff", "type": "item", "description": "Wooden staff", "triggers": "staff"}}`
        *   Update card: `{"action": "update", "index": 0, "card": {...}}`
        *   Delete card: `{"action": "delete", "index": 0}`
        *   Toggle card: `{"action": "toggle", "index": 0}`
*   **`POST /api/scan`**: Triggers a manual LLM scan over recent history to automatically extract context cards.

### 6. Save Slots Management
*   **`GET /api/saves`**: Lists all saved adventure connection JSON slots under `game/adventures/`.
*   **`POST /api/saves/<id>`**: Loads the saved adventure variables into the active engine instance.
*   **`DELETE /api/saves/<id>`**: Deletes the saved adventure JSON file from disk.

---

## 🧪 Testing Coverage

The entire backend status is covered by 45+ integration/unit tests:
1. **API Endpoints (`tests/test_api_endpoints.py`)**: Tests route handling, SSE stream formats, settings updates, save slots, lore modifications, barter trade SSE streams, goal creation and completion SSE streams.
2. **Barter Engine (`tests/test_barter_engine.py`)**: Tests barter contract creation, valid trade atomic swap, unowned item rejection, partial quantity trades, goal creation, goal state transitions, goal completion with reward insertion, and active goal listing.
3. **CLI Behavior (`tests/test_cli_behavior.py`)**: Tests context compression threshold, dynamic response length limits (brevity instructions for simple actions), history undos, and prompt creations.
4. **PTY Integration (`tests/test_pty_integration.py`)**: Tests keyboard input loops in terminal-only modes.
5. **E2E Playwright Browser (`tests/e2e/test_menu_navigation.py`)**: Tests UI actions (init, character setup, keyboard menus, confirm panels, exits, and loads) interacting with a running mock Node.js Express server process.
6. **E2E Barter UI (`tests/e2e/test_barter_ui.py`)**: Tests action chip rendering, Barter Modal open/close, and one-click trade execution in the browser.

---

## 🧩 MCP Server (`mcp/server.js`)

The MCP (Model Context Protocol) server provides a JSON-RPC interface for AI agents to autonomously playtest and debug the game. It exposes 18 tools organized into 6 categories.

### Architecture

```
MCP Client (AI Agent)  ←→  JSON-RPC over stdio/SSE  ←→  mcp/server.js  ←→  AdventureEngine
```

- **Standalone process**: Runs as `node mcp/server.js`, separate from the Express web server.
- **Independent engine instance**: Creates its own `AdventureEngine` (avoids contention with web UI).
- **Direct engine access**: Calls `AdventureEngine` methods directly (no HTTP wrapping).
- **Transports**: Supports stdio (default) and SSE (`--transport sse`).
- **SDK**: Uses `@modelcontextprotocol/sdk` (official Anthropic SDK).

### Tool Categories

| Category | Tools | File |
|----------|-------|------|
| Session Lifecycle | `dungeon_init_session`, `dungeon_list_saves`, `dungeon_load_save` | `mcp/tools/session.js` |
| Core Gameplay | `dungeon_send_action`, `dungeon_undo_action` | `mcp/tools/gameplay.js` |
| State Inspection | `dungeon_inspect_state`, `dungeon_inspect_history`, `dungeon_inspect_lore`, `dungeon_delete_lore_card` | `mcp/tools/state.js` |
| Memory & Inventory | `dungeon_inspect_inventory`, `dungeon_inspect_events`, `dungeon_inspect_stats`, `dungeon_search_memories` | `mcp/tools/memory.js` |
| Barter & Quests | `dungeon_inspect_offers`, `dungeon_execute_trade`, `dungeon_inspect_goals`, `dungeon_complete_goal` | `mcp/tools/barter.js` |
| Diagnostics | `dungeon_get_debug_info` | `mcp/tools/diagnostics.js` |

### Usage

```bash
# Start with stdio transport (default, for MCP-compatible AI agents)
node mcp/server.js

# Start with SSE transport (for HTTP/EventSource clients)
node mcp/server.js --transport sse --port 3100

# Via npm script
npm run mcp
```

### Key Design Decisions

1. **Force-flush before reads**: Memory inspection tools (`dungeon_inspect_inventory`, `dungeon_inspect_events`, `dungeon_inspect_stats`) call `flushIfReady(state, model, save, { force: true })` before reading to ensure data freshness, mirroring the pattern in `web/routes/memory.js`.

2. **Error handling**: Tool errors are returned as structured error content with `isError: true` rather than JSON-RPC error responses, following MCP SDK conventions.

3. **Stream collection for actions**: `dungeon_send_action` collects the full LLM response stream, parses the status line with the shared `parseStatusLine`, and returns the narration text alongside structured metrics. Since the engine owns the moves counter (one deterministic increment per completed turn), owns the score (engine-computed over extracted milestones), and commits `location` through the same shared parser, the tool force-flushes pending extraction and reports `engine.moves` / `engine.score` (falling back to `engine.location` when the sanitized narration carries no status line) — so `dungeon_send_action` and `dungeon_inspect_state` always agree.

### Consistency Contract (`make-undo-and-trades-consistent`)

Undo and trade behavior across the engine, MCP tools, and tests must satisfy a fixed contract. See `openspec/changes/make-undo-and-trades-consistent/` for the full specification.

- **Tool names (fixed)**: `dungeon_undo_action`, `dungeon_inspect_events`, `dungeon_inspect_inventory`, `dungeon_inspect_stats`, `dungeon_search_memories`, `dungeon_inspect_offers`, `dungeon_execute_trade`, `dungeon_inspect_goals`, `dungeon_complete_goal`, `dungeon_init_session`, `dungeon_send_action`.

- **Extraction watermark**: `extraction_state.last_extracted_turn_index`, surfaced by `dungeon_inspect_stats` as `lastExtractedTurnIndex`. After undoing turn N: drop store rows with `turn_index >= N`, set the watermark to `N - 1`, and decrement `moves` to the pre-undo value. The watermark must never exceed the committed turn-pair history length.

- **Undo ordering**: `engine.undo` awaits any in-flight flush (drains the turn buffer) before rollback. `rollbackTurns(turnIndex)` removes event/inventory/lore rows and their vector ids (`deleteItems`), so RAG (`dungeon_search_memories`) must not recall the undone turn.

- **Barter**: narrated trades route through `executeBarter` (possession check + atomic swap). A sold item's status transitions to `traded` and is excluded from `getInventory`; re-trading it is rejected. Offer/goal tables are written from narration.

- **Extraction schema**: `inventory_changes[].action` gains `traded` (removal); new top-level `offers[]` and `goals[]` arrays feed `barterEngine.registerOffer` / `createGoal`.

- **Canonical names**: `engine/memory/itemNames.js` (`normalizeItemName` / `itemNamesMatch`), shared with `validate-memory-extraction`.

- **Mock triggers (`MOCK_LLM=1`)**: history containing `trade` + `leaflet` + `gem` → remove Leaflet + acquire Gem with event type `trade`; `"bring me"` + `leaflet` → offer `{Korr, Leaflet, Gem}`; `"find my daughter"` + `locket` → goal `{Korr, Find the locket, Locket, Gem}`.

### File Organization

```
mcp/
├── server.js              # Entry point, transport setup, engine instantiation
└── tools/
    ├── index.js           # Tool registration orchestrator
    ├── session.js         # Session lifecycle tools
    ├── gameplay.js        # Core gameplay tools
    ├── state.js           # State inspection tools
    ├── memory.js          # Memory and inventory tools
    ├── barter.js          # Barter and quest tools
    └── diagnostics.js     # Diagnostics tool
```

### Testing

93 MCP tests across 7 test files:

| Test File | Coverage |
|-----------|----------|
| `tests/test_mcp_protocol.py` | Tool discovery, schema validation, stdio transport, JSON-RPC format |
| `tests/test_mcp_session.py` | Session lifecycle (init, list saves, load save) |
| `tests/test_mcp_gameplay.py` | Action execution, undo, status metrics |
| `tests/test_mcp_state.py` | State inspection (state, history, lore, delete lore card) |
| `tests/test_mcp_memory.py` | Memory tools (inventory, events, stats, search) |
| `tests/test_mcp_barter.py` | Barter and quest operations |
| `tests/test_mcp_diagnostics.py` | Debug info retrieval |
| `tests/test_mcp_tools.py` | All 18 tools individually |
| `tests/test_injection_defense.py` | Injection reproduction harness, delimiter framing, forged-status guard, lore delete |

Run with: `pytest tests/test_mcp_*.py -v`
