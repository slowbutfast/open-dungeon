/**
 * Barter and quest MCP tools.
 *
 * - dungeon_inspect_offers: Available trade offers (optional trader filter)
 * - dungeon_execute_trade: Execute atomic barter trade
 * - dungeon_inspect_goals: Active quest goals
 * - dungeon_complete_goal: Complete a quest goal with item validation
 */

import { z } from 'zod';

/**
 * Register barter and quest tools on the given MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('../../engine/index.js').AdventureEngine} engine
 */
export function registerBarterTools(server, engine) {
    // ─── dungeon_inspect_offers ────────────────────────────────────────────
    server.tool(
        "dungeon_inspect_offers",
        "Inspect available barter/trade offers. Returns offers from all traders " +
        "or filtered by a specific trader name. Each offer shows what item is " +
        "required and what is offered in return.",
        {
            trader_name: z.string().optional()
                .describe("Optional trader name to filter offers (e.g., 'Merchant Bob')")
        },
        async (args) => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                const traderName = args.trader_name || null;
                const offers = engine.getOffers(traderName);

                const formatted = offers.map(offer => ({
                    id: offer.id,
                    trader_name: offer.trader_name,
                    required_item: offer.required_item,
                    offered_item: offer.offered_item,
                    description: offer.description || null
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
                        text: `Error inspecting offers: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_execute_trade ─────────────────────────────────────────────
    server.tool(
        "dungeon_execute_trade",
        "Execute a barter trade with a trader. Validates that the player has " +
        "the required item, then performs an atomic swap: consumes the required " +
        "item and grants the offered item.",
        {
            trader_name: z.string().describe("Name of the trader to trade with (e.g., 'Merchant Bob')"),
            required_item: z.string().describe("The item the trader requires (e.g., 'silver_ring')")
        },
        async (args) => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                const result = engine.executeBarter(args.trader_name, args.required_item);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            trader_name: result.trader_name,
                            required_item: result.required_item,
                            offered_item: result.offered_item,
                            description: result.description || null
                        }, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error executing trade: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_inspect_goals ─────────────────────────────────────────────
    server.tool(
        "dungeon_inspect_goals",
        "Inspect active quest goals. Returns goals that are not yet completed " +
        "or failed, showing their current status, required items, and rewards.",
        {},
        async () => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                const goals = engine.getGoals();

                const formatted = goals.map(goal => ({
                    id: goal.id,
                    goal_title: goal.goal_title,
                    npc_name: goal.npc_name,
                    required_item: goal.required_item,
                    reward_item: goal.reward_item,
                    status: goal.status,
                    created_turn: goal.created_turn || 0
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
                        text: `Error inspecting goals: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    // ─── dungeon_complete_goal ─────────────────────────────────────────────
    server.tool(
        "dungeon_complete_goal",
        "Complete a quest goal. Validates that the required item is held, " +
        "consumes it, grants the reward item, and transitions the goal to COMPLETED.",
        {
            goal_id: z.string().describe("The ID of the goal to complete (from dungeon_inspect_goals)")
        },
        async (args) => {
            try {
                if (!engine.adventureId) {
                    throw new Error("No active adventure. Call dungeon_init_session first.");
                }

                const result = engine.completeGoal(args.goal_id);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            goal_id: result.id,
                            goal_title: result.goal_title,
                            npc_name: result.npc_name,
                            status: result.status,
                            required_item: result.required_item,
                            reward_item: result.reward_item,
                            completed_turn: result.completed_turn || 0
                        }, null, 2)
                    }]
                };
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error completing goal: ${error.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
