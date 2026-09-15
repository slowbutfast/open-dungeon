"""
Tests for the spatial map MCP tools (spatial-map-region-graph, 6.2):
- dungeon_inspect_map: Rooms, edges, current room id, region groupings
- dungeon_inspect_room: Room detail with outgoing/incoming edges and last visit

Both read through the shared freshness path, so results reflect committed turns.
"""
import os
import sys
import json
import unittest
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result

pytestmark = pytest.mark.integration


def _json(response):
    result = assert_tool_result(response)
    return json.loads(result["content"][0].get("text", ""))


class TestMcpSpatialMap(McpTestCase):
    """Tests for dungeon_inspect_map and dungeon_inspect_room."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Spatial Map Test")

    def test_inspect_map_returns_rooms_edges_current_room_regions(self):
        """dungeon_inspect_map returns the full spatial shape."""
        self.client.send_action("go north")
        data = _json(self.client.call_tool("dungeon_inspect_map"))

        self.assertIn("rooms", data)
        self.assertIn("edges", data)
        self.assertIn("current_room_id", data)
        self.assertIn("regions", data)
        self.assertIsInstance(data["rooms"], list)
        self.assertIsInstance(data["edges"], list)

    def test_inspect_map_has_at_least_the_current_room_after_a_turn(self):
        """A committed turn establishes the current room node."""
        self.client.send_action("go north")
        data = _json(self.client.call_tool("dungeon_inspect_map"))

        self.assertGreaterEqual(len(data["rooms"]), 1)
        room_names = [r["name"].lower() for r in data["rooms"]]
        self.assertTrue(
            any("cantina" in name for name in room_names),
            f"the mock's Cantina room should be present, got rooms={data['rooms']}"
        )

    def test_inspect_map_current_room_agrees_with_state(self):
        """current_room_id stays consistent with dungeon_inspect_state."""
        self.client.send_action("look around")
        map_data = _json(self.client.call_tool("dungeon_inspect_map"))
        state_data = _json(self.client.call_tool("dungeon_inspect_state"))

        self.assertIn("current_room_id", state_data)
        self.assertEqual(map_data["current_room_id"], state_data["current_room_id"])
        self.assertIsNotNone(map_data["current_room_id"])

    def test_inspect_map_rooms_have_visit_counts(self):
        """Rooms expose canonical name + visit counts."""
        self.client.send_action("go north")
        data = _json(self.client.call_tool("dungeon_inspect_map"))

        for room in data["rooms"]:
            self.assertIn("id", room)
            self.assertIn("name", room)
            self.assertIn("visit_count", room)

    def test_inspect_room_returns_detail(self):
        """dungeon_inspect_room returns canonical name, edges, last visit."""
        self.client.send_action("go north")
        map_data = _json(self.client.call_tool("dungeon_inspect_map"))
        room_id = map_data["rooms"][0]["id"]

        room = _json(self.client.call_tool("dungeon_inspect_room", {"room_id": room_id}))

        self.assertEqual(room["id"], room_id)
        self.assertIn("name", room)
        self.assertIn("exits_out", room)
        self.assertIn("exits_in", room)
        self.assertIn("last_visit_turn", room)
        self.assertIsInstance(room["exits_out"], list)
        self.assertIsInstance(room["exits_in"], list)

    def test_inspect_room_unknown_id_errors(self):
        """An unknown room id reports an error rather than a crash."""
        response = self.client.call_tool("dungeon_inspect_room", {"room_id": "no-such-room"})
        self.assertTrue(response.get("result", {}).get("isError", False))

    # ─── dungeon_path_to (spatial-map-visualization-pathfinding, 1.4) ────────

    def test_path_to_returns_route_shape(self):
        """dungeon_path_to returns the ordered route payload shape."""
        self.client.send_action("go north")
        map_data = _json(self.client.call_tool("dungeon_inspect_map"))
        target = map_data["current_room_id"]

        data = _json(self.client.call_tool("dungeon_path_to", {"to": target}))

        for key in ("found", "from_room_id", "to_room_id", "step_count", "steps"):
            self.assertIn(key, data)
        self.assertTrue(data["found"])
        self.assertEqual(data["to_room_id"], target)
        self.assertIsInstance(data["steps"], list)

    def test_path_to_default_origin_is_current_room(self):
        """Omitting `from` routes from the current room."""
        self.client.send_action("go north")
        map_data = _json(self.client.call_tool("dungeon_inspect_map"))

        data = _json(self.client.call_tool("dungeon_path_to", {
            "to": map_data["current_room_id"]
        }))

        self.assertEqual(data["from_room_id"], map_data["current_room_id"])

    def test_path_to_unknown_room_errors(self):
        """An unknown target room reports an error naming the room."""
        response = self.client.call_tool("dungeon_path_to", {"to": "no-such-room"})
        self.assertTrue(response.get("result", {}).get("isError", False))
        text = response["result"]["content"][0].get("text", "")
        self.assertIn("no-such-room", text)

    def test_path_to_reads_through_committed_turn(self):
        """The tool reflects committed turns: a second room is routable back."""
        self.client.init_session(title="Path Freshness")
        self.client.send_action("go north")
        first_map = _json(self.client.call_tool("dungeon_inspect_map"))
        first_room = first_map["current_room_id"]

        self.client.send_action("go south")
        second_map = _json(self.client.call_tool("dungeon_inspect_map"))
        current = second_map["current_room_id"]
        self.assertNotEqual(current, first_room)

        data = _json(self.client.call_tool("dungeon_path_to", {"to": first_room}))

        self.assertTrue(data["found"], f"expected a route back to the first room, got {data}")
        self.assertEqual(data["from_room_id"], current)
        self.assertEqual(data["to_room_id"], first_room)
        self.assertGreaterEqual(data["step_count"], 1)
        self.assertTrue(
            any(step["inferred"] for step in data["steps"]),
            f"the return leg should lean on the inferred reverse edge, got {data['steps']}"
        )


if __name__ == "__main__":
    unittest.main()
