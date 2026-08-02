## MODIFIED Requirements

### Requirement: Core Gameplay Tools
The MCP server SHALL expose tools for executing player actions: `dungeon_send_action` and `dungeon_undo_action`.

`dungeon_send_action` SHALL reject empty or whitespace-only action text before any LLM request is built, returning an error without spending a call or appending a turn to history.

#### Scenario: Execute a player action
- **WHEN** an AI agent calls `dungeon_send_action` with action_type (do/say/story) and text
- **THEN** the system executes the action, returns the narration stream content, status line metrics (location, score, moves), and any system events

#### Scenario: Undo the last action
- **WHEN** an AI agent calls `dungeon_undo_action`
- **THEN** the system reverts the last turn and returns the updated state

#### Scenario: Blank action is rejected without an LLM call
- **WHEN** an AI agent calls `dungeon_send_action` with empty or whitespace-only text (e.g., `"   "`)
- **THEN** the tool returns an error, no LLM call is made, and no user/assistant turn is appended to history or the extraction queue

### Requirement: Diagnostics Tools
The MCP server SHALL expose a diagnostics tool: `dungeon_get_debug_info`.

`dungeon_get_debug_info` SHALL report debug information scoped to the current adventure session, not process-lifetime aggregates across every adventure the server process has touched. LLM call traces, session cost, and debug logs SHALL be scoped by `adventure_id` (or reset on session start/load). The reported session cost SHALL account for all LLM call types (narration, extraction, summarization, embedding), or clearly label what is and is not included.

#### Scenario: Retrieve debug information
- **WHEN** an AI agent calls `dungeon_get_debug_info`
- **THEN** the system returns LLM call traces, session cost, error logs, and backend connection status

#### Scenario: Debug info is scoped to the current session
- **WHEN** an AI agent starts a new adventure and calls `dungeon_get_debug_info`
- **THEN** the call traces, cost, and logs reflect only the current adventure (not previous adventures in the same process)

#### Scenario: Session cost includes non-narration calls
- **WHEN** an AI agent calls `dungeon_get_debug_info` after turns that triggered extraction, summarization, or embedding calls
- **THEN** the reported session cost reflects the tokens used by those calls (or explicitly labels them as excluded), rather than silently counting them at zero
