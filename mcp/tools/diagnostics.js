/**
 * Diagnostics MCP tool.
 *
 * - dungeon_get_debug_info: LLM call traces, session cost, error logs, backend status
 */

import { z } from 'zod';
import { llmTracker, getDebugLogs } from '../../engine/llmTracker.js';

/**
 * Register diagnostics tools on the given MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('../../engine/index.js').AdventureEngine} engine
 */
export function registerDiagnosticsTools(server, engine) {
    // ─── dungeon_get_debug_info ────────────────────────────────────────────
    server.tool(
        "dungeon_get_debug_info",
        "Retrieve debug information for the current session. Returns LLM call " +
        "traces, session cost breakdown, debug logs, and backend connection status.",
        {},
        async () => {
            try {
                const calls = llmTracker.getCalls();
                const cost = llmTracker.getSessionCost();
                const logs = getDebugLogs();

                // Get backend status
                let backendStatus = {
                    adventure_active: !!engine.adventureId,
                    adventure_id: engine.adventureId || null,
                    model: engine.model || "unknown",
                    moves: engine.moves || 0,
                    score: engine.score || 0,
                    location: engine.location || null,
                    memory_db_path: engine.memory?.structuredStore?.db?.name || null
                };

                // Add mock LLM status
                if (process.env.MOCK_LLM === "1") {
                    backendStatus.mock_llm = true;
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            llm_calls: calls.map(call => ({
                                id: call.id,
                                type: call.type,
                                status: call.status,
                                duration_ms: call.duration,
                                timestamp: call.timestamp,
                                tokens: call.tokens || { input: 0, output: 0 },
                                error: call.error || null
                            })),
                            session_cost: {
                                input_tokens: cost.input_tokens,
                                output_tokens: cost.output_tokens,
                                total_tokens: cost.total_tokens,
                                estimated_cost_usd: cost.estimated_cost_usd,
                                breakdown: cost.breakdown
                            },
                            debug_logs: logs.map(log => ({
                                timestamp: log.timestamp,
                                message: log.message
                            })),
                            backend_status: backendStatus
                        }, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error retrieving debug info: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
