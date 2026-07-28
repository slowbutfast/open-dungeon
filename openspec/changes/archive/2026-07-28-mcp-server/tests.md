## Automated Tests

- `pytest tests/test_mcp_tools.py -v`: Unit tests for each MCP tool handler. Verifies that each tool correctly calls the underlying AdventureEngine method, returns properly structured output, and handles edge cases (no active adventure, invalid parameters, missing items). Tests all 17 tools across 6 categories.

- `pytest tests/test_mcp_protocol.py -v`: Integration tests for MCP protocol compliance. Verifies tool discovery returns all 17 tools with correct schemas, tool invocation with valid input succeeds, tool invocation with invalid input returns schema validation errors, and both stdio and SSE transports work correctly.

- `pytest tests/test_mcp_session.py -v`: Tests for session lifecycle tools. Verifies `dungeon_init_session` creates a new adventure with correct state, `dungeon_list_saves` returns all save slots, `dungeon_load_save` loads saved state correctly, and attempting to load a non-existent save returns an error.

- `pytest tests/test_mcp_gameplay.py -v`: Tests for core gameplay tools. Verifies `dungeon_send_action` executes actions and returns narration with status metrics, `dungeon_undo_action` reverts the last turn, and actions with invalid action_type return appropriate errors.

- `pytest tests/test_mcp_memory.py -v`: Tests for memory and inventory tools. Verifies `dungeon_inspect_inventory` returns items with correct statuses, `dungeon_inspect_events` respects the limit parameter, `dungeon_inspect_stats` returns accurate counts, `dungeon_search_memories` performs vector search and returns results with relevance scores, and all memory tools force-flush before reading to ensure data freshness.

- `pytest tests/test_mcp_barter.py -v`: Tests for barter and quest tools. Verifies `dungeon_inspect_offers` filters by trader name, `dungeon_execute_trade` validates item ownership and executes atomic swaps, `dungeon_inspect_goals` returns only active goals, `dungeon_complete_goal` validates required item, consumes it, grants reward, and transitions state to COMPLETED.

- `pytest tests/test_mcp_diagnostics.py -v`: Tests for diagnostics tools. Verifies `dungeon_get_debug_info` returns LLM call traces, session cost, error logs, and backend status.

## Manual Verification

- **MCP Server Startup**:
  - **WHEN** the MCP server is started with `node mcp/server.js`
  - **THEN** it logs "MCP server running on stdio" (or SSE endpoint URL) and is ready to accept tool calls

- **Tool Discovery with MCP Inspector**:
  - **WHEN** an MCP inspector client (e.g., `mcp dev`) connects to the server
  - **THEN** all 17 tools are listed with correct names, descriptions, and input schemas

- **Autonomous Playtest Loop**:
  - **WHEN** an AI agent connects via MCP and executes a 10-turn playtest (init → send actions → inspect state → inspect inventory)
  - **THEN** the agent successfully plays the game, observes state changes, and completes without errors

- **Barter Workflow**:
  - **WHEN** an AI agent tests the full barter flow (inspect offers → execute trade → inspect inventory)
  - **THEN** the trade executes atomically, inventory updates correctly, and the agent observes the change

- **Quest Completion**:
  - **WHEN** an AI agent tests quest completion (inspect goals → complete goal → inspect inventory for reward)
  - **THEN** the goal transitions to COMPLETED, the required item is consumed, and the reward item appears in inventory

- **Error Handling**:
  - **WHEN** an AI agent calls a tool with invalid parameters (e.g., non-existent adventure ID, missing required item)
  - **THEN** the tool returns a structured error message without crashing the server

- **Memory Flush Consistency**:
  - **WHEN** an AI agent sends an action and immediately queries inventory or events
  - **THEN** the data is current (force-flush ensures no stale reads)

- **SSE Transport Mode**:
  - **WHEN** the MCP server is started with `--transport sse` and a client connects via HTTP
  - **THEN** tool calls work identically to stdio mode
