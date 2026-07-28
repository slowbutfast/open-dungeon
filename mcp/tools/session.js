/**
 * Session lifecycle MCP tools.
 *
 * - dungeon_init_session: Create a new adventure session
 * - dungeon_list_saves: List available save slots
 * - dungeon_load_save: Load a saved adventure
 */

/**
 * Register session lifecycle tools on the given MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('../../engine/index.js').AdventureEngine} engine
 */
export function registerSessionTools(server, engine) {
    // ─── dungeon_init_session ──────────────────────────────────────────────
    server.tool(
        "dungeon_init_session",
        "Initialize a new adventure session with the given configuration. " +
        "Creates a new adventure and returns the adventure ID and initial state.",
        {
            title: z.string().optional().describe("Title for the new adventure (e.g., 'Test Quest')"),
            system_prompt: z.string().optional().describe("Custom system prompt for the LLM narrator"),
            preset_index: z.number().int().optional().describe("Index of a story preset to use (alternative to title/prompt)")
        },
        async (args) => {
            try {
                let title = args.title || "MCP Adventure";
                let systemPrompt = args.system_prompt || null;

                // Handle preset index if provided
                if (args.preset_index !== undefined) {
                    try {
                        const presets = await engine.getPresets();
                        if (args.preset_index >= 0 && args.preset_index < presets.length) {
                            const preset = presets[args.preset_index];
                            title = preset.title || title;
                            systemPrompt = preset.system_prompt || null;
                        }
                    } catch (e) {
                        // Presets not available, fall back to defaults
                    }
                }

                const adventureId = await engine.newAdventure(title, systemPrompt);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            adventure_id: adventureId,
                            title: engine.title,
                            location: engine.location,
                            score: engine.score,
                            moves: engine.moves,
                            system_prompt: engine.systemPrompt
                        }, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error initializing session: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_list_saves ────────────────────────────────────────────────
    server.tool(
        "dungeon_list_saves",
        "List all saved adventures. Returns an array of save metadata including " +
        "ID, title, turns, location, score, and moves for each save.",
        {},
        async () => {
            try {
                const adventures = await engine.listAdventures();
                const saves = adventures.map(a => ({
                    id: a.id,
                    title: a.title || "Untitled Adventure",
                    turns: a.turns || 0,
                    location: a.location || "Unknown",
                    score: a.score || 0,
                    moves: a.moves || 0,
                    summary: a.summary || ""
                }));
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(saves, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error listing saves: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_load_save ─────────────────────────────────────────────────
    server.tool(
        "dungeon_load_save",
        "Load a saved adventure by its ID. Restores the full game state " +
        "including location, history, score, and memory.",
        {
            adventure_id: z.string().describe("The ID of the adventure to load (from dungeon_list_saves)")
        },
        async (args) => {
            try {
                if (!args.adventure_id) {
                    throw new Error("adventure_id is required");
                }
                await engine.load(args.adventure_id);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            adventure_id: engine.adventureId,
                            title: engine.title,
                            location: engine.location,
                            score: engine.score,
                            moves: engine.moves
                        }, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error loading save: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}

// Zod import for schema definitions
import { z } from 'zod';
