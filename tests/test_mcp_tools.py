"""
Comprehensive unit tests for all 17 MCP tools.
Tests each tool handler's ability to call the underlying AdventureEngine method,
return properly structured output, and handle edge cases.
"""
import os
import sys
import json
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result


class TestMcpToolsSessionLifecycle(McpTestCase):
    """Tests for session lifecycle tools (3 tools)."""

    def test_dungeon_init_session(self):
        """dungeon_init_session creates a new adventure and returns ID."""
        response = self.client.init_session(title="Tool Test Session")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("adventure_id", data)

    def test_dungeon_list_saves(self):
        """dungeon_list_saves returns list of saves."""
        response = self.client.call_tool("dungeon_list_saves")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_dungeon_load_save(self):
        """dungeon_load_save loads by ID."""
        init_resp = self.client.init_session(title="Load Tool Test")
        init_data = json.loads(
            init_resp["result"]["content"][0].get("text", "")
        )
        adv_id = init_data["adventure_id"]
        response = self.client.call_tool("dungeon_load_save", {
            "adventure_id": adv_id
        })
        assert_tool_result(response)


class TestMcpToolsGameplay(McpTestCase):
    """Tests for gameplay tools (2 tools)."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Gameplay Tool Test")

    def test_dungeon_send_action(self):
        """dungeon_send_action returns narration with location/score/moves."""
        response = self.client.send_action("look around")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("narration", data)
        self.assertIn("location", data)
        self.assertIn("score", data)
        self.assertIn("moves", data)

    def test_dungeon_undo_action(self):
        """dungeon_undo_action reverts last turn."""
        self.client.send_action("look")
        response = self.client.call_tool("dungeon_undo_action")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("success", data)


class TestMcpToolsStateInspection(McpTestCase):
    """Tests for state inspection tools (3 tools)."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="State Tool Test")

    def test_dungeon_inspect_state(self):
        """dungeon_inspect_state returns location, score, moves, title, model."""
        response = self.client.call_tool("dungeon_inspect_state")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        for key in ("location", "score", "moves", "title", "model"):
            self.assertIn(key, data)

    def test_dungeon_inspect_history(self):
        """dungeon_inspect_history returns list of turn objects."""
        response = self.client.call_tool("dungeon_inspect_history")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_dungeon_inspect_lore(self):
        """dungeon_inspect_lore returns list of lore entries."""
        response = self.client.call_tool("dungeon_inspect_lore")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)


class TestMcpToolsMemoryInventory(McpTestCase):
    """Tests for memory and inventory tools (4 tools)."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Memory Tool Test")

    def test_dungeon_inspect_inventory(self):
        """dungeon_inspect_inventory returns inventory items."""
        response = self.client.call_tool("dungeon_inspect_inventory")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_dungeon_inspect_events(self):
        """dungeon_inspect_events returns events with limit support."""
        response = self.client.call_tool("dungeon_inspect_events", {"limit": 5})
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)
        self.assertLessEqual(len(data), 5)

    def test_dungeon_inspect_stats(self):
        """dungeon_inspect_stats returns event/inventory/lore counts."""
        response = self.client.call_tool("dungeon_inspect_stats")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("events", data)
        self.assertIn("inventory", data)

    def test_dungeon_search_memories(self):
        """dungeon_search_memories performs vector search."""
        response = self.client.call_tool("dungeon_search_memories", {
            "query": "blue crystal",
            "topK": 3
        })
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)


class TestMcpToolsBarterQuests(McpTestCase):
    """Tests for barter and quest tools (4 tools)."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Barter Tool Test")

    def test_dungeon_inspect_offers(self):
        """dungeon_inspect_offers returns barter offers."""
        response = self.client.call_tool("dungeon_inspect_offers")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_dungeon_execute_trade(self):
        """dungeon_execute_trade handles missing items gracefully."""
        response = self.client.call_tool("dungeon_execute_trade", {
            "trader_name": "Vendor",
            "required_item": "rusty_sword"
        })
        self.assertIn("result", response)

    def test_dungeon_inspect_goals(self):
        """dungeon_inspect_goals returns active goals."""
        response = self.client.call_tool("dungeon_inspect_goals")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_dungeon_complete_goal(self):
        """dungeon_complete_goal handles missing goals."""
        response = self.client.call_tool("dungeon_complete_goal", {
            "goal_id": "nonexistent"
        })
        self.assertIn("result", response)


class TestMcpToolsDiagnostics(McpTestCase):
    """Tests for diagnostics tools (1 tool)."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Diag Tool Test")

    def test_dungeon_get_debug_info(self):
        """dungeon_get_debug_info returns complete diagnostics."""
        response = self.client.call_tool("dungeon_get_debug_info")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("llm_calls", data)
        self.assertIn("session_cost", data)
        self.assertIn("debug_logs", data)
        self.assertIn("backend_status", data)


if __name__ == "__main__":
    unittest.main()
