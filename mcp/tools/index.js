/**
 * Tool registration framework for the MCP server.
 *
 * Each tool category module exports a function that receives the McpServer instance
 * and the AdventureEngine instance, and registers its tools.
 */

import { registerSessionTools } from './session.js';
import { registerGameplayTools } from './gameplay.js';
import { registerStateTools } from './state.js';
import { registerMemoryTools } from './memory.js';
import { registerBarterTools } from './barter.js';
import { registerDiagnosticsTools } from './diagnostics.js';

/**
 * Register all MCP tools with the given server and engine instances.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server - The MCP server instance
 * @param {import('../../engine/index.js').AdventureEngine} engine - The AdventureEngine instance
 */
export function registerAllTools(server, engine) {
    registerSessionTools(server, engine);
    registerGameplayTools(server, engine);
    registerStateTools(server, engine);
    registerMemoryTools(server, engine);
    registerBarterTools(server, engine);
    registerDiagnosticsTools(server, engine);
}
