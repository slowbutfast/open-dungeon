import os
import sys
import json
import unittest
import socket
import subprocess
import time
import requests
import glob
import shutil

class HttpClientProxy:
    def __init__(self, base_url="http://127.0.0.1:5001"):
        self.base_url = base_url
        
    def get(self, path):
        r = requests.get(f"{self.base_url}{path}")
        class ResponseWrapper:
            def __init__(self, r):
                self.status_code = r.status_code
                self.data = r.content
                self.headers = r.headers
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
                self.headers = r.headers
        return ResponseWrapper(r)

class TestMemoryFeatures(unittest.TestCase):
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
        # Clean up files before starting tests
        self._cleanup_data_files()
        
    def tearDown(self):
        self._cleanup_data_files()

    def _cleanup_data_files(self):
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(tests_dir)
        save_dir = os.path.join(project_root, "game", "adventures")
        data_dir = os.path.join(project_root, "game", "data")
        
        # Remove JSON saves except test-adv
        for filepath in glob.glob(os.path.join(save_dir, "*.json")):
            if not filepath.endswith("test-adv.json"):
                try:
                    os.remove(filepath)
                except OSError:
                    pass
                    
        # Remove data indexes and memory.db
        if os.path.exists(data_dir):
            try:
                shutil.rmtree(data_dir)
            except OSError:
                pass

    def test_memory_endpoints_empty_initially(self):
        """Verify memory endpoints return correct empty structures right after init."""
        # Initialize adventure
        payload = {"preset_idx": 0}
        res = self.app.post("/api/init", json=payload)
        self.assertEqual(res.status_code, 200)

        # Get inventory
        res = self.app.get("/api/memory/inventory")
        self.assertEqual(res.status_code, 200)
        items = json.loads(res.data)
        self.assertEqual(items, [])

        # Get events
        res = self.app.get("/api/memory/events")
        self.assertEqual(res.status_code, 200)
        events = json.loads(res.data)
        self.assertEqual(events, [])

        # Get stats
        res = self.app.get("/api/memory/stats")
        self.assertEqual(res.status_code, 200)
        stats = json.loads(res.data)
        self.assertEqual(stats["events"], 0)
        self.assertEqual(stats["inventory"], 0)
        self.assertEqual(stats["lore"], 0)
        self.assertEqual(stats["lastExtractedTurnIndex"], 0)

    def test_memory_batch_extraction(self):
        """Verify that playing 3 turns triggers async event extraction, inventory, and lore updates."""
        # Initialize adventure
        self.app.post("/api/init", json={"preset_idx": 0})

        # Send Turn 1 - contain "rusty sword" keyword to trigger mock items
        payload = {"action_type": "do", "text": "I search the room and take the rusty sword."}
        self.app.post("/api/action", json=payload)

        # Send Turn 2 - contain "iron key" keyword
        payload = {"action_type": "do", "text": "I find the iron key on the table."}
        self.app.post("/api/action", json=payload)

        # Send Turn 3 - contain "korr" keyword. This completes the 3-turn batch size.
        payload = {"action_type": "say", "text": "I talk to Korr the smuggler in the cantina."}
        self.app.post("/api/action", json=payload)

        # Wait a moment for background processing
        time.sleep(1.0)

        # 1. Verify inventory
        res = self.app.get("/api/memory/inventory")
        self.assertEqual(res.status_code, 200)
        inventory = json.loads(res.data)
        self.assertGreaterEqual(len(inventory), 2)
        names = [item["item_name"] for item in inventory]
        self.assertIn("Rusty Sword", names)
        self.assertIn("Iron Key", names)

        # 2. Verify events log
        res = self.app.get("/api/memory/events")
        self.assertEqual(res.status_code, 200)
        events = json.loads(res.data)
        self.assertGreaterEqual(len(events), 2)
        summaries = [e["summary"] for e in events]
        self.assertTrue(any("rusty" in s.lower() for s in summaries))
        self.assertTrue(any("key" in s.lower() for s in summaries))
        self.assertTrue(any("korr" in s.lower() for s in summaries))

        # 3. Verify stats
        res = self.app.get("/api/memory/stats")
        self.assertEqual(res.status_code, 200)
        stats = json.loads(res.data)
        self.assertGreater(stats["events"], 0)
        self.assertGreater(stats["inventory"], 0)
        self.assertGreater(stats["lore"], 0)
        self.assertEqual(stats["lastExtractedTurnIndex"], 4)

        # 4. Verify RAG search works
        search_payload = {"query": "Tell me about the smuggler Korr"}
        res = self.app.post("/api/memory/search", json=search_payload)
        self.assertEqual(res.status_code, 200)
        search_results = json.loads(res.data)
        self.assertGreater(len(search_results), 0)
        self.assertTrue(any("korr" in r["text"].lower() or "smuggler" in r["text"].lower() for r in search_results))

if __name__ == "__main__":
    unittest.main()
