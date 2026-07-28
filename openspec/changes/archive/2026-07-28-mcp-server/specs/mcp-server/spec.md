## ADDED Requirements

### Requirement: Session Lifecycle Tools
The MCP server SHALL expose tools for managing adventure session lifecycle: `dungeon_init_session`, `dungeon_list_saves`, and `dungeon_load_save`.

#### Scenario: Initialize a new adventure session
- **WHEN** an AI agent calls `dungeon_init_session` with a preset index or custom title/summary/system_prompt
- **THEN** the system creates a new adventure with the specified configuration and returns the adventure ID

#### Scenario: List available save slots
- **WHEN** an AI agent calls `dungeon_list_saves`
- **THEN** the system returns an array of saved adventure metadata (ID, title, timestamp)

#### Scenario: Load a saved adventure
- **WHEN** an AI agent calls `dungeon_load_save` with a valid adventure ID
- **THEN** the system loads the saved state into the active engine and returns success

### Requirement: Core Gameplay Tools
The MCP server SHALL expose tools for executing player actions: `dungeon_send_action` and `dungeon_undo_action`.

#### Scenario: Execute a player action
- **WHEN** an AI agent calls `dungeon_send_action` with action_type (do/say/story) and text
- **THEN** the system executes the action, returns the narration stream content, status line metrics (location, score, moves), and any system events

#### Scenario: Undo the last action
- **WHEN** an AI agent calls `dungeon_undo_action`
- **THEN** the system reverts the last turn and returns the updated state

### Requirement: State Inspection Tools
The MCP server SHALL expose tools for inspecting game state: `dungeon_inspect_state`, `dungeon_inspect_history`, and `dungeon_inspect_lore`.

#### Scenario: Inspect current game state
- **WHEN** an AI agent calls `dungeon_inspect_state`
- **THEN** the system returns location, score, moves, title, model, max_tokens, summary, and system_prompt

#### Scenario: Inspect conversation history
- **WHEN** an AI agent calls `dungeon_inspect_history`
- **THEN** the system returns the user/assistant turn history array

#### Scenario: Inspect active lore cards
- **WHEN** an AI agent calls `dungeon_inspect_lore`
- **THEN** the system returns active lore/context cards with names, types, descriptions, and triggers

### Requirement: Memory and Inventory Tools
The MCP server SHALL expose tools for querying memory and inventory: `dungeon_inspect_inventory`, `dungeon_inspect_events`, `dungeon_inspect_stats`, and `dungeon_search_memories`.

#### Scenario: Inspect inventory items
- **WHEN** an AI agent calls `dungeon_inspect_inventory`
- **THEN** the system returns held, consumed, traded, and dropped items from the SQLite inventory store

#### Scenario: Inspect event log
- **WHEN** an AI agent calls `dungeon_inspect_events` with an optional limit parameter
- **THEN** the system returns recent extracted events (type, summary, entities, location) up to the specified limit

#### Scenario: Inspect memory statistics
- **WHEN** an AI agent calls `dungeon_inspect_stats`
- **THEN** the system returns event count, inventory count, lore count, and last extracted turn index

#### Scenario: Search memories semantically
- **WHEN** an AI agent calls `dungeon_search_memories` with a query string and optional topK parameter
- **THEN** the system performs a vector similarity search and returns top-K results with text, relevance score, turn index, and event type

### Requirement: Barter and Quest Tools
The MCP server SHALL expose tools for barter and quest operations: `dungeon_inspect_offers`, `dungeon_execute_trade`, `dungeon_inspect_goals`, and `dungeon_complete_goal`.

#### Scenario: Inspect available trade offers
- **WHEN** an AI agent calls `dungeon_inspect_offers` with an optional trader_name filter
- **THEN** the system returns barter offers matching the filter

#### Scenario: Execute a barter trade
- **WHEN** an AI agent calls `dungeon_execute_trade` with trader_name and required_item
- **THEN** the system validates item ownership, executes the atomic swap, and returns the trade result

#### Scenario: Inspect active quest goals
- **WHEN** an AI agent calls `dungeon_inspect_goals`
- **THEN** the system returns active (non-completed, non-failed) quest goals with their current status

#### Scenario: Complete a quest goal
- **WHEN** an AI agent calls `dungeon_complete_goal` with a goal_id
- **THEN** the system validates the required item is held, consumes it, grants the reward item, and transitions the goal to COMPLETED

### Requirement: Diagnostics Tools
The MCP server SHALL expose a diagnostics tool: `dungeon_get_debug_info`.

#### Scenario: Retrieve debug information
- **WHEN** an AI agent calls `dungeon_get_debug_info`
- **THEN** the system returns LLM call traces, session cost, error logs, and backend connection status

### Requirement: MCP Protocol Compliance
The MCP server SHALL implement the Model Context Protocol specification, supporting tool registration, schema validation, and both stdio and SSE transports.

#### Scenario: Tool discovery by MCP client
- **WHEN** an MCP client connects and requests the tool list
- **THEN** the server returns all 17 tools with their names, descriptions, and JSON Schema input definitions

#### Scenario: Tool invocation with structured input
- **WHEN** an MCP client calls a tool with parameters matching the schema
- **THEN** the server executes the tool and returns a structured result

#### Scenario: Tool invocation with invalid input
- **WHEN** an MCP client calls a tool with parameters that fail schema validation
- **THEN** the server returns an error response without executing the tool

#### Scenario: stdio transport connection
- **WHEN** the MCP server is started with stdio transport mode
- **THEN** it accepts JSON-RPC messages on stdin and writes responses to stdout

#### Scenario: SSE transport connection
- **WHEN** the MCP server is started with SSE transport mode
- **THEN** it accepts HTTP connections and streams JSON-RPC messages via Server-Sent Events
