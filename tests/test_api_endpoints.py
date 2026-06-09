import os
import sys
import json
import unittest

# Add root folder to path
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

# Set mock env prior to importing web.server
os.environ["MOCK_LLM"] = "1"

from web.server import app

class TestApiEndpoints(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        
    def tearDown(self):
        from web.server import engine
        import glob
        for filepath in glob.glob(os.path.join(engine.save_dir, "*.json")):
            if not filepath.endswith("test-adv.json"):
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
        
    def test_init_and_state_api(self):
        """Verify initialization and state sync updates values correctly."""
        payload = {
            "preset_idx": 2, # Star Wars (indexed at 2 in STORY_PRESETS)
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
        self.assertIn('"type": "chunk"', stream_data)
        
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
        self.assertFalse(data["cards"][0]["active"])
        
        # 3. Delete card
        res = self.app.post("/api/lore", json={"action": "delete", "index": 0})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(len(data["cards"]), 0)

if __name__ == "__main__":
    unittest.main()
