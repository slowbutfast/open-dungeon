---
name: open-dungeon-playtest
description: Playtest and interactively navigate Open Dungeon game sessions using the open-dungeon MCP server. Automatically initializes sessions, executes player actions, inspects game state/history, and prompts the user for narrative guidance.
---

# Open Dungeon Playtest & MCP Interactive Skill

This skill guides AI agents (in OpenCode and AGY CLI) to playtest and navigate **OpenDungeon** using the 17 tools exposed by the project's Model Context Protocol (MCP) server.

---

## 1. Environment & MCP Server Setup

### A. OpenCode Configuration (`.opencode/opencode.jsonc`)
Ensure `.opencode/opencode.jsonc` defines the local MCP server and explicit tool permissions:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "open-dungeon": {
      "type": "local",
      "command": ["node", "mcp/server.js"]
    }
  },
  "permission": {
    "read": {
      "**/*.env": "deny",
      "**/*.env.*": "deny",
      "*.env.example": "allow",
      "**/*": "allow"
    },
    "dungeon_*": "allow",
    "open-dungeon/*": "allow",
    "mcp": {
      "open-dungeon/*": "allow",
      "*": "allow"
    }
  }
}
```

### B. AGY CLI Configuration (`.gemini/mcp_config.json`)
Ensure `.gemini/mcp_config.json` defines the workspace MCP server:

```json
{
  "mcpServers": {
    "open-dungeon": {
      "command": "node",
      "args": ["mcp/server.js"]
    }
  }
}
```

---

## 2. Available MCP Tools Reference

The `open-dungeon` MCP server exposes 17 tools:

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

## 3. Interactive Playtesting Workflow Protocol

When invoked by the user, the agent MUST follow this 4-step interactive protocol:

### Step 1: Session Initialization
1. Check for active sessions using `dungeon_inspect_state`.
2. If no session is active, call `dungeon_init_session({ title: "Playtest Session" })`.
3. Report the starting location, score, and moves to the user.

### Step 2: Action Execution
1. Call `dungeon_send_action` with `action_type: "do"` and the target command string (e.g. `text: "open mailbox"` or `text: "go north"`).
2. For narrative prompts or dialogue, use `action_type: "story"` or `action_type: "say"`.

### Step 3: State & Mechanics Verification
After executing actions, call inspection tools to verify game state integrity:
- Call `dungeon_inspect_inventory` when picking up or using items.
- Call `dungeon_inspect_history` to verify turn logging.
- Call `dungeon_get_debug_info` to inspect token usage, LLM execution time, and reasoning traces.

### Step 4: User Guidance Prompting
At each checkpoint, present the turn outcome to the user:
1. **Narration**: Display room description or action output.
2. **Status**: Show `[Location: <Name> | Score: <N> | Moves: <N>]`.
3. **Interactive Guidance Request**: Provide 3–4 suggested next moves or ask the user for custom instructions:
   > *"What action would you like me to take next, or should I continue driving?"*
