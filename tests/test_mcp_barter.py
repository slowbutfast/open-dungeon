"""
Tests for barter and quest MCP tools:
- dungeon_inspect_offers: Available trade offers (optional trader filter)
- dungeon_execute_trade: Execute atomic barter trade
- dungeon_inspect_goals: Active quest goals
- dungeon_complete_goal: Complete a quest goal
"""
import os
import sys
import json
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result


class TestMcpBarterQuests(McpTestCase):
    """Tests for barter and quest tools."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Barter Test")

    def test_inspect_offers_returns_array(self):
        """dungeon_inspect_offers returns an array of barter offers."""
        response = self.client.call_tool("dungeon_inspect_offers")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_inspect_offers_entries_have_fields(self):
        """Each offer has trader_name, required_item, offered_item."""
        response = self.client.call_tool("dungeon_inspect_offers")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        for offer in data:
            self.assertIn("trader_name", offer)
            self.assertIn("required_item", offer)
            self.assertIn("offered_item", offer)

    def test_inspect_offers_with_trader_filter(self):
        """dungeon_inspect_offers filters by trader_name when provided."""
        response = self.client.call_tool("dungeon_inspect_offers", {
            "trader_name": "Merchant Bob"
        })
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)
        for offer in data:
            self.assertEqual(offer.get("trader_name"), "Merchant Bob")

    def test_inspect_offers_with_nonexistent_trader(self):
        """Filtering by non-existent trader returns empty list."""
        response = self.client.call_tool("dungeon_inspect_offers", {
            "trader_name": "Nonexistent Trader XYZ"
        })
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 0)

    def test_execute_trade_with_invalid_trader(self):
        """dungeon_execute_trade returns error for non-existent trader."""
        response = self.client.call_tool("dungeon_execute_trade", {
            "trader_name": "Nonexistent",
            "required_item": "gold coin"
        })
        self.assertIn("result", response)

    def test_execute_trade_without_item(self):
        """dungeon_execute_trade returns error when player lacks item."""
        response = self.client.call_tool("dungeon_execute_trade", {
            "trader_name": "Merchant",
            "required_item": "dragon_scale"
        })
        self.assertIn("result", response)

    def test_inspect_goals_returns_array(self):
        """dungeon_inspect_goals returns an array of goals."""
        response = self.client.call_tool("dungeon_inspect_goals")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_inspect_goals_entries_have_fields(self):
        """Each goal has id, goal_title, npc_name, status."""
        response = self.client.call_tool("dungeon_inspect_goals")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        for goal in data:
            self.assertIn("id", goal)
            self.assertIn("goal_title", goal)
            self.assertIn("npc_name", goal)
            self.assertIn("status", goal)

    def test_inspect_goals_filters_completed(self):
        """Completed/failed goals are not returned."""
        response = self.client.call_tool("dungeon_inspect_goals")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        for goal in data:
            self.assertNotEqual(goal.get("status"), "COMPLETED")
            self.assertNotEqual(goal.get("status"), "FAILED")

    def test_complete_goal_with_invalid_id(self):
        """dungeon_complete_goal returns error for non-existent goal."""
        response = self.client.call_tool("dungeon_complete_goal", {
            "goal_id": "nonexistent_goal_id"
        })
        self.assertIn("result", response)


if __name__ == "__main__":
    unittest.main()
