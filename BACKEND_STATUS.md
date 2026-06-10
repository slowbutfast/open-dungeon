# Backend Status & Architecture Documentation

This document describes the current architecture, components, features, and API specifications for the backend of the Local LLM Text-Adventure project.

---

## 🏗️ Architecture Overview

The backend has been refactored from Python (Flask) to Node.js (Express), with a modular structure:
1. **Express Web Server (`web/server.js`)**: Serves static templates/assets and mounts modular route handlers.
2. **Modular Game Engine (`game/engine/`)**: Implements game state management, context summarization, and LLM streaming/completion coordination.
3. **HTTP Client Proxy (`game/adventure_engine.py`)**: A transparent client wrapper that allows the existing Python CLI (`game/aidungeon_cli.py`) and unit test cases to communicate with the Express backend, with a local Python fallback for isolated test mocks.

```mermaid
graph TD
    UI[Web UI / app.js] <-->|HTTP REST / SSE| Server[Express Server / server.js]
    CLI[Python CLI / aidungeon_cli.py] <-->|Method Calls| Proxy[Client Proxy / adventure_engine.py]
    Proxy <-->|HTTP REST / SSE| Server
    Server <-->|Engine Instance| Engine[JS Game Engine / game/engine/index.js]
    Engine <-->|REST API / SDK| LM[LM Studio Server]
    Engine <-->|JSON Files| Disk[(Save Directory / adventures/)]
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
*   **Behavior**: Hides the bracketed game status line `[Status: <Location> | Score: <Score>]` from streaming to the client.
*   **Mechanics**:
    *   As chunks arrive from LM Studio, the backend checks for the `[` character.
    *   If `[` is found, the engine pauses streaming and buffers the text.
    *   If the buffer length exceeds `150` characters (meaning it's regular story text), the buffer is flushed and streamed.
    *   At the end of the stream, if the buffer matches the status line regex `^\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\]$`:
        *   The metadata is parsed to update `self.location`, `self.score`, and `self.moves`.
        *   The buffer is discarded (never sent to the client).
        *   The status block is trimmed from the saved history.
    *   If it does not match, it is yielded as a standard text chunk.

### 3. Dynamic Local Network (LAN) Binding
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

The entire backend status is covered by 39 integration/unit tests:
1. **API Endpoints (`tests/test_api_endpoints.py`)**: Tests route handling, SSE stream formats, settings updates, save slots, and lore modifications.
2. **CLI Behavior (`tests/test_cli_behavior.py`)**: Tests context compression threshold, dynamic response length limits (brevity instructions for simple actions), history undos, and prompt creations.
3. **PTY Integration (`tests/test_pty_integration.py`)**: Tests keyboard input loops in terminal-only modes.
4. **E2E Playwright Browser (`tests/e2e/test_menu_navigation.py`)**: Tests UI actions (init, character setup, keyboard menus, confirm panels, exits, and loads) interacting with a running mock Node.js Express server process.
