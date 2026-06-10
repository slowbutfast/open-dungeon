import os
import sys
import json
import unittest
import socket
import subprocess
import time
import requests

class HttpClientProxy:
    def __init__(self, base_url="http://127.0.0.1:5001"):
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

class TestApiEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 5001
        cls.proc = None
        
        # Check if port is already open
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            port_open = s.connect_ex(('127.0.0.1', cls.port)) == 0
            
        if not port_open:
            env = os.environ.copy()
            env["MOCK_LLM"] = "1"
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
                raise RuntimeError("Express server failed to start on port 5001")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                cls.proc.kill()

    def setUp(self):
        self.app = HttpClientProxy()
        
    def tearDown(self):
        import glob
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        save_dir = os.path.join(os.path.dirname(tests_dir), "game", "adventures")
        for filepath in glob.glob(os.path.join(save_dir, "*.json")):
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

if __name__ == "__main__":
    unittest.main()
