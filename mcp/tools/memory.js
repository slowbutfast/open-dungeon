/**
 * Memory and inventory MCP tools.
 *
 * - dungeon_inspect_inventory: Current inventory items (read-through flush)
 * - dungeon_inspect_events: Event log with limit parameter (read-through flush)
 * - dungeon_inspect_stats: Memory statistics (read-through flush)
 * - dungeon_search_memories: Vector similarity search (read-through flush)
 */

import { z } from 'zod';

/**
 * Engine-state force-flush before reading engine-derived state (score) or the
 * store directly (lore). The manager's own reads (`getEventLog`,
 * `getInventory`, `getStats`, `recallRelevantMemories`) flush internally, so
 * the memory tools below are thin reads; this helper remains for the callers
 * that need a flush with engine state — `dungeon_send_action` (score
 * freshness), `dungeon_inspect_lore` (direct store read), and the web
 * `GET /api/state` route (score parity with the MCP surface).
 *
 * @param {import('../../engine/index.js').AdventureEngine} engine
 */
export async function forceFlushBeforeRead(engine) {
    if (!engine.adventureId) return;
    try {
        const resolvedModel = await engine.getLoadedModel();
        await engine.memory.flushIfReady(
            engine.state,
            resolvedModel,
            () => engine.save(),
            { force: true }
        );
    } catch (e) {
        // Flush is best-effort; continue even if it fails
    }
}

/**
 * Register memory and inventory tools on the given MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('../../engine/index.js').AdventureEngine} engine
 */
export function registerMemoryTools(server, engine) {
    // ─── dungeon_inspect_inventory ─────────────────────────────────────────
    server.tool(
        "dungeon_inspect_inventory",
        "Inspect the player's inventory. Returns all held, consumed, traded, " +
        "and dropped items from the structured store. Automatically flushes " +
        "pending memory extraction before reading to ensure data freshness.",
        {},
        async () => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                const items = await engine.getInventory();

                const inventory = items.map(item => ({
                    item_name: item.item_name,
                    item_type: item.item_type || 'misc',
                    description: item.description || null,
                    quantity: item.quantity || 1,
                    status: item.status || 'held',
                    acquired_at: item.acquired_at || null,
                    acquired_turn: item.acquired_turn || null
                }));

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(inventory, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error inspecting inventory: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_inspect_events ────────────────────────────────────────────
    server.tool(
        "dungeon_inspect_events",
        "Inspect the event log. Returns recent extracted events with their type, " +
        "summary, entities, and location. Automatically flushes pending memory " +
        "extraction before reading.",
        {
            limit: z.number().int().min(1).max(100)
                .optional()
                .describe("Maximum number of events to return (default: 20, max: 100)")
        },
        async (args) => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                const limit = args.limit || 20;
                const events = await engine.getEventLog(limit);

                const formatted = events.map(event => ({
                    id: event.id,
                    type: event.event_type || event.type,
                    summary: event.summary,
                    entities: event.entities ? (() => {
                        try { return JSON.parse(event.entities); } catch { return event.entities; }
                    })() : [],
                    location: event.location || null,
                    turn_index: event.turn_index || 0
                }));

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(formatted, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error inspecting events: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_inspect_stats ─────────────────────────────────────────────
    server.tool(
        "dungeon_inspect_stats",
        "Inspect memory statistics. Returns counts of events, inventory items, " +
        "lore entries, and the last extracted turn index. Automatically flushes " +
        "pending memory extraction before reading.",
        {},
        async () => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                const stats = await engine.memory.getStats(engine.adventureId);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            events: stats.events || 0,
                            inventory: stats.inventory || 0,
                            lore: stats.lore || 0,
                            last_extracted_turn_index: stats.lastExtractedTurnIndex || 0
                        }, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error inspecting stats: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_search_memories ───────────────────────────────────────────
    server.tool(
        "dungeon_search_memories",
        "Search memories using semantic vector similarity. Returns the most " +
        "relevant memory fragments matching the query, with relevance scores. " +
        "Useful for finding past events, locations, or characters by description.",
        {
            query: z.string().describe("The search query describing what to find (e.g., 'blue crystal', 'the old merchant')"),
            topK: z.number().int().min(1).max(50)
                .optional()
                .describe("Number of top results to return (default: 5, max: 50)")
        },
        async (args) => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                const query = args.query || "";
                const topK = args.topK || 5;

                if (!query.trim()) {
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify([], null, 2)
                        }]
                    };
                }

                const results = await engine.searchMemories(query, topK);

                const formatted = results.map(r => ({
                    text: r.text,
                    relevanceScore: r.relevanceScore || r.score || 0,
                    turnIndex: r.turnIndex || 0,
                    eventType: r.eventType || 'event'
                }));

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(formatted, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error searching memories: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
