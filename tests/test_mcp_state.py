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
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result

pytestmark = pytest.mark.integration


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

    def test_inspect_lore_reflects_pending_extraction(self):
        """dungeon_inspect_lore returns store-backed cards after a turn producing
        extractable lore, matching dungeon_inspect_stats.lore."""
        # A turn whose narration triggers extractable lore (mock: "cantina").
        self.client.send_action("look")
        lore_resp = self.client.call_tool("dungeon_inspect_lore")
        result = assert_tool_result(lore_resp)
        lore_text = result["content"][0].get("text", "")
        lore_data = json.loads(lore_text)

        # The store-backed read must return the freshly-extracted lore, not [].
        self.assertGreater(len(lore_data), 0)

        stats_resp = self.client.call_tool("dungeon_inspect_stats")
        stats_result = assert_tool_result(stats_resp)
        stats_text = stats_result["content"][0].get("text", "")
        stats_data = json.loads(stats_text)
        self.assertEqual(len(lore_data), stats_data.get("lore", 0))

    def test_inspect_lore_entries_have_full_field_shape(self):
        """Each lore entry keeps the full output shape (id, name, type,
        description, triggers, enabled) after the store-backed read."""
        self.client.send_action("look")
        response = self.client.call_tool("dungeon_inspect_lore")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertGreater(len(data), 0)
        for entry in data:
            self.assertIn("id", entry)
            self.assertIn("name", entry)
            self.assertIn("type", entry)
            self.assertIn("description", entry)
            self.assertIn("triggers", entry)
            self.assertIn("enabled", entry)
            self.assertIsInstance(entry["triggers"], list)


if __name__ == "__main__":
    unittest.main()
