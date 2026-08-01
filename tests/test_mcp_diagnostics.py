"""
Tests for diagnostics MCP tool:
- dungeon_get_debug_info: LLM call traces, session cost, error logs, backend status
"""
import os
import sys
import json
import unittest
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result

pytestmark = pytest.mark.integration


class TestMcpDiagnostics(McpTestCase):
    """Tests for dungeon_get_debug_info."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Diagnostics Test")

    def test_get_debug_info_returns_required_fields(self):
        """dungeon_get_debug_info returns LLM call traces, session cost, etc."""
        response = self.client.call_tool("dungeon_get_debug_info")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIn("llm_calls", data)
        self.assertIn("session_cost", data)
        self.assertIn("debug_logs", data)
        self.assertIn("backend_status", data)

    def test_get_debug_info_llm_calls_is_array(self):
        """llm_calls is an array of call objects."""
        response = self.client.call_tool("dungeon_get_debug_info")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data["llm_calls"], list)

    def test_get_debug_info_session_cost_has_fields(self):
        """session_cost has token and cost breakdown."""
        response = self.client.call_tool("dungeon_get_debug_info")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        cost = data["session_cost"]
        self.assertIn("input_tokens", cost)
        self.assertIn("output_tokens", cost)
        self.assertIn("total_tokens", cost)
        self.assertIn("estimated_cost_usd", cost)

    def test_get_debug_info_debug_logs_is_array(self):
        """debug_logs is an array of log entries."""
        response = self.client.call_tool("dungeon_get_debug_info")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertIsInstance(data["debug_logs"], list)

    def test_get_debug_info_backend_status_has_fields(self):
        """backend_status contains engine state info."""
        response = self.client.call_tool("dungeon_get_debug_info")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        status = data["backend_status"]
        self.assertIn("adventure_active", status)
        self.assertIn("adventure_id", status)
        self.assertIn("model", status)

    def test_get_debug_info_updates_after_actions(self):
        """debug info reflects state changes after gameplay."""
        self.client.send_action("look")
        response = self.client.call_tool("dungeon_get_debug_info")
        result = assert_tool_result(response)
        text = result["content"][0].get("text", "")
        data = json.loads(text)
        self.assertGreater(data["backend_status"]["moves"], 0)


if __name__ == "__main__":
    unittest.main()
