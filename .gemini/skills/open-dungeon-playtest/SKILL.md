---
name: open-dungeon-playtest
description: Interactively playtest, debug, or explore OpenDungeon game scenarios using the open-dungeon MCP server. Asks the user upfront whether to play out a scenario or debug, initializes sessions, executes actions, and prompts the user for narrative guidance.
---

# Open Dungeon Playtest & MCP Interactive Skill

This skill guides AI agents to conduct interactive game sessions and debugging work using the 17 tools exposed by the `open-dungeon` MCP server.

---

## 1. Upfront Mode Selection Prompt (REQUIRED FIRST STEP)

Before initializing a session or executing tools, the agent MUST ask the user what mode they want to run:

> **"Welcome to Open Dungeon! How would you like to proceed?"**
> 1. ⚔️ **Play out a Scenario**: Interactive story exploration, making decisions, and testing narrative gameplay.
> 2. 🛠️ **Debug / Test Systems**: Validate engine mechanics, barter/trading, RAG memory retrieval, goal completion, or LLM token costs.
> 3. 🎯 **Custom Goal**: Specify a specific adventure title, location, or test suite to run.

Wait for user input or default to starting a fresh playtest campaign if the user instructs you to take the wheel.

---

## 2. MCP Tools Reference

The 17 available MCP tools:

| Category | Tool Name | Description |
| :--- | :--- | :--- |
| **Session** | `dungeon_init_session` | Start a new game session with a title. |
| | `dungeon_list_saves` | List available save files. |
| | `dungeon_load_save` | Load a saved adventure by `adventure_id`. |
| **Gameplay** | `dungeon_send_action` | Send player action (`action_type: 'do'/'say'/'story'`, `text: '...'`). |
| | `dungeon_undo_action` | Undo the last turn. |
| **State Inspection** | `dungeon_inspect_state` | View current location, score, moves, model, and system prompt. |
| | `dungeon_inspect_inventory` | Inspect current inventory items. |
| | `dungeon_inspect_history` | Inspect complete turn history log. |
| | `dungeon_inspect_stats` | Inspect event, inventory, and lore extraction statistics. |
| | `dungeon_inspect_goals` | View active quests and goal completion states. |
| | `dungeon_complete_goal` | Mark a quest goal as complete. |
| | `dungeon_inspect_lore` | View active world lore cards. |
| | `dungeon_inspect_events` | View extracted event memories. |
| | `dungeon_search_memories` | RAG vector search across memory database. |
| **Barter & Debug** | `dungeon_inspect_offers` | Inspect active NPC trade offers. |
| | `dungeon_execute_trade` | Complete a trade offer with an NPC. |
| | `dungeon_get_debug_info` | Inspect LLM token calls, costs, and DeepSeek thinking logs. |

---

## 3. Interactive Playtesting & Debugging Workflow Protocol

### Step 1: Session Setup
- Ask the upfront prompt (Scenario vs. Debug).
- Call `dungeon_init_session` (e.g. `title: "Interactive Campaign"` or `"Debug Suite"`) or load a save file via `dungeon_load_save`.
- Display starting location, status metrics, and adventure ID.

### Step 2: Execution Cycle
- Execute commands via `dungeon_send_action` (`action_type: 'do'`, `'say'`, or `'story'`).
- For debugging mode, exercise targeted subsystems (e.g. `dungeon_search_memories`, `dungeon_inspect_offers`, `dungeon_complete_goal`).

### Step 3: Verification & Inspection
- Call `dungeon_inspect_state` and `dungeon_inspect_inventory` to verify state changes.
- Call `dungeon_get_debug_info` to inspect LLM response duration, token costs, and reasoning logs.

### Step 4: User Guidance Checkpoint
Present the turn result and status to the user:
- Show room narration or debug output.
- Show `[Status: <Location> | Score: <N> | Moves: <N>]`.
- Ask the user for guidance:
  > *"What action would you like me to take next, or should I continue driving?"*
