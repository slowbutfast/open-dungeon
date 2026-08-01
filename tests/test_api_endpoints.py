import os
import sys
import json
import unittest
import socket
import subprocess
import time
import requests
import pytest
from tests.test_helpers import assert_save_dir_is_safe

pytestmark = pytest.mark.integration

class HttpClientProxy:
    def __init__(self, base_url="http://127.0.0.1:5004"):
        self.base_url = base_url
        
    def get(self, path):
        r = requests.get(f"{self.base_url}{path}")
        class ResponseWrapper:
            def __init__(self, r):
                self.status_code = r.status_code
                self.data = r.content
                self.mimetype = r.headers.get("Content-Type", "").split(";")[0]
        return ResponseWrapper(r)
 
    def put(self, path, json=None):
        if json is not None:
            r = requests.put(f"{self.base_url}{path}", json=json)
        else:
            r = requests.put(f"{self.base_url}{path}")
        class ResponseWrapper:
            def __init__(self, r):
                self.status_code = r.status_code
                self.data = r.content
                self.mimetype = r.headers.get("Content-Type", "").split(";")[0]
        return ResponseWrapper(r)
 
    def delete(self, path):
        r = requests.delete(f"{self.base_url}{path}")
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

class TestApiEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 5004
        cls.proc = None
        
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        cls.save_dir = os.path.join(tests_dir, "adventures_api_test")
        os.makedirs(cls.save_dir, exist_ok=True)
        os.environ["SAVE_DIR"] = cls.save_dir
        
        # Clean up any leftover presets.json from other test suites
        # (presets are stored in saveDir/../presets.json, which is tests/presets.json for all test suites)
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
            raise RuntimeError("Express server failed to start on port 5004")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                cls.proc.kill()
        # Safety guard: abort cleanup if save dir is outside tests/ directory
        assert_save_dir_is_safe(cls.save_dir)

        # Clean up isolated test save directory entirely
        import shutil
        if os.path.exists(cls.save_dir):
            try:
                shutil.rmtree(cls.save_dir)
            except OSError:
                pass
        time.sleep(0.5)

    def setUp(self):
        self.app = HttpClientProxy()
        
    def tearDown(self):
        assert_save_dir_is_safe(self.save_dir)
        import glob
        for filepath in glob.glob(os.path.join(self.save_dir, "*.json")):
            try:
                os.remove(filepath)
            except OSError:
                pass
        
    def test_get_presets(self):
        """Verify presets endpoint returns list of presets."""
        res = self.app.get("/api/presets")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertGreater(len(data), 0)
        self.assertEqual(data[0]["name"], "Lord of the Rings (Middle-earth Fantasy)")
        
    def test_preset_crud_endpoints(self):
        """Verify creating, updating, and deleting presets via POST, PUT, DELETE."""
        # 1. Create a new preset
        new_preset = {
            "name": "Test Preset",
            "title": "Test Adventure",
            "summary": "A test adventure for CRUD testing.",
            "system_prompt": "You are a test narrator.",
            "characters": [
                {"name": "Test Hero", "type": "Warrior", "desc": "A test hero.", "triggers": ["test", "hero"]}
            ]
        }
        res = self.app.post("/api/presets", json=new_preset)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn("status", data)
        self.assertEqual(data["status"], "success")

        # 2. Verify list includes the new preset at index 4
        res_list = self.app.get("/api/presets")
        self.assertEqual(res_list.status_code, 200)
        presets = json.loads(res_list.data)
        self.assertGreaterEqual(len(presets), 5)
        self.assertEqual(presets[4]["name"], "Test Preset")

        # 3. Update the preset at index 4
        updated_preset = {
            "name": "Updated Test Preset",
            "title": "Updated Adventure",
            "summary": "An updated test adventure.",
            "system_prompt": "You are an updated test narrator.",
            "characters": [
                {"name": "Updated Hero", "type": "Mage", "desc": "An updated hero.", "triggers": ["updated", "hero"]}
            ]
        }
        res_update = self.app.put("/api/presets/4", json=updated_preset)
        self.assertEqual(res_update.status_code, 200)
        data_update = json.loads(res_update.data)
        self.assertEqual(data_update["status"], "success")
        self.assertEqual(data_update["preset"]["name"], "Updated Test Preset")

        # 4. Verify list reflects the update
        res_list2 = self.app.get("/api/presets")
        self.assertEqual(res_list2.status_code, 200)
        presets2 = json.loads(res_list2.data)
        self.assertEqual(presets2[4]["name"], "Updated Test Preset")

        # 5. Delete the preset at index 4
        res_del = self.app.delete("/api/presets/4")
        self.assertEqual(res_del.status_code, 200)
        data_del = json.loads(res_del.data)
        self.assertEqual(data_del["status"], "success")

        # 6. Verify list no longer has the deleted preset and count is back to 4
        res_list3 = self.app.get("/api/presets")
        self.assertEqual(res_list3.status_code, 200)
        presets3 = json.loads(res_list3.data)
        self.assertEqual(len(presets3), 4)

    def test_init_and_state_api(self):
        """Verify initialization and state sync updates values correctly."""
        payload = {
            "preset_idx": 3, # Star Wars Outer Rim (indexed at 3 in STORY_PRESETS)
            "character": {
                "name": "Jaxen",
                "type": "Jedi",
                "desc": "A padawan",
                "triggers": "jaxen, jedi"
            }
        }
        res = self.app.post("/api/init", json=payload)
        self.assertEqual(res.status_code, 200)
        init_data = json.loads(res.data)
        self.assertEqual(init_data["status"], "success")
        self.assertIsNotNone(init_data["adventure_id"])
        
        # Verify state endpoint returns this new initialized state
        res_state = self.app.get("/api/state")
        self.assertEqual(res_state.status_code, 200)
        state_data = json.loads(res_state.data)
        self.assertEqual(state_data["title"], "Star Wars: The Outer Rim")
        self.assertEqual(state_data["location"], "Starting Location")
        self.assertGreater(len(state_data["history"]), 0)
        
    def test_action_event_stream(self):
        """Verify /api/action returns text/event-stream chunks for gameplay turns."""
        # First initialize
        self.app.post("/api/init", json={"preset_idx": 0})
        
        # Run action
        payload = {"action_type": "do", "text": "go north"}
        res = self.app.post("/api/action", json=payload)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, "text/event-stream")
        
        # Check stream output contains expected chunk data
        stream_data = res.data.decode("utf-8")
        self.assertIn("data: ", stream_data)
        self.assertTrue('"type": "chunk"' in stream_data or '"type":"chunk"' in stream_data)
        
    def test_update_system_prompt_api(self):
        """Verify system prompt updating works."""
        self.app.post("/api/init", json={"preset_idx": 0})
        
        res = self.app.post("/api/system", json={"system_prompt": "Custom Narrator Prompt"})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data["status"], "success")
        
        # Verify state
        res_state = self.app.get("/api/state")
        state_data = json.loads(res_state.data)
        self.assertEqual(state_data["system_prompt"], "Custom Narrator Prompt")
        
    def test_update_summary_api(self):
        """Verify summary memory updating works."""
        self.app.post("/api/init", json={"preset_idx": 0})
        
        res = self.app.post("/api/summary", json={"summary": "Custom Adventure Memory"})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data["status"], "success")
        
        # Verify state
        res_state = self.app.get("/api/state")
        state_data = json.loads(res_state.data)
        self.assertEqual(state_data["summary"], "Custom Adventure Memory")
        
    def test_lore_modifications_api(self):
        """Verify adding, updating, and deleting lore cards via API."""
        self.app.post("/api/init", json={"preset_idx": 0})
        
        # 1. Add card
        card_payload = {
            "action": "add",
            "card": {
                "name": "Magic Ring",
                "type": "item",
                "description": "An invisible ring.",
                "triggers": "ring, magic ring"
            }
        }
        res = self.app.post("/api/lore", json=card_payload)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(len(data["cards"]), 1)
        self.assertEqual(data["cards"][0]["name"], "Magic Ring")
        self.assertEqual(data["cards"][0]["triggers"], ["ring", "magic ring"])
        
        # 2. Toggle card
        res = self.app.post("/api/lore", json={"action": "toggle", "index": 0})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertFalse(data["cards"][0]["enabled"])
        
        # 3. Delete card
        res = self.app.post("/api/lore", json={"action": "delete", "index": 0})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(len(data["cards"]), 0)

    # ─── Pre-Action Gating Tests ─────────────────────────────────────────────

    def _assert_rejection_in_stream(self, stream_data, test_name):
        """Check that the SSE stream contains a rejection message."""
        self.assertIn("data: ", stream_data)
        has_rejection = (
            "You don't have that item" in stream_data
        )
        self.assertTrue(has_rejection,
                        f"Expected pre-action gating rejection in {test_name}")

    def _assert_llm_was_called(self, stream_data):
        """Check that the SSE stream contains narrative chunks (LLM was called)."""
        self.assertIn("chunk", stream_data)

    def test_pre_action_gating_use_nonexistent_item(self):
        """Verify using an item not in inventory is rejected locally ($0 LLM cost)."""
        self.app.post("/api/init", json={"preset_idx": 0})
        payload = {"action_type": "do", "text": "use magic potion"}
        res = self.app.post("/api/action", json=payload)
        self.assertEqual(res.status_code, 200)
        self._assert_rejection_in_stream(res.data.decode("utf-8"), "use item")

    def test_pre_action_gating_trade_nonexistent_item(self):
        """Verify trading an item not in inventory is rejected locally."""
        self.app.post("/api/init", json={"preset_idx": 0})
        payload = {"action_type": "do", "text": "trade silver ring to merchant"}
        res = self.app.post("/api/action", json=payload)
        self.assertEqual(res.status_code, 200)
        self._assert_rejection_in_stream(res.data.decode("utf-8"), "trade item")

    def test_pre_action_gating_drop_nonexistent_item(self):
        """Verify dropping an item not in inventory is rejected locally."""
        self.app.post("/api/init", json={"preset_idx": 0})
        payload = {"action_type": "do", "text": "drop nonexistent shield"}
        res = self.app.post("/api/action", json=payload)
        self.assertEqual(res.status_code, 200)
        self._assert_rejection_in_stream(res.data.decode("utf-8"), "drop item")

    def test_pre_action_gating_allows_held_item(self):
        """Verify using an item that IS in inventory proceeds to LLM."""
        self.app.post("/api/init", json={"preset_idx": 0})

        # Add a held item to inventory
        self.app.post("/api/memory/inventory/add", json={
            "item_name": "Magic Potion",
            "item_type": "potion",
            "description": "A glowing potion.",
            "quantity": 1,
            "status": "held"
        })

        # Now try to use the item - should go to LLM
        payload = {"action_type": "do", "text": "use magic potion"}
        res = self.app.post("/api/action", json=payload)
        self.assertEqual(res.status_code, 200)

        stream_data = res.data.decode("utf-8")
        # Should contain narrative chunks (LLM was called)
        self.assertIn("chunk", stream_data)

    def test_pre_action_gating_skip_non_item_actions(self):
        """Verify non-item actions like 'look around' are not gated."""
        self.app.post("/api/init", json={"preset_idx": 0})

        # Simple movement action - should NOT be gated
        payload = {"action_type": "do", "text": "look around"}
        res = self.app.post("/api/action", json=payload)
        self.assertEqual(res.status_code, 200)

        stream_data = res.data.decode("utf-8")
        # Should contain narrative chunks (LLM was called)
        self.assertIn("chunk", stream_data)
        # Should NOT contain rejection
        self.assertNotIn("don't have that item", stream_data.lower())

    def test_pre_action_gating_case_insensitive_match(self):
        """Verify case-insensitive matching allows using an item regardless of capitalization."""
        self.app.post("/api/init", json={"preset_idx": 0})

        self.app.post("/api/memory/inventory/add", json={
            "item_name": "Silver Ring",
            "item_type": "jewelry",
            "description": "A shiny silver ring.",
            "quantity": 1,
            "status": "held"
        })

        # Try using with different capitalization
        payload = {"action_type": "do", "text": "trade SILVER RING to merchant"}
        res = self.app.post("/api/action", json=payload)
        self.assertEqual(res.status_code, 200)

        stream_data = res.data.decode("utf-8")
        self.assertIn("chunk", stream_data)
        self.assertNotIn("don't have that item", stream_data.lower())


class TestBarterApiEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 5004
        cls.proc = None
        
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        cls.save_dir = os.path.join(tests_dir, "adventures_api_test")
        os.makedirs(cls.save_dir, exist_ok=True)
        os.environ["SAVE_DIR"] = cls.save_dir
        
        presets_file = os.path.join(tests_dir, "presets.json")
        if os.path.exists(presets_file):
            os.remove(presets_file)
        
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
            raise RuntimeError("Express server failed to start on port 5004")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                cls.proc.kill()
        assert_save_dir_is_safe(cls.save_dir)
        import shutil
        if os.path.exists(cls.save_dir):
            try:
                shutil.rmtree(cls.save_dir)
            except OSError:
                pass
        time.sleep(0.5)

    def setUp(self):
        self.app = HttpClientProxy()

    def test_trade_endpoint_returns_sse_stream_on_valid_trade(self):
        """Verify POST /api/trade returns SSE stream with system event on valid trade."""
        self.app.post("/api/init", json={"preset_idx": 0})
        # Add item to inventory
        self.app.post("/api/memory/inventory/add", json={
            "item_name": "Silver Ring",
            "item_type": "jewelry",
            "description": "A shiny ring.",
            "quantity": 1,
            "status": "held"
        })
        # Register a barter offer
        self.app.post("/api/trade/offer", json={
            "trader_name": "Merchant",
            "required_item": "Silver Ring",
            "offered_item": "Steel Sword"
        })
        # Execute trade via SSE endpoint
        res = self.app.post("/api/trade", json={
            "trader_name": "Merchant",
            "required_item": "Silver Ring"
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, "text/event-stream")
        stream_data = res.data.decode("utf-8")
        self.assertIn("data: ", stream_data)
        self.assertTrue('"type": "chunk"' in stream_data or '"type":"chunk"' in stream_data)
        # Should contain system event about successful barter
        self.assertTrue("SYSTEM EVENT" in stream_data or "Barter successful" in stream_data or "system" in stream_data.lower())

    def test_trade_endpoint_rejects_unowned_item(self):
        """Verify POST /api/trade rejects trades for items not in inventory."""
        self.app.post("/api/init", json={"preset_idx": 0})
        self.app.post("/api/trade/offer", json={
            "trader_name": "Merchant",
            "required_item": "Diamond",
            "offered_item": "Gold Coin"
        })
        res = self.app.post("/api/trade", json={
            "trader_name": "Merchant",
            "required_item": "Diamond"
        })
        # If SSE stream, check for error; if JSON, check status
        self.assertEqual(res.status_code, 400)

    def test_goals_endpoint_lists_active_goals(self):
        """Verify GET /api/goals returns active quest goals."""
        self.app.post("/api/init", json={"preset_idx": 0})
        # Create a goal first
        self.app.post("/api/goals", json={
            "npc_name": "Elder",
            "goal_title": "Find the Lost Artifact",
            "required_item": "Lost Artifact",
            "reward_item": "Gold Crown"
        })
        res = self.app.get("/api/goals")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertGreaterEqual(len(data), 1)

    def test_goal_complete_endpoint_returns_sse_stream(self):
        """Verify POST /api/goals/complete returns SSE stream on completion."""
        self.app.post("/api/init", json={"preset_idx": 0})
        # Add required item
        self.app.post("/api/memory/inventory/add", json={
            "item_name": "Lost Artifact",
            "item_type": "artifact",
            "description": "An ancient artifact.",
            "quantity": 1,
            "status": "held"
        })
        # Create goal
        res = self.app.post("/api/goals", json={
            "npc_name": "Elder",
            "goal_title": "Find the Lost Artifact",
            "required_item": "Lost Artifact",
            "reward_item": "Gold Crown"
        })
        data = json.loads(res.data)
        goal_id = data["goal"]["id"]
        # Complete goal
        res = self.app.post("/api/goals/complete", json={"goal_id": goal_id})
        self.assertEqual(res.status_code, 200)
        # Should return SSE stream
        self.assertEqual(res.mimetype, "text/event-stream")
        stream_data = res.data.decode("utf-8")
        self.assertIn("data: ", stream_data)

    def test_text_command_trade_with_held_item_proceeds(self):
        """Verify typing a trade command with a held item proceeds to LLM narration."""
        self.app.post("/api/init", json={"preset_idx": 0})
        
        self.app.post("/api/memory/inventory/add", json={
            "item_name": "Silver Ring",
            "item_type": "jewelry",
            "description": "A shiny ring.",
            "quantity": 1,
            "status": "held"
        })
        
        res = self.app.post("/api/action", json={
            "action_type": "do",
            "text": "trade Silver Ring to Merchant"
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, "text/event-stream")
        
        raw = res.data.decode('utf-8') if isinstance(res.data, bytes) else res.data
        self.assertNotIn("don't have", raw.lower())
        self.assertIn("chunk", raw)


if __name__ == "__main__":
    unittest.main()
