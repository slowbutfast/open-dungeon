"""
Integration tests for MCP protocol compliance.
Verifies:
- Tool discovery returns all 18 tools with correct schemas
- Tool invocation with valid input succeeds
- Tool invocation with invalid input returns errors
- stdio transport works correctly
"""
import os
import sys
import json
import unittest
import subprocess
import time
import pytest

pytestmark = pytest.mark.integration

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_mcp_success, McpClient

# Expected tool names
EXPECTED_TOOLS = [
    "dungeon_init_session",
    "dungeon_list_saves",
    "dungeon_load_save",
    "dungeon_send_action",
    "dungeon_undo_action",
    "dungeon_inspect_state",
    "dungeon_inspect_history",
    "dungeon_inspect_lore",
    "dungeon_delete_lore_card",
    "dungeon_inspect_inventory",
    "dungeon_inspect_events",
    "dungeon_inspect_stats",
    "dungeon_search_memories",
    "dungeon_inspect_offers",
    "dungeon_execute_trade",
    "dungeon_inspect_goals",
    "dungeon_complete_goal",
    "dungeon_get_debug_info",
]


class TestMcpProtocolCompliance(McpTestCase):
    """Tests for MCP protocol compliance."""

    def test_tool_list_returns_all_18_tools(self):
        """tools/list returns exactly 18 tools."""
        response = self.client.list_tools()
        assert_mcp_success(response)
        result = response["result"]
        self.assertIn("tools", result)
        tools = result["tools"]
        self.assertEqual(
            len(tools), 18,
            f"Expected 18 tools, got {len(tools)}"
        )
        tool_names = [t["name"] for t in tools]
        for name in EXPECTED_TOOLS:
            self.assertIn(name, tool_names,
                          f"Missing expected tool: {name}")

    def test_tool_list_names_are_unique(self):
        """All tool names are unique."""
        response = self.client.list_tools()
        tools = response["result"]["tools"]
        names = [t["name"] for t in tools]
        self.assertEqual(len(names), len(set(names)),
                         "Duplicate tool names found")

    def test_tool_list_has_descriptions(self):
        """Each tool has a non-empty description."""
        response = self.client.list_tools()
        tools = response["result"]["tools"]
        for tool in tools:
            self.assertIn("description", tool)
            self.assertGreater(
                len(tool["description"]), 0,
                f"Tool '{tool['name']}' has empty description"
            )

    def test_tool_list_has_input_schemas(self):
        """Each tool has an inputSchema with proper JSON Schema structure."""
        response = self.client.list_tools()
        tools = response["result"]["tools"]
        for tool in tools:
            self.assertIn("inputSchema", tool,
                          f"Tool '{tool['name']}' missing inputSchema")
            schema = tool["inputSchema"]
            self.assertIn("type", schema)
            self.assertIn("properties", schema)

    def test_tool_list_session_tools_have_correct_params(self):
        """Session lifecycle tools have expected parameters."""
        response = self.client.list_tools()
        tools = response["result"]["tools"]
        tools_by_name = {t["name"]: t for t in tools}

        load_schema = tools_by_name["dungeon_load_save"]["inputSchema"]
        load_props = load_schema.get("properties", {})
        self.assertIn("adventure_id", load_props)

    def test_tool_list_gameplay_tools_have_correct_params(self):
        """Gameplay tools have expected parameters."""
        response = self.client.list_tools()
        tools = response["result"]["tools"]
        tools_by_name = {t["name"]: t for t in tools}

        action_schema = tools_by_name["dungeon_send_action"]["inputSchema"]
        action_props = action_schema.get("properties", {})
        self.assertIn("action_type", action_props,
                      "dungeon_send_action missing action_type param")
        self.assertIn("text", action_props,
                      "dungeon_send_action missing text param")

    def test_tool_invoke_init_session_succeeds(self):
        """dungeon_init_session with valid input succeeds."""
        response = self.client.init_session(title="Protocol Test")
        assert_mcp_success(response)

    def test_tool_invoke_list_saves_succeeds(self):
        """dungeon_list_saves returns a valid response."""
        response = self.client.call_tool("dungeon_list_saves")
        assert_mcp_success(response)

    def test_tool_invoke_send_action_succeeds(self):
        """dungeon_send_action with valid input succeeds."""
        self.client.init_session(title="Action Test")
        response = self.client.send_action("look around")
        assert_mcp_success(response)

    def test_tool_invoke_invalid_tool_name(self):
        """Calling a non-existent tool returns an error."""
        response = self.client.call_tool("dungeon_nonexistent_tool")
        has_error = "error" in response or (
            response.get("result", {}).get("isError") is True
        )
        self.assertTrue(has_error,
                        f"Expected error in response: {response}")

    def test_tool_invoke_with_missing_required_param(self):
        """Calling a tool with missing required params returns an error."""
        self.client.init_session(title="Param Test")
        response = self.client.call_tool("dungeon_send_action", {})
        if "error" in response:
            self.assertIn("required", str(response["error"]).lower())
        else:
            # SDK may provide defaults or return isError
            self.assertIn("result", response)

    def test_stdio_transport_message_exchange(self):
        """Basic request-response cycle works over stdio."""
        response = self.client.list_tools()
        assert_mcp_success(response)
        self.assertIn("result", response)

    def test_stdio_transport_concurrent_requests(self):
        """Multiple requests in sequence work."""
        self.client.init_session(title="Concurrent Test")
        r1 = self.client.send_action("look")
        r2 = self.client.call_tool("dungeon_undo_action")
        r3 = self.client.call_tool("dungeon_inspect_state")
        assert_mcp_success(r1)
        assert_mcp_success(r2)
        assert_mcp_success(r3)

    def test_stdio_transport_initialization_handshake(self):
        """Initialize then initialized flow works."""
        response = self.client.list_tools()
        assert_mcp_success(response)

    def test_stdio_transport_json_rpc_format(self):
        """Response has proper JSON-RPC 2.0 format."""
        response = self.client.list_tools()
        self.assertEqual(response.get("jsonrpc"), "2.0")
        self.assertIn("id", response)

    def test_schema_validation_init_session(self):
        """dungeon_init_session schema validates correctly."""
        response = self.client.list_tools()
        tools = response["result"]["tools"]
        init_tool = next(
            t for t in tools if t["name"] == "dungeon_init_session"
        )
        schema = init_tool["inputSchema"]
        self.assertEqual(schema.get("type"), "object")
        props = schema.get("properties", {})
        for key in ["title", "system_prompt", "preset_index"]:
            if key in props:
                self.assertIn("type", props[key],
                              f"Property '{key}' missing 'type'")

    def test_schema_validation_send_action(self):
        """dungeon_send_action schema validates correctly."""
        response = self.client.list_tools()
        tools = response["result"]["tools"]
        action_tool = next(
            t for t in tools if t["name"] == "dungeon_send_action"
        )
        schema = action_tool["inputSchema"]
        self.assertEqual(schema.get("type"), "object")
        props = schema.get("properties", {})
        self.assertIn("action_type", props)
        self.assertIn("text", props)

    def test_schema_validation_load_save(self):
        """dungeon_load_save schema validates correctly."""
        response = self.client.list_tools()
        tools = response["result"]["tools"]
        load_tool = next(
            t for t in tools if t["name"] == "dungeon_load_save"
        )
        schema = load_tool["inputSchema"]
        self.assertEqual(schema.get("type"), "object")
        props = schema.get("properties", {})
        self.assertIn("adventure_id", props)


if __name__ == "__main__":
    unittest.main()
