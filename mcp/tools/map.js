/**
 * Spatial map inspection MCP tools (spatial-map-region-graph, 6.2).
 *
 * - dungeon_inspect_map: Rooms, edges, the current room id, and region
 *   groupings of walk-connected rooms.
 * - dungeon_inspect_room: Single-room detail (canonical name, outgoing +
 *   incoming edges with kinds, last visit turn).
 *
 * Both reuse the shared forceFlushBeforeRead helper (D7) — a read-through
 * freshness read over the engine's getMap()/getRoom(id) proxies.
 */

import { z } from 'zod';
import { forceFlushBeforeRead } from './memory.js';

/**
 * Register the spatial map tools on the given MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('../../engine/index.js').AdventureEngine} engine
 */
export function registerMapTools(server, engine) {
    // ─── dungeon_inspect_map ────────────────────────────────────────────────
    server.tool(
        "dungeon_inspect_map",
        "Inspect the spatial room graph. Returns the adventure's rooms (id, " +
        "canonical name, visit counts), edges (from, direction, to, kind, " +
        "inferred flag), the current room id, and region groupings of " +
        "walk-connected rooms. Automatically flushes pending memory extraction " +
        "before reading.",
        {},
        async () => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                await forceFlushBeforeRead(engine);
                const map = await engine.getMap();

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(map, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error inspecting map: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_inspect_room ───────────────────────────────────────────────
    server.tool(
        "dungeon_inspect_room",
        "Inspect a single room in the spatial room graph. Returns the room's " +
        "canonical name, description/lore link, outgoing edges with their " +
        "kinds, incoming edges, and the last visit turn. Use dungeon_inspect_map " +
        "to find room ids. Automatically flushes pending memory extraction " +
        "before reading.",
        {
            room_id: z.string().describe("The unique ID of the room to inspect (from dungeon_inspect_map)")
        },
        async (args) => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                await forceFlushBeforeRead(engine);
                const room = await engine.getRoom(args.room_id);
                if (!room) {
                    throw new Error(`Room '${args.room_id}' not found.`);
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(room, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error inspecting room: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
