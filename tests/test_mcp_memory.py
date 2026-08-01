"""
Tests for memory and inventory MCP tools:
- dungeon_inspect_inventory: Current inventory items
- dungeon_inspect_events: Event log with limit
- dungeon_inspect_stats: Memory statistics
- dungeon_search_memories: Vector similarity search
"""
import os
import sys
import json
import unittest
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result

pytestmark = pytest.mark.integration


class TestMcpMemoryInventory(McpTestCase):
    """Tests for dungeon_inspect_inventory, dungeon_inspect_events,
    dungeon_inspect_stats, dungeon_search_memories."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Memory Test")

    def test_inspect_inventory_returns_array(self):
        """dungeon_inspect_inventory returns an array of inventory items."""
        response = self.client.call_tool("dungeon_inspect_inventory")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_inspect_inventory_items_have_required_fields(self):
        """Each inventory item has item_name and status."""
        response = self.client.call_tool("dungeon_inspect_inventory")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        for item in data:
            self.assertIn("item_name", item)
            self.assertIn("status", item)

    def test_inspect_events_returns_array(self):
        """dungeon_inspect_events returns an array of events."""
        response = self.client.call_tool("dungeon_inspect_events")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_inspect_events_with_limit(self):
        """dungeon_inspect_events respects the limit parameter."""
        response = self.client.call_tool("dungeon_inspect_events", {
            "limit": 5
        })
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)
        self.assertLessEqual(len(data), 5)

    def test_inspect_events_entries_have_required_fields(self):
        """Each event has type and summary."""
        self.client.send_action("look around")
        self.client.send_action("examine")
        response = self.client.call_tool("dungeon_inspect_events")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        for event in data:
            self.assertIn("type", event)
            self.assertIn("summary", event)

    def test_inspect_events_default_limit(self):
        """dungeon_inspect_events uses default limit when not specified."""
        response = self.client.call_tool("dungeon_inspect_events")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_inspect_stats_returns_counts(self):
        """dungeon_inspect_stats returns event, inventory, lore counts."""
        response = self.client.call_tool("dungeon_inspect_stats")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("events", data)
        self.assertIn("inventory", data)
        self.assertIn("lore", data)

    def test_inspect_stats_initial_values(self):
        """Fresh adventure has zero or minimal stats."""
        response = self.client.call_tool("dungeon_inspect_stats")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertGreaterEqual(data.get("events", 0), 0)
        self.assertGreaterEqual(data.get("inventory", 0), 0)

    def test_search_memories_returns_array(self):
        """dungeon_search_memories returns an array of results."""
        self.client.send_action("look")
        response = self.client.call_tool("dungeon_search_memories", {
            "query": "blue crystal"
        })
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)

    def test_search_memories_results_have_fields(self):
        """Results have text and relevanceScore."""
        self.client.send_action("examine")
        response = self.client.call_tool("dungeon_search_memories", {
            "query": "test query"
        })
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        for mem in data:
            self.assertIn("text", mem)
            self.assertIn("relevanceScore", mem)

    def test_search_memories_with_topK(self):
        """dungeon_search_memories respects topK parameter."""
        response = self.client.call_tool("dungeon_search_memories", {
            "query": "adventure",
            "topK": 3
        })
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertLessEqual(len(data), 3)

    def test_search_memories_with_empty_query(self):
        """dungeon_search_memories handles empty query."""
        response = self.client.call_tool("dungeon_search_memories", {
            "query": ""
        })
        self.assertIn("result", response)


if __name__ == "__main__":
    unittest.main()
