/**
 * State inspection MCP tools.
 *
 * - dungeon_inspect_state: Current game state overview
 * - dungeon_inspect_history: Conversation history
 * - dungeon_inspect_lore: Active lore/context cards
 * - dungeon_delete_lore_card: Remove a lore card by ID (recovery path)
 */

import { z } from 'zod';
import { forceFlushBeforeRead } from './memory.js';

/**
 * Register state inspection tools on the given MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('../../engine/index.js').AdventureEngine} engine
 */
export function registerStateTools(server, engine) {
    // ─── dungeon_inspect_state ─────────────────────────────────────────────
    server.tool(
        "dungeon_inspect_state",
        "Inspect the current game state. Returns location, score, moves, title, " +
        "model, max_tokens, summary, and system_prompt information.",
        {},
        async () => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            adventure_id: engine.adventureId,
                            title: engine.title,
                            location: engine.location,
                            current_room_id: engine.currentRoomId,
                            score: engine.score,
                            moves: engine.moves,
                            model: engine.model,
                            max_tokens: engine.maxTokens,
                            temperature: engine.temperature,
                            summary: engine.summary || "",
                            system_prompt: engine.systemPrompt
                        }, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error inspecting state: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_inspect_history ───────────────────────────────────────────
    server.tool(
        "dungeon_inspect_history",
        "Inspect the conversation history. Returns an array of all user and " +
        "assistant turns in chronological order, including roles and text content.",
        {},
        async () => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                const history = engine.history.map((entry, index) => ({
                    index,
                    role: entry.role,
                    text: entry.text
                }));

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(history, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error inspecting history: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_inspect_lore ──────────────────────────────────────────────
    server.tool(
        "dungeon_inspect_lore",
        "Inspect active lore and context cards. Returns an array of lore entries " +
        "with their names, types, descriptions, and trigger words.",
        {},
        async () => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                // Force-flush pending extraction so the read reflects the
                // authoritative store (consistent with the sibling inspect tools).
                await forceFlushBeforeRead(engine);
                const rows = engine.memory.structuredStore.getLore(engine.adventureId);
                const lore = rows.map(row => {
                    let triggers = [];
                    if (row.trigger_words) {
                        try {
                            triggers = JSON.parse(row.trigger_words);
                        } catch (e) {
                            triggers = [row.name.toLowerCase()];
                        }
                    }
                    return {
                        id: row.id,
                        name: row.name,
                        type: row.type,
                        description: row.description,
                        triggers,
                        enabled: row.enabled === 1
                    };
                });

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(lore, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error inspecting lore: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_delete_lore_card ─────────────────────────────────────────
    server.tool(
        "dungeon_delete_lore_card",
        "Delete a lore/context card by its unique ID. Removes the card from the " +
        "structured store and the active card list, so its trigger words no " +
        "longer auto-inject on future turns. This is the recovery path for a " +
        "poisoned or unwanted card. Use dungeon_inspect_lore to find the ID.",
        {
            card_id: z.string().describe("The unique ID of the lore card to delete (from dungeon_inspect_lore)")
        },
        async (args) => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                const removed = await engine.deleteCard(args.card_id);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: removed,
                            deleted_id: args.card_id
                        }, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error deleting lore card: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
