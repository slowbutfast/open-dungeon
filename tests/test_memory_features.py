import os
import sys
import json
import unittest
import socket
import subprocess
import time
import requests
import shutil

class HttpClientProxy:
    def __init__(self, base_url="http://127.0.0.1:5002"):
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
        cls.port = 5002
        cls.proc = None
        
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        cls.save_dir = os.path.join(tests_dir, "adventures_memory_test")
        os.makedirs(cls.save_dir, exist_ok=True)
        os.environ["SAVE_DIR"] = cls.save_dir
        
        # Check if port is already open
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            port_open = s.connect_ex(('127.0.0.1', cls.port)) == 0
            
        if not port_open:
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
                raise RuntimeError("Express server failed to start on port 5001")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                cls.proc.kill()

        # Clean up isolated test save directory and any derived data artifacts
        if os.path.exists(cls.save_dir):
            shutil.rmtree(cls.save_dir, ignore_errors=True)

        # The engine derives dataDir from saveDir as saveDir/../data,
        # so for save_dir=tests/adventures_memory_test, data dir is tests/data/
        test_data_dir = os.path.join(os.path.dirname(cls.save_dir), "data")
        if os.path.exists(test_data_dir):
            shutil.rmtree(test_data_dir, ignore_errors=True)

        time.sleep(0.5)

    def setUp(self):
        self.app = HttpClientProxy()

    def tearDown(self):
        pass

    def test_memory_endpoints_empty_initially(self):
        """Verify memory endpoints return correct structures right after init with force-flush."""
        # Initialize adventure
        payload = {"preset_idx": 0}
        res = self.app.post("/api/init", json=payload)
        self.assertEqual(res.status_code, 200)

        # The initial turn pair (character description + opening scene) is now buffered.
        # Reading inventory/events/stats triggers a force-flush before querying.
        # The mock extractor may produce a default movement event from the initial turn
        # if no specific keywords match, but no inventory items should appear.

        # Get inventory - should remain empty (no items mentioned in initial turn texts)
        res = self.app.get("/api/memory/inventory")
        self.assertEqual(res.status_code, 200)
        items = json.loads(res.data)
        self.assertEqual(items, [])

        # Get events - may contain a default movement event from the initial turn extraction
        res = self.app.get("/api/memory/events")
        self.assertEqual(res.status_code, 200)
        events = json.loads(res.data)
        # Events may be non-empty due to force-flush of the initial turn

        # Get stats - lastExtractedTurnIndex should be > 0 after force-flush
        res = self.app.get("/api/memory/stats")
        self.assertEqual(res.status_code, 200)
        stats = json.loads(res.data)
        self.assertEqual(stats["inventory"], 0)
        # lastExtractedTurnIndex may be > 0 due to force-flush of initial turn

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

        # Wait for background processing to finish (up to 5 seconds)
        for _ in range(50):
            res = self.app.get("/api/memory/stats")
            if res.status_code == 200:
                stats = json.loads(res.data)
                if stats.get("lastExtractedTurnIndex", 0) > 0:
                    break
            time.sleep(0.1)

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

    def test_inventory_returns_items_after_first_move(self):
        """Querying the inventory API returns starting items right after the first move."""
        # Initialize adventure
        payload = {"preset_idx": 0}
        res = self.app.post("/api/init", json=payload)
        self.assertEqual(res.status_code, 200)

        # Send a single move that should produce items in the mock extractor
        payload = {"action_type": "do", "text": "I search the room and take the rusty sword."}
        res = self.app.post("/api/action", json=payload)
        self.assertEqual(res.status_code, 200)

        # After the first move, inventory should have starting items
        # (Will fail initially until force-flush is implemented)
        inventory = []
        for _ in range(50):
            res = self.app.get("/api/memory/inventory")
            if res.status_code == 200:
                inventory = json.loads(res.data)
                if len(inventory) > 0:
                    break
            time.sleep(0.1)

        self.assertGreater(len(inventory), 0)
        names = [item["item_name"] for item in inventory]
        self.assertIn("Rusty Sword", names)

    def test_memory_endpoints_trigger_force_flush(self):
        """Verify that /api/memory/stats and /api/memory/inventory trigger a force-flush of pending buffered turns."""
        # Initialize adventure
        payload = {"preset_idx": 0}
        res = self.app.post("/api/init", json=payload)
        self.assertEqual(res.status_code, 200)

        # Send a single move to buffer a turn (without reaching batch size of 3)
        payload = {"action_type": "do", "text": "I search the room and take the rusty sword."}
        res = self.app.post("/api/action", json=payload)
        self.assertEqual(res.status_code, 200)

        # Before the force flush, stats should show lastExtractedTurnIndex == 0 (nothing extracted yet)
        # After force-flush, lastExtractedTurnIndex should advance
        stats = {}
        for _ in range(50):
            res = self.app.get("/api/memory/stats")
            if res.status_code == 200:
                stats = json.loads(res.data)
                if stats.get("lastExtractedTurnIndex", 0) > 0:
                    break
            time.sleep(0.1)

        self.assertGreater(stats.get("lastExtractedTurnIndex", 0), 0,
            "GET /api/memory/stats should force-flush pending turns")

        # Also verify inventory returns items after the forced flush
        res = self.app.get("/api/memory/inventory")
        self.assertEqual(res.status_code, 200)
        inventory = json.loads(res.data)
        self.assertGreaterEqual(len(inventory), 1)
        names = [item["item_name"] for item in inventory]
        self.assertIn("Rusty Sword", names)

    def test_optional_moves_counter_parsing(self):
        """Verify moves counter parsing from status line with optional Moves field and backward compatibility."""
        # Initialize adventure
        payload = {"preset_idx": 0}
        res = self.app.post("/api/init", json=payload)
        self.assertEqual(res.status_code, 200)

        # After init, moves should be set to 1
        res = self.app.get("/api/state")
        self.assertEqual(res.status_code, 200)
        state_before = json.loads(res.data)
        moves_before = state_before.get("moves", 0)

        # Send a move — mock LLM returns status line WITHOUT Moves field (old format)
        payload = {"action_type": "do", "text": "go north"}
        res = self.app.post("/api/action", json=payload)
        self.assertEqual(res.status_code, 200)

        # Check state after the move — moves should have incremented by 1 (backward compat fallback)
        res = self.app.get("/api/state")
        self.assertEqual(res.status_code, 200)
        state_after = json.loads(res.data)
        moves_after = state_after.get("moves", 0)

        # The moves counter should have increased by exactly 1 (backward compat:
        # when status line has no Moves field, fallback is moves += 1)
        self.assertEqual(moves_after, moves_before + 1,
            "Moves should increment by 1 when status line lacks Moves field (backward compat)")


if __name__ == "__main__":
    unittest.main()
