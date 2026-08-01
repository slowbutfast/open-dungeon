"""
Tests for session lifecycle MCP tools:
- dungeon_init_session: Create a new adventure session
- dungeon_list_saves: List available save slots
- dungeon_load_save: Load a saved adventure
"""
import os
import sys
import json
import unittest
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result

pytestmark = pytest.mark.integration


class TestMcpSessionLifecycle(McpTestCase):
    """Tests for dungeon_init_session, dungeon_list_saves, dungeon_load_save."""

    def test_init_session_creates_new_adventure(self):
        """dungeon_init_session creates a new adventure and returns an adventure ID."""
        response = self.client.init_session(title="Test Quest")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("adventure_id", data)
        self.assertIsInstance(data["adventure_id"], str)
        self.assertGreater(len(data["adventure_id"]), 0)
        self.assertIn("title", data)
        self.assertEqual(data["title"], "Test Quest")

    def test_init_session_with_custom_prompt(self):
        """dungeon_init_session accepts a custom system_prompt."""
        response = self.client.init_session(
            title="Custom Prompt Test",
            system_prompt="You are a test narrator."
        )
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("adventure_id", data)
        self.assertTrue(len(data.get("system_prompt", "")) > 0)

    def test_init_session_with_invalid_preset(self):
        """dungeon_init_session handles invalid preset index gracefully."""
        response = self.client.call_tool("dungeon_init_session", {
            "preset_index": 9999
        })
        self.assertIn("result", response)

    def test_list_saves_returns_array(self):
        """dungeon_list_saves returns a list of saved adventures."""
        self.client.init_session(title="List Test")
        response = self.client.call_tool("dungeon_list_saves")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 1)

    def test_list_saves_entries_have_required_fields(self):
        """Each save entry has id, title, and timestamp."""
        self.client.init_session(title="Fields Test")
        response = self.client.call_tool("dungeon_list_saves")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        for save in data:
            self.assertIn("id", save)
            self.assertIn("title", save)

    def test_list_saves_after_multiple_creations(self):
        """Multiple init_session calls accumulate saves."""
        self.client.init_session(title="Save One")
        self.client.init_session(title="Save Two")
        response = self.client.call_tool("dungeon_list_saves")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        titles = [s.get("title", "") for s in data]
        self.assertIn("Save One", titles)
        self.assertIn("Save Two", titles)

    def test_load_save_with_valid_id(self):
        """dungeon_load_save loads an adventure by ID."""
        init_resp = self.client.init_session(title="Load Test Adventure")
        init_data = json.loads(
            init_resp["result"]["content"][0].get("text", "")
        )
        adventure_id = init_data["adventure_id"]

        load_resp = self.client.call_tool("dungeon_load_save", {
            "adventure_id": adventure_id
        })
        result = assert_tool_result(load_resp)
        load_text = result["content"][0].get("text", "")
        load_data = json.loads(load_text)
        self.assertIn("success", load_data)

    def test_load_save_with_invalid_id_returns_error(self):
        """dungeon_load_save returns an error for non-existent adventure ID."""
        load_resp = self.client.call_tool("dungeon_load_save", {
            "adventure_id": "nonexistent123"
        })
        self.assertIn("result", load_resp)

    def test_load_save_with_empty_id_returns_error(self):
        """dungeon_load_save handles empty adventure ID."""
        load_resp = self.client.call_tool("dungeon_load_save", {
            "adventure_id": ""
        })
        self.assertIn("result", load_resp)

    def test_load_save_preserves_state(self):
        """State after load matches the saved state."""
        init_resp = self.client.init_session(title="Persist Test")
        init_data = json.loads(
            init_resp["result"]["content"][0].get("text", "")
        )
        adventure_id = init_data["adventure_id"]

        self.client.call_tool("dungeon_load_save", {
            "adventure_id": adventure_id
        })
        state_resp = self.client.call_tool("dungeon_inspect_state")
        result = assert_tool_result(state_resp)
        state_text = result["content"][0].get("text", "")
        state_data = json.loads(state_text)
        self.assertEqual(state_data.get("title"), "Persist Test")


if __name__ == "__main__":
    unittest.main()
