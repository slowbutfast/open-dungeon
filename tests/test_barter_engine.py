import os
import sys
import json
import unittest
import socket
import subprocess
import time
import requests
import shutil
import pytest
from tests.test_helpers import assert_save_dir_is_safe

pytestmark = pytest.mark.unit

class HttpClientProxy:
    def __init__(self, base_url="http://127.0.0.1:5005"):
        self.base_url = base_url
        
    def get(self, path):
        r = requests.get(f"{self.base_url}{path}")
        class ResponseWrapper:
            def __init__(self, r):
                self.status_code = r.status_code
                self.data = r.content
                self.mimetype = r.headers.get("Content-Type", "").split(";")[0]
        return ResponseWrapper(r)
 
    def post(self, path, json=None, data=None):
        if json is not None:
            r = requests.post(f"{self.base_url}{path}", json=json)
        elif data is not None:
            r = requests.post(f"{self.base_url}{path}", data=data)
        else:
            r = requests.post(f"{self.base_url}{path}")
            
        class ResponseWrapper:
            def __init__(self, r):
                self.status_code = r.status_code
                self.data = r.content
                self.mimetype = r.headers.get("Content-Type", "").split(";")[0]
        return ResponseWrapper(r)


class TestBarterTradeExecution(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 5005
        cls.proc = None
        
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        cls.save_dir = os.path.join(tests_dir, "adventures_barter_test")
        os.makedirs(cls.save_dir, exist_ok=True)
        os.environ["SAVE_DIR"] = cls.save_dir
        
        # Clean up any leftover presets.json
        presets_file = os.path.join(tests_dir, "presets.json")
        if os.path.exists(presets_file):
            os.remove(presets_file)
        
        # Check if port is already open
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            port_open = s.connect_ex(('127.0.0.1', cls.port)) == 0

        if port_open:
            raise RuntimeError(
                f"Port {cls.port} is already in use — please stop your server before running tests."
            )

        env = os.environ.copy()
        env["MOCK_LLM"] = "1"
        env["PORT"] = str(cls.port)
        cls.proc = subprocess.Popen(
            ["node", "web/server.js"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env
        )
        # Wait for the server to spin up
        for _ in range(50):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(('127.0.0.1', cls.port)) == 0:
                    break
            time.sleep(0.1)
        else:
            raise RuntimeError("Express server failed to start on port 5005")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                cls.proc.kill()
        # Safety guard
        assert_save_dir_is_safe(cls.save_dir)
        if os.path.exists(cls.save_dir):
            try:
                shutil.rmtree(cls.save_dir)
            except OSError:
                pass
        time.sleep(0.5)

    def setUp(self):
        self.app = HttpClientProxy(base_url=f"http://127.0.0.1:{self.port}")
        # Initialize a fresh adventure
        res = self.app.post("/api/init", json={"preset_idx": 0})
        self.assertEqual(res.status_code, 200)
        self.init_data = json.loads(res.data)
        self.adventure_id = self.init_data["adventure_id"]

    def tearDown(self):
        assert_save_dir_is_safe(self.save_dir)
        import glob
        for filepath in glob.glob(os.path.join(self.save_dir, "*.json")):
            try:
                os.remove(filepath)
            except OSError:
                pass

    def _add_item_to_inventory(self, item_name, item_type="misc", description="", quantity=1, status="held"):
        """Helper to add an item to inventory via API."""
        return self.app.post("/api/memory/inventory/add", json={
            "item_name": item_name,
            "item_type": item_type,
            "description": description,
            "quantity": quantity,
            "status": status
        })

    def _get_inventory(self):
        """Get current inventory."""
        res = self.app.get("/api/memory/inventory")
        self.assertEqual(res.status_code, 200)
        return json.loads(res.data)

    def test_barter_contract_creation(self):
        """Verify that registering a barter offer creates a contract and returns it."""
        res = self.app.post("/api/trade/offer", json={
            "trader_name": "Merchant",
            "required_item": "Silver Ring",
            "offered_item": "Steel Sword",
            "description": "A fair trade."
        })
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("offer", data)
        self.assertEqual(data["offer"]["trader_name"], "Merchant")
        self.assertEqual(data["offer"]["required_item"], "Silver Ring")
        self.assertEqual(data["offer"]["offered_item"], "Steel Sword")

    def test_barter_offers_listing(self):
        """Verify that registered offers can be listed for a trader."""
        # Register an offer first
        self.app.post("/api/trade/offer", json={
            "trader_name": "Merchant",
            "required_item": "Silver Ring",
            "offered_item": "Steel Sword"
        })
        # List offers for the trader
        res = self.app.get("/api/trade/offers?trader=Merchant")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertGreaterEqual(len(data), 1)
        self.assertEqual(data[0]["required_item"], "Silver Ring")

    def test_valid_trade_atomic_swap(self):
        """Verify a valid trade atomically swaps required item for offered item."""
        # Add the required item to inventory
        self._add_item_to_inventory("Silver Ring", "jewelry", "A shiny silver ring.")
        
        # Register a barter offer
        self.app.post("/api/trade/offer", json={
            "trader_name": "Merchant",
            "required_item": "Silver Ring",
            "offered_item": "Steel Sword",
            "description": "A fair trade."
        })
        
        # Execute the trade (SSE stream)
        res = self.app.post("/api/trade", json={
            "trader_name": "Merchant",
            "required_item": "Silver Ring"
        })
        self.assertEqual(res.status_code, 200)
        
        # Verify the required item is no longer in inventory (status changed)
        inv = self._get_inventory()
        ring_items = [i for i in inv if i["item_name"] == "Silver Ring"]
        self.assertEqual(len(ring_items), 0)
        
        # Verify the offered item is now in inventory
        sword_items = [i for i in inv if i["item_name"] == "Steel Sword"]
        self.assertEqual(len(sword_items), 1)
        self.assertEqual(sword_items[0]["status"], "held")

    def test_unowned_item_rejection(self):
        """Verify trading an item not in inventory is rejected."""
        # Register a barter offer
        self.app.post("/api/trade/offer", json={
            "trader_name": "Merchant",
            "required_item": "Diamond",
            "offered_item": "Gold Coin"
        })
        
        # Try to execute the trade without having the required item
        res = self.app.post("/api/trade", json={
            "trader_name": "Merchant",
            "required_item": "Diamond"
        })
        self.assertEqual(res.status_code, 400)
        data = json.loads(res.data)
        self.assertIn("error", data)
        self.assertTrue("don't have" in data["error"].lower() or "not found" in data["error"].lower() or "unowned" in data["error"].lower())

    def test_partial_quantity_trade(self):
        """Verify trading with quantity > 1 deducts correct amount."""
        # Add 3 silver rings to inventory
        self._add_item_to_inventory("Silver Ring", "jewelry", "A shiny silver ring.", quantity=3)
        
        # Register a barter offer for 1 ring
        self.app.post("/api/trade/offer", json={
            "trader_name": "Merchant",
            "required_item": "Silver Ring",
            "offered_item": "Steel Sword"
        })
        
        # Execute the trade
        res = self.app.post("/api/trade", json={
            "trader_name": "Merchant",
            "required_item": "Silver Ring"
        })
        self.assertEqual(res.status_code, 200)
        
        # Verify we still have the remaining rings
        inv = self._get_inventory()
        ring_items = [i for i in inv if i["item_name"] == "Silver Ring"]
        self.assertGreaterEqual(len(ring_items), 1)
        # Should have 2 remaining
        total_qty = sum(i["quantity"] for i in ring_items)
        self.assertEqual(total_qty, 2)

    def test_multi_match_ambiguity_rejection(self):
        """Verify typing 'trade ring' with multiple ring matches returns ambiguity error."""
        self._add_item_to_inventory("Silver Ring", "jewelry", "A shiny silver ring.")
        self._add_item_to_inventory("Gold Ring", "jewelry", "A golden ring.")
        
        res = self.app.post("/api/action", json={
            "action_type": "do",
            "text": "trade ring to Merchant"
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, "text/event-stream")
        
        raw = res.data.decode('utf-8') if isinstance(res.data, bytes) else res.data
        self.assertIn("Which item did you mean", raw)

    def test_undo_after_trade_restores_inventory(self):
        """Undoing a narrated trade restores the sold item and removes the acquired one.

        This is the MCP/HTTP surface of spec D5 (group 7): undo of a trade must
        revert the sold item's status mutation (no traded/dropped limbo) and
        drop the acquired row. The mock extractor keys item triggers on the
        LATEST buffered player turn, so each turn is flushed before the next
        action (via _get_inventory) to keep the acquisition and the trade on
        their own extraction turns.
        """
        # Narrated acquisition of the leaflet (turn 1).
        self.app.post("/api/action", json={"action_type": "do", "text": "take the leaflet"})
        inv = self._get_inventory()  # force flush -> leaflet held
        leaflet_items = [i for i in inv if i["item_name"] == "Leaflet"]
        self.assertEqual(len(leaflet_items), 1)

        # Narrated trade (turn 2): the leaflet leaves inventory, the gem arrives.
        self.app.post("/api/action", json={"action_type": "do", "text": "trade the leaflet for a gem"})
        inv = self._get_inventory()  # force flush -> leaflet traded, gem held
        gem_items = [i for i in inv if i["item_name"] == "Gem"]
        self.assertEqual(len(gem_items), 1)
        self.assertFalse(any(i["item_name"] == "Leaflet" for i in inv), "leaflet is not held after the trade")

        # Undo the trade turn.
        res = self.app.post("/api/action", json={"action_type": "undo"})
        self.assertEqual(res.status_code, 200)

        # The sold item is restored to held; the acquired item is removed.
        inv = self._get_inventory()
        leaflet_items = [i for i in inv if i["item_name"] == "Leaflet"]
        gem_items = [i for i in inv if i["item_name"] == "Gem"]
        self.assertEqual(len(leaflet_items), 1, "undo restores the sold item")
        self.assertEqual(leaflet_items[0]["status"], "held", "the sold item is not stranded in traded/dropped limbo")
        self.assertEqual(len(gem_items), 0, "undo removes the acquired item")


class TestNpcQuestGoalStateMachine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 5005
        cls.proc = None
        
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        cls.save_dir = os.path.join(tests_dir, "adventures_barter_test")
        os.makedirs(cls.save_dir, exist_ok=True)
        os.environ["SAVE_DIR"] = cls.save_dir
        
        # Check if port is already open
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            port_open = s.connect_ex(('127.0.0.1', cls.port)) == 0

        if port_open:
            raise RuntimeError(
                f"Port {cls.port} is already in use — please stop your server before running tests."
            )

        env = os.environ.copy()
        env["MOCK_LLM"] = "1"
        env["PORT"] = str(cls.port)
        cls.proc = subprocess.Popen(
            ["node", "web/server.js"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env
        )
        for _ in range(50):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(('127.0.0.1', cls.port)) == 0:
                    break
            time.sleep(0.1)
        else:
            raise RuntimeError("Express server failed to start on port 5005")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                cls.proc.kill()
        assert_save_dir_is_safe(cls.save_dir)
        if os.path.exists(cls.save_dir):
            try:
                shutil.rmtree(cls.save_dir)
            except OSError:
                pass
        time.sleep(0.5)

    def setUp(self):
        self.app = HttpClientProxy(base_url=f"http://127.0.0.1:{self.port}")
        res = self.app.post("/api/init", json={"preset_idx": 0})
        self.assertEqual(res.status_code, 200)
        self.init_data = json.loads(res.data)

    def tearDown(self):
        assert_save_dir_is_safe(self.save_dir)
        import glob
        for filepath in glob.glob(os.path.join(self.save_dir, "*.json")):
            try:
                os.remove(filepath)
            except OSError:
                pass

    def _add_item_to_inventory(self, item_name, item_type="misc", description="", quantity=1, status="held"):
        return self.app.post("/api/memory/inventory/add", json={
            "item_name": item_name,
            "item_type": item_type,
            "description": description,
            "quantity": quantity,
            "status": status
        })

    def test_goal_creation(self):
        """Verify creating a quest goal returns it with NOT_STARTED status."""
        res = self.app.post("/api/goals", json={
            "npc_name": "Elder",
            "goal_title": "Retrieve the Ancient Relic",
            "required_item": "Ancient Relic",
            "reward_item": "Golden Amulet"
        })
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("goal", data)
        self.assertEqual(data["goal"]["npc_name"], "Elder")
        self.assertEqual(data["goal"]["goal_title"], "Retrieve the Ancient Relic")
        self.assertEqual(data["goal"]["status"], "NOT_STARTED")

    def _parse_sse_data(self, raw_data):
        """Extract and return the last data JSON object from an SSE stream."""
        import re
        # Find all data: lines
        matches = re.findall(r'data: (.+)', raw_data.decode('utf-8') if isinstance(raw_data, bytes) else raw_data)
        for match in matches:
            try:
                parsed = json.loads(match)
                # Return the system event which contains the goal data
                if parsed.get('type') == 'system' and 'Goal' in parsed.get('content', ''):
                    return parsed
            except json.JSONDecodeError:
                continue
        return None

    def test_goal_state_transition_not_started_to_completed(self):
        """Verify completing a goal transitions status from NOT_STARTED to COMPLETED."""
        # Add the required item
        self._add_item_to_inventory("Ancient Relic", "artifact", "A mysterious ancient relic.")
        
        # Create a goal
        res = self.app.post("/api/goals", json={
            "npc_name": "Elder",
            "goal_title": "Retrieve the Ancient Relic",
            "required_item": "Ancient Relic",
            "reward_item": "Golden Amulet"
        })
        data = json.loads(res.data)
        goal_id = data["goal"]["id"]
        
        # Complete the goal (SSE stream)
        res = self.app.post("/api/goals/complete", json={"goal_id": goal_id})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, "text/event-stream")
        
        # Parse SSE data to find system event
        sse_data = self._parse_sse_data(res.data)
        self.assertIsNotNone(sse_data)
        self.assertIn("completed", sse_data.get("content", "").lower())
        
        # Verify reward item was granted
        inv_res = self.app.get("/api/memory/inventory")
        inv = json.loads(inv_res.data)
        reward_items = [i for i in inv if i["item_name"] == "Golden Amulet"]
        self.assertEqual(len(reward_items), 1)
        self.assertEqual(reward_items[0]["status"], "held")

    def test_goal_completion_unowned_item_rejected(self):
        """Verify completing a goal without the required item is rejected."""
        res = self.app.post("/api/goals", json={
            "npc_name": "Elder",
            "goal_title": "Retrieve the Lost Gem",
            "required_item": "Lost Gem",
            "reward_item": "Gold Coin"
        })
        data = json.loads(res.data)
        goal_id = data["goal"]["id"]
        
        # Try to complete the goal without having the item
        res = self.app.post("/api/goals/complete", json={"goal_id": goal_id})
        self.assertEqual(res.status_code, 400)
        data = json.loads(res.data)
        self.assertIn("error", data)

    def test_get_active_goals(self):
        """Verify listing active (non-completed) goals returns only pending goals."""
        # Create a goal
        self.app.post("/api/goals", json={
            "npc_name": "Elder",
            "goal_title": "Retrieve the Ancient Relic",
            "required_item": "Ancient Relic",
            "reward_item": "Golden Amulet"
        })
        
        # Get active goals
        res = self.app.get("/api/goals")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertGreaterEqual(len(data), 1)
        self.assertEqual(data[0]["status"], "NOT_STARTED")

    def test_goal_lifecycle_not_started_to_in_progress_to_completed(self):
        """Verify full goal lifecycle: create -> accept -> complete."""
        self._add_item_to_inventory("Ancient Relic", "artifact", "A mysterious ancient relic.")
        
        res = self.app.post("/api/goals", json={
            "npc_name": "Elder",
            "goal_title": "Retrieve the Ancient Relic",
            "required_item": "Ancient Relic",
            "reward_item": "Golden Amulet"
        })
        data = json.loads(res.data)
        goal_id = data["goal"]["id"]
        self.assertEqual(data["goal"]["status"], "NOT_STARTED")
        
        res = self.app.post("/api/goals/accept", json={"goal_id": goal_id})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data["goal"]["status"], "IN_PROGRESS")
        
        res = self.app.post("/api/goals/complete", json={"goal_id": goal_id})
        self.assertEqual(res.status_code, 200)
        
        inv_res = self.app.get("/api/memory/inventory")
        inv = json.loads(inv_res.data)
        reward_items = [i for i in inv if i["item_name"] == "Golden Amulet"]
        self.assertEqual(len(reward_items), 1)
        self.assertEqual(reward_items[0]["status"], "held")

    def test_goal_failure_from_in_progress(self):
        """Verify failing a goal from IN_PROGRESS transitions to FAILED."""
        res = self.app.post("/api/goals", json={
            "npc_name": "Elder",
            "goal_title": "Defeat the Dragon",
            "required_item": "Dragon Scale",
            "reward_item": "Gold Coin"
        })
        data = json.loads(res.data)
        goal_id = data["goal"]["id"]
        
        res = self.app.post("/api/goals/accept", json={"goal_id": goal_id})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data["goal"]["status"], "IN_PROGRESS")
        
        res = self.app.post("/api/goals/fail", json={"goal_id": goal_id})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data["goal"]["status"], "FAILED")
        
        res = self.app.get("/api/goals")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        active_ids = [g["id"] for g in data]
        self.assertNotIn(goal_id, active_ids)
        
        res = self.app.post("/api/goals/complete", json={"goal_id": goal_id})
        self.assertEqual(res.status_code, 400)


if __name__ == "__main__":
    unittest.main()
