## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing tests for session lifecycle tools (dungeon_init_session, dungeon_list_saves, dungeon_load_save)
- [x] 1.2 Write failing tests for core gameplay tools (dungeon_send_action, dungeon_undo_action)
- [x] 1.3 Write failing tests for state inspection tools (dungeon_inspect_state, dungeon_inspect_history, dungeon_inspect_lore)
- [x] 1.4 Write failing tests for memory and inventory tools (dungeon_inspect_inventory, dungeon_inspect_events, dungeon_inspect_stats, dungeon_search_memories)
- [x] 1.5 Write failing tests for barter and quest tools (dungeon_inspect_offers, dungeon_execute_trade, dungeon_inspect_goals, dungeon_complete_goal)
- [x] 1.6 Write failing tests for diagnostics tools (dungeon_get_debug_info)
- [x] 1.7 Write failing tests for MCP protocol compliance (tool discovery, schema validation, stdio/SSE transports)

## 2. Project Setup

- [x] 2.1 Install @modelcontextprotocol/sdk dependency
- [x] 2.2 Create mcp/ directory structure (mcp/server.js, mcp/tools/)
- [x] 2.3 Add npm script for starting MCP server (npm run mcp)

## 3. MCP Server Core

- [x] 3.1 Implement mcp/server.js entry point with AdventureEngine instantiation
- [x] 3.2 Implement stdio transport setup
- [x] 3.3 Implement SSE transport setup (optional --transport sse flag)
- [x] 3.4 Implement tool registration framework (mcp/tools/index.js)

## 4. Session Lifecycle Tools

- [x] 4.1 Implement dungeon_init_session tool handler
- [x] 4.2 Implement dungeon_list_saves tool handler
- [x] 4.3 Implement dungeon_load_save tool handler

## 5. Core Gameplay Tools

- [x] 5.1 Implement dungeon_send_action tool handler
- [x] 5.2 Implement dungeon_undo_action tool handler

## 6. State Inspection Tools

- [x] 6.1 Implement dungeon_inspect_state tool handler
- [x] 6.2 Implement dungeon_inspect_history tool handler
- [x] 6.3 Implement dungeon_inspect_lore tool handler

## 7. Memory and Inventory Tools

- [x] 7.1 Implement dungeon_inspect_inventory tool handler with force-flush
- [x] 7.2 Implement dungeon_inspect_events tool handler with limit parameter
- [x] 7.3 Implement dungeon_inspect_stats tool handler
- [x] 7.4 Implement dungeon_search_memories tool handler with vector search

## 8. Barter and Quest Tools

- [x] 8.1 Implement dungeon_inspect_offers tool handler with trader filter
- [x] 8.2 Implement dungeon_execute_trade tool handler with atomic swap
- [x] 8.3 Implement dungeon_inspect_goals tool handler
- [x] 8.4 Implement dungeon_complete_goal tool handler with item validation

## 9. Diagnostics Tools

- [x] 9.1 Implement dungeon_get_debug_info tool handler

## 10. Integration and Verification

- [x] 10.1 Run all unit tests and ensure they pass
- [x] 10.2 Run MCP protocol integration tests
- [ ] 10.3 Manual verification: start MCP server and connect with MCP inspector
- [ ] 10.4 Manual verification: execute 10-turn autonomous playtest with AI agent
- [ ] 10.5 Manual verification: test barter workflow end-to-end
- [ ] 10.6 Manual verification: test quest completion workflow
- [x] 10.7 Update engine/ARCHITECTURE.md with MCP server documentation
