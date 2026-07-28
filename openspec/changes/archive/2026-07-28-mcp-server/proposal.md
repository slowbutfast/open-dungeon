## Why

To enable automated playtesting and debugging by AI agents, Open Dungeon needs a Model Context Protocol (MCP) server that exposes game engine functionality as structured, discoverable tools. This allows AI agents to autonomously play the game, inspect state, test inventory and barter workflows, and verify quest systems without manual HTTP orchestration.

## What Changes

- Add a standalone MCP server that wraps the existing `AdventureEngine` and exposes 17 tools organized into 6 categories: session lifecycle, core gameplay, state inspection, memory & inventory, barter & quests, and diagnostics.
- The MCP server runs as a separate Node.js process and communicates via JSON-RPC over stdio or SSE, following the MCP specification.
- All tools are non-destructive by construction (except intentional gameplay operations like `dungeon_send_action` and `dungeon_execute_trade`), with structured input schemas and typed outputs.
- The MCP server directly imports and calls `AdventureEngine` methods rather than wrapping HTTP endpoints, enabling efficient access to internal state and avoiding double instantiation.

## Capabilities

### New Capabilities
- `mcp-server`: Implements the Model Context Protocol server with 17 tools for AI agent interaction. Covers session management (init, list saves, load save), gameplay (send action, undo), state inspection (state, history, lore), memory queries (inventory, events, stats, semantic search), barter operations (inspect offers, execute trade, inspect goals, complete goal), and diagnostics (debug info).

### Modified Capabilities

(none - this is a new integration layer that wraps existing capabilities without changing their requirements)

## Impact

- **New files**: `mcp/server.js` (MCP server entry point), `mcp/tools/*.js` (tool implementations organized by category)
- **Dependencies**: Add `@modelcontextprotocol/sdk` for MCP protocol support
- **Engine integration**: MCP server imports `AdventureEngine` from `engine/index.js` and instantiates it with the same configuration as the Express server
- **Testing**: Unit tests for each tool, integration tests for MCP protocol compliance, end-to-end tests with AI agent playtesting scenarios
- **Documentation**: MCP tool reference, setup guide for connecting AI agents, example playtesting workflows
