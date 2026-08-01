"""
Tests for core gameplay MCP tools:
- dungeon_send_action: Execute a player action
- dungeon_undo_action: Undo the last action
"""
import os
import sys
import json
import unittest
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result

pytestmark = pytest.mark.integration


class TestMcpGameplay(McpTestCase):
    """Tests for dungeon_send_action and dungeon_undo_action."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Gameplay Test")

    def test_send_action_returns_narration(self):
        """dungeon_send_action with valid input returns narration text."""
        response = self.client.send_action("look around")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("narration", data)
        self.assertGreater(len(data["narration"]), 0)

    def test_send_action_includes_status_metrics(self):
        """Response includes location, score, moves metrics."""
        response = self.client.send_action("examine room")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("location", data)
        self.assertIn("score", data)
        self.assertIn("moves", data)

    def test_send_action_increments_moves(self):
        """Each action increments the move counter."""
        resp1 = self.client.send_action("look")
        text1 = json.loads(resp1["result"]["content"][0].get("text", ""))
        moves_before = text1.get("moves", 0)

        resp2 = self.client.send_action("wait")
        text2 = json.loads(resp2["result"]["content"][0].get("text", ""))
        moves_after = text2.get("moves", 0)

        self.assertGreater(moves_after, moves_before)

    def test_send_action_with_say_type(self):
        """dungeon_send_action supports 'say' action_type."""
        response = self.client.call_tool("dungeon_send_action", {
            "action_type": "say",
            "text": "Hello, world!"
        })
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("narration", data)

    def test_send_action_with_story_type(self):
        """dungeon_send_action supports 'story' action_type."""
        response = self.client.call_tool("dungeon_send_action", {
            "action_type": "story",
            "text": "A mysterious figure appears."
        })
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("narration", data)

    def test_send_action_with_invalid_type(self):
        """dungeon_send_action handles invalid action_type."""
        response = self.client.call_tool("dungeon_send_action", {
            "action_type": "invalid_type",
            "text": "test"
        })
        self.assertIn("result", response)

    def test_send_action_with_empty_text(self):
        """dungeon_send_action handles empty text."""
        response = self.client.call_tool("dungeon_send_action", {
            "action_type": "do",
            "text": ""
        })
        self.assertIn("result", response)

    def test_undo_action_reverts_last_turn(self):
        """dungeon_undo_action reverts the last action."""
        resp1 = self.client.send_action("look")
        text1 = json.loads(resp1["result"]["content"][0].get("text", ""))
        moves_after_first = text1.get("moves", 0)

        resp2 = self.client.send_action("go north")
        text2 = json.loads(resp2["result"]["content"][0].get("text", ""))

        undo_resp = self.client.call_tool("dungeon_undo_action")
        result = assert_tool_result(undo_resp)
        undo_text = result["content"][0].get("text", "")
        undo_data = json.loads(undo_text)
        self.assertIn("success", undo_data)
        self.assertTrue(undo_data["success"])

    def test_undo_action_updates_history(self):
        """After undo, history has fewer entries."""
        resp1 = self.client.send_action("look")
        moves_after_first = json.loads(
            resp1["result"]["content"][0].get("text", "")
        ).get("moves", 0)

        # Check history length before undo
        hist_before = self.client.call_tool("dungeon_inspect_history")
        hist_before_data = json.loads(
            hist_before["result"]["content"][0].get("text", "")
        )
        len_before = len(hist_before_data)

        self.client.send_action("go north")
        self.client.call_tool("dungeon_undo_action")

        # History should be back to original length (undo removed 1 action)
        hist_after = self.client.call_tool("dungeon_inspect_history")
        hist_after_data = json.loads(
            hist_after["result"]["content"][0].get("text", "")
        )
        self.assertEqual(len(hist_after_data), len_before)

    def test_undo_action_with_no_history(self):
        """dungeon_undo_action handles empty history gracefully."""
        # Create a fresh session and undo immediately
        self.client.init_session(title="Undo Empty Test")
        undo_resp = self.client.call_tool("dungeon_undo_action")
        self.assertIn("result", undo_resp)

    def test_undo_action_multiple_times(self):
        """Multiple undos work correctly."""
        self.client.send_action("look")
        self.client.send_action("go north")
        self.client.send_action("examine")

        # Check history length after 3 actions
        hist_resp = self.client.call_tool("dungeon_inspect_history")
        hist_data = json.loads(
            hist_resp["result"]["content"][0].get("text", "")
        )
        # History should have at least some entries (init + actions)
        len_after_actions = len(hist_data)

        for i in range(3):
            undo_resp = self.client.call_tool("dungeon_undo_action")
            self.assertIn("result", undo_resp)

        # History should be shorter after undoing all 3 actions
        hist_after = self.client.call_tool("dungeon_inspect_history")
        hist_after_data = json.loads(
            hist_after["result"]["content"][0].get("text", "")
        )
        self.assertLess(len(hist_after_data), len_after_actions)


if __name__ == "__main__":
    unittest.main()
