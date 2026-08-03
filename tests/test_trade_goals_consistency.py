"""
Tests for narrated trade/offer/goal extraction consistency:
- Narrated trades route through executeBarter: the sold item is released
  (status `traded`, excluded from inventory) and the received item is held.
- Re-trading a sold item is rejected (duplicate-sale regression).
- Offers and goals are created from narration, feeding the existing
  dungeon_inspect_offers / dungeon_execute_trade / dungeon_inspect_goals surface.
- A refused/ambiguous narrated trade logs a refusal and applies neither side.

Keeps the McpTestCase harness; undo/rollback/RAG cases live in Fork A's module.
"""
import os
import sys
import json
import unittest
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.mcp_client import McpTestCase, assert_tool_result

pytestmark = pytest.mark.integration


class TestNarratedTradeGoalsConsistency(McpTestCase):
    """Narrated trade/offer/goal extraction drives the barter engine."""

    def setUp(self):
        super().setUp()
        self.client.init_session(title="Narrated Trade/Goal Test")

    def _flush_inventory(self):
        """Force memory extraction, then read inventory."""
        resp = self.client.call_tool("dungeon_inspect_inventory")
        result = assert_tool_result(resp)
        return json.loads(result["content"][0].get("text", ""))

    def _offers(self):
        resp = self.client.call_tool("dungeon_inspect_offers")
        result = assert_tool_result(resp)
        return json.loads(result["content"][0].get("text", ""))

    def _goals(self):
        resp = self.client.call_tool("dungeon_inspect_goals")
        result = assert_tool_result(resp)
        return json.loads(result["content"][0].get("text", ""))

    def test_narrated_trade_releases_sold_item(self):
        """A narrated leaflet->gem trade releases the leaflet and holds the gem."""
        self.client.send_action("take the leaflet")
        inv = self._flush_inventory()
        leaflet = [i for i in inv if i["item_name"].lower() == "leaflet"]
        self.assertEqual(len(leaflet), 1)
        self.assertEqual(leaflet[0]["status"], "held")

        self.client.send_action("Korr says bring me the leaflet and I'll give you a gem")
        self._flush_inventory()

        self.client.send_action("trade the leaflet for a gem with Korr")
        inv = self._flush_inventory()

        held_names = [i["item_name"] for i in inv if i["status"] == "held"]
        self.assertNotIn("Leaflet", held_names)
        gem = [i for i in inv if i["item_name"].lower() == "gem"]
        self.assertEqual(len(gem), 1)
        self.assertEqual(gem[0]["status"], "held")

    def test_duplicate_sale_rejected(self):
        """Re-trading a sold item is refused; no duplicate acquisition."""
        self.client.send_action("take the leaflet")
        self._flush_inventory()
        self.client.send_action("Korr says bring me the leaflet and I'll give you a gem")
        self._flush_inventory()
        self.client.send_action("trade the leaflet for a gem with Korr")
        self._flush_inventory()

        self.client.send_action("trade the leaflet for a gem again")
        inv = self._flush_inventory()

        held_names = [i["item_name"] for i in inv if i["status"] == "held"]
        self.assertNotIn("Leaflet", held_names)
        gem = [i for i in inv if i["item_name"].lower() == "gem"]
        self.assertEqual(len(gem), 1)
        self.assertEqual(gem[0]["status"], "held")

    def test_narrated_offer_registered_and_executable(self):
        """A narrated offer appears in dungeon_inspect_offers and trades execute."""
        self.client.send_action("take the leaflet")
        self._flush_inventory()
        self.client.send_action("Korr says bring me the leaflet and I'll give you a gem")
        self._flush_inventory()

        offers = self._offers()
        offer = next((o for o in offers if o["trader_name"] == "Korr"), None)
        self.assertIsNotNone(offer, f"no offer from Korr in {offers}")
        self.assertEqual(offer["required_item"], "Leaflet")
        self.assertEqual(offer["offered_item"], "Gem")

        resp = self.client.call_tool("dungeon_execute_trade", {
            "trader_name": "Korr",
            "required_item": "Leaflet"
        })
        result = assert_tool_result(resp)
        data = json.loads(result["content"][0].get("text", ""))
        self.assertTrue(data["success"])

        inv = self._flush_inventory()
        held_names = [i["item_name"] for i in inv if i["status"] == "held"]
        self.assertNotIn("Leaflet", held_names)
        gem = [i for i in inv if i["item_name"].lower() == "gem"]
        self.assertEqual(len(gem), 1)

    def test_narrated_goal_created(self):
        """An NPC stating an objective creates a quest goal from narration."""
        self.client.send_action("Korr says find my daughter's locket and I'll reward you with a gem")
        self._flush_inventory()

        goals = self._goals()
        goal = next((g for g in goals if g["npc_name"] == "Korr"), None)
        self.assertIsNotNone(goal, f"no goal from Korr in {goals}")
        self.assertEqual(goal["goal_title"], "Find the locket")
        self.assertEqual(goal["required_item"], "Locket")
        self.assertEqual(goal["reward_item"], "Gem")

    def test_refused_trade_applies_neither_side(self):
        """A narrated trade the player can't fulfill logs a refusal and skips acquisition."""
        self.client.send_action("Korr says bring me the leaflet and I'll give you a gem")
        self._flush_inventory()

        # Bypass the pre-action barter gate with a 'story' action; the player
        # has no leaflet, so executeBarter's possession check must refuse.
        self.client.send_action(
            "Korr trades the leaflet to me for a gem",
            action_type="story"
        )
        inv = self._flush_inventory()

        held_names = [i["item_name"] for i in inv if i["status"] == "held"]
        self.assertNotIn("Gem", held_names)
        self.assertNotIn("Leaflet", held_names)


if __name__ == "__main__":
    unittest.main()
