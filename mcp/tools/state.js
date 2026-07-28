/**
 * State inspection MCP tools.
 *
 * - dungeon_inspect_state: Current game state overview
 * - dungeon_inspect_history: Conversation history
 * - dungeon_inspect_lore: Active lore/context cards
 */

import { z } from 'zod';

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

                const lore = engine.cards.map(card => ({
                    id: card.id,
                    name: card.name,
                    type: card.type,
                    description: card.description,
                    triggers: card.trigger_words || card.triggers || [],
                    enabled: card.enabled !== undefined ? card.enabled : card.active
                }));

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
}
