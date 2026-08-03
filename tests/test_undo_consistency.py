"""
Tests for transactional undo consistency:

- dungeon_undo_action removes event/inventory store rows for the reverted turn
- last_extracted_turn_index (watermark) is rewound to the new history end
- moves is decremented to the pre-undo value
- dungeon_search_memories (RAG) does not recall the undone turn
- a pending/in-flight flush cannot resurrect rolled-back rows
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


class TestUndoConsistency(McpTestCase):
    """Transactional undo across history, structured store, vector index, and watermark."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Undo Consistency Test")

    def test_undo_removes_event_rows_for_reverted_turn(self):
        """After a turn that produced an event, undo leaves no event for that turn."""
        self.client.send_action("take the iron key")
        events_before = _json(self.client.call_tool("dungeon_inspect_events"))
        self.assertTrue(
            any("iron key" in (e.get("summary") or "").lower() for e in events_before),
            "expected an iron-key event to be extracted before undo"
        )

        undo = _json(self.client.call_tool("dungeon_undo_action"))
        self.assertTrue(undo["success"])

        events_after = _json(self.client.call_tool("dungeon_inspect_events"))
        self.assertFalse(
            any("iron key" in (e.get("summary") or "").lower() for e in events_after),
            "undo left an event for the reverted turn"
        )

    def test_undo_rolls_back_inventory_acquired_on_reverted_turn(self):
        """Items acquired on the undone turn are no longer held."""
        self.client.send_action("take the iron key")
        inv_before = _json(self.client.call_tool("dungeon_inspect_inventory"))
        self.assertTrue(
            any("iron key" in (i.get("item_name") or "").lower() for i in inv_before),
            "expected the iron key to be held before undo"
        )

        self.client.call_tool("dungeon_undo_action")

        inv_after = _json(self.client.call_tool("dungeon_inspect_inventory"))
        self.assertFalse(
            any("iron key" in (i.get("item_name") or "").lower() for i in inv_after),
            "undo left the item acquired on the reverted turn"
        )

    def test_undo_decrements_moves_to_pre_undo_value(self):
        """Moves is decremented by one per undone turn."""
        self.client.send_action("look around")
        state_before = _json(self.client.call_tool("dungeon_inspect_state"))
        self.assertEqual(state_before["moves"], 1)

        undo = _json(self.client.call_tool("dungeon_undo_action"))
        self.assertTrue(undo["success"])
        self.assertEqual(undo["moves"], 0)

        state_after = _json(self.client.call_tool("dungeon_inspect_state"))
        self.assertEqual(state_after["moves"], 0)

    def test_undo_rewinds_watermark_within_history_length(self):
        """last_extracted_turn_index must not exceed the committed history after undo."""
        self.client.send_action("take the iron key")
        self.client.send_action("look around")
        self.client.call_tool("dungeon_inspect_events")  # force flush

        self.client.call_tool("dungeon_undo_action")

        stats = _json(self.client.call_tool("dungeon_inspect_stats"))
        state = _json(self.client.call_tool("dungeon_inspect_state"))
        history = _json(self.client.call_tool("dungeon_inspect_history"))

        self.assertLessEqual(
            stats["last_extracted_turn_index"],
            len(history) // 2 + 1
        )
        self.assertLessEqual(stats["last_extracted_turn_index"], state["moves"])

    def test_undo_keeps_prior_events_after_rewind(self):
        """Undoing a later turn keeps events from earlier turns."""
        self.client.send_action("find the rusty sword")
        self.client.call_tool("dungeon_inspect_events")  # flush turn 1
        self.client.send_action("take the iron key")
        self.client.call_tool("dungeon_inspect_events")  # flush turn 2

        self.client.call_tool("dungeon_undo_action")

        events = _json(self.client.call_tool("dungeon_inspect_events"))
        summaries = [(e.get("summary") or "").lower() for e in events]
        self.assertTrue(
            any("sword" in s for s in summaries),
            "prior turn's event should survive the undo"
        )
        self.assertFalse(
            any("iron key" in s for s in summaries),
            "undone turn's event should be removed"
        )

    def test_undo_search_memories_does_not_recall_undone_turn(self):
        """RAG recall no longer returns the undone turn after undo."""
        self.client.send_action("find the rusty sword")
        self.client.call_tool("dungeon_inspect_events")
        self.client.send_action("take the iron key")
        self.client.call_tool("dungeon_inspect_events")

        recalled_before = _json(
            self.client.call_tool("dungeon_search_memories", {"query": "iron key"})
        )
        self.assertTrue(
            any("iron key" in (m.get("text") or "").lower() for m in recalled_before),
            "expected the undone turn to be recallable before undo"
        )

        self.client.call_tool("dungeon_undo_action")

        recalled_after = _json(
            self.client.call_tool("dungeon_search_memories", {"query": "iron key"})
        )
        self.assertFalse(
            any("iron key" in (m.get("text") or "").lower() for m in recalled_after),
            "RAG still recalls the undone turn"
        )

    def test_undo_pending_flush_does_not_resurrect_rows(self):
        """Undo right after an action (before any forced flush) drops the buffered
        turn and no later flush re-extracts it."""
        self.client.send_action("take the iron key")

        undo = _json(self.client.call_tool("dungeon_undo_action"))
        self.assertTrue(undo["success"])

        events = _json(self.client.call_tool("dungeon_inspect_events"))
        self.assertFalse(
            any("iron key" in (e.get("summary") or "").lower() for e in events),
            "a deferred flush resurrected the rolled-back turn's event"
        )

        inv = _json(self.client.call_tool("dungeon_inspect_inventory"))
        self.assertFalse(
            any("iron key" in (i.get("item_name") or "").lower() for i in inv),
            "a deferred flush resurrected the rolled-back turn's inventory row"
        )

        stats = _json(self.client.call_tool("dungeon_inspect_stats"))
        self.assertEqual(stats["last_extracted_turn_index"], 0)


if __name__ == "__main__":
    unittest.main()
