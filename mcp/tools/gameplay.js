/**
 * Core gameplay MCP tools.
 *
 * - dungeon_send_action: Execute a player action (do/say/story)
 * - dungeon_undo_action: Undo the last action
 */

import { z } from 'zod';
import { parseStatusLine } from '../../engine/llm.js';
import { forceFlushBeforeRead } from './memory.js';

/**
 * Register core gameplay tools on the given MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('../../engine/index.js').AdventureEngine} engine
 */
export function registerGameplayTools(server, engine) {
    // ─── dungeon_send_action ───────────────────────────────────────────────
    server.tool(
        "dungeon_send_action",
        "Execute a player action in the current adventure. Returns the narration " +
        "text along with status metrics (location, score, moves). " +
        "Use action_type 'do' for physical actions, 'say' for dialogue, 'story' for narrative prompts.",
        {
            action_type: z.enum(["do", "say", "story", "continue"])
                .optional()
                .describe("Type of action: 'do' (default, physical actions), 'say' (dialogue), 'story' (narrative prompt), 'continue' (continue last response)"),
            text: z.string().describe("The action text, e.g., 'look around', 'go north', 'take the sword'")
        },
        async (args) => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                const actionType = args.action_type || "do";
                const text = args.text || "";

                // Generate the response stream and collect narration text
                const stream = engine.generateResponseStream(actionType, text);
                let fullText = "";
                let narrationText = "";
                for await (const chunk of stream) {
                    if (chunk && chunk.type === 'done' && chunk.content) {
                        narrationText = chunk.content;
                    } else if (chunk && chunk.type === 'chunk' && chunk.content) {
                        fullText += chunk.content;
                    }
                }
                const rawNarration = narrationText || fullText;

                // Score is engine-computed at extraction-flush time
                // (fix-score-progression, D1/D2). Force a flush now so the
                // tool reports the same engine score dungeon_inspect_state
                // would — the narrator's status-line Score claim is advisory.
                await forceFlushBeforeRead(engine);

                // Parse the status line from the narration. The engine owns the
                // moves counter (it increments exactly once per completed turn
                // and ignores the model's Moves field) and owns the score, so
                // the tool reports engine.moves / engine.score to stay in
                // agreement with dungeon_inspect_state. Location falls back to
                // engine state when the (already sanitized) narration carries
                // no status line.
                const { narration, location } = parseStatusLine(rawNarration);
                const result = {
                    narration: narration || rawNarration,
                    location: location || engine.location,
                    score: engine.score,
                    moves: engine.moves
                };

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error executing action: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_undo_action ───────────────────────────────────────────────
    server.tool(
        "dungeon_undo_action",
        "Undo the last player action. Reverts the most recent turn, restoring " +
        "the previous state. Returns success status and details of the reverted turn.",
        {},
        async () => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                const result = await engine.undo();
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: !!(result.userTurn || result.assistantTurn),
                            reverted_user_turn: result.userTurn ? result.userTurn.text : null,
                            reverted_assistant_turn: result.assistantTurn ? result.assistantTurn.text : null,
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
                        text: `Error undoing action: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
