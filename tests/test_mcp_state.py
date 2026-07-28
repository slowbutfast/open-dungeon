"""
Tests for state inspection MCP tools:
- dungeon_inspect_state: Current game state overview
- dungeon_inspect_history: Conversation history
- dungeon_inspect_lore: Active lore/context cards
"""
import os
import sys
import json
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result


class TestMcpStateInspection(McpTestCase):
    """Tests for dungeon_inspect_state, dungeon_inspect_history, dungeon_inspect_lore."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="State Inspection Test")

    def test_inspect_state_returns_all_fields(self):
        """dungeon_inspect_state returns location, score, moves, title, etc."""
        response = self.client.call_tool("dungeon_inspect_state")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("location", data)
        self.assertIn("score", data)
        self.assertIn("moves", data)
        self.assertIn("title", data)
        self.assertIn("model", data)

    def test_inspect_state_returns_summary_and_prompt(self):
        """dungeon_inspect_state includes summary and system_prompt."""
        response = self.client.call_tool("dungeon_inspect_state")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("summary", data)
        self.assertIn("system_prompt", data)

    def test_inspect_state_initial_values(self):
        """Fresh adventure has expected initial values."""
        response = self.client.call_tool("dungeon_inspect_state")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertEqual(data.get("moves"), 0)
        self.assertEqual(data.get("score"), 0)
        self.assertEqual(data.get("title"), "State Inspection Test")

    def test_inspect_state_reflects_actions(self):
        """After actions, state values update."""
        self.client.send_action("look")
        response = self.client.call_tool("dungeon_inspect_state")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertGreater(data.get("moves", 0), 0)

    def test_inspect_history_returns_array(self):
        """dungeon_inspect_history returns the history array."""
        response = self.client.call_tool("dungeon_inspect_history")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_inspect_history_after_actions(self):
        """History contains entries after actions."""
        self.client.send_action("look")
        response = self.client.call_tool("dungeon_inspect_history")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertGreater(len(data), 0)

    def test_inspect_history_entries_have_role_and_text(self):
        """Each history entry has role and text fields."""
        self.client.send_action("examine")
        response = self.client.call_tool("dungeon_inspect_history")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        for entry in data:
            self.assertIn("role", entry)
            self.assertIn("text", entry)

    def test_inspect_lore_returns_array(self):
        """dungeon_inspect_lore returns an array of lore entries."""
        response = self.client.call_tool("dungeon_inspect_lore")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_inspect_lore_entries_have_required_fields(self):
        """Each lore entry has name, type, description."""
        response = self.client.call_tool("dungeon_inspect_lore")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        for entry in data:
            self.assertIn("name", entry)
            self.assertIn("type", entry)
            self.assertIn("description", entry)


if __name__ == "__main__":
    unittest.main()
