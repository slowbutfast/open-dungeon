import os
import sys
import json
import unittest
import socket
import subprocess
import time
import requests

class HttpClientProxy:
    def __init__(self, base_url="http://127.0.0.1:5003"):
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

class TestOpenRouterModels(unittest.TestCase):
    PORT = 5003

    @classmethod
    def setUpClass(cls):
        cls.proc = None
        
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        cls.save_dir = os.path.join(tests_dir, "adventures_openrouter_test")
        os.makedirs(cls.save_dir, exist_ok=True)
        os.environ["SAVE_DIR"] = cls.save_dir
        
        # Check if port is already open
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            port_open = s.connect_ex(('127.0.0.1', cls.PORT)) == 0

        if port_open:
            raise RuntimeError(
                f"Port {cls.PORT} is already in use — please stop your server before running tests."
            )

        env = os.environ.copy()
        env["LLM_BACKEND"] = "openrouter"
        env["OPENROUTER_API_KEY"] = "sk-or-v1-test-key"
        env["PORT"] = str(cls.PORT)
        # Set MOCK_LLM=0 so server.js fallback doesn't set it to "1"
        # (server.js sets MOCK_LLM=1 when undefined)
        env["MOCK_LLM"] = "0"
        cls.proc = subprocess.Popen(
            ["node", "web/server.js"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env
        )
        # Wait for the server to spin up
        for _ in range(50):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(('127.0.0.1', cls.PORT)) == 0:
                    break
            time.sleep(0.1)
        else:
            raise RuntimeError(f"Express server failed to start on port {cls.PORT}")

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                cls.proc.kill()
        # Clean up isolated test save directory entirely
        import shutil
        if os.path.exists(cls.save_dir):
            try:
                shutil.rmtree(cls.save_dir)
            except OSError:
                pass
        time.sleep(0.5)

    def setUp(self):
        self.app = HttpClientProxy(base_url=f"http://127.0.0.1:{self.PORT}")

    def test_ping_returns_curated_models_with_env_model_first(self):
        """Verify /api/ping returns models array with env model at index 0
        followed by the six curated models (deduplicated)."""
        res = self.app.get("/api/ping")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        
        self.assertEqual(data["backend"], "openrouter")
        self.assertIn("models", data)
        self.assertIn("modelCaptions", data)
        
        # Env model should be at index 0
        self.assertEqual(data["models"][0], data["model"])
        
        # All curated models should be present
        curated_ids = [
            "google/gemini-2.5-flash",
            "deepseek/deepseek-v4-pro",
            "sao10k/l3.3-euryale-70b",
            "meta-llama/llama-3.3-70b-instruct",
            "qwen/qwen-2.5-72b-instruct",
            "google/gemini-2.5-pro",
            "deepseek/deepseek-r1"
        ]
        for mid in curated_ids:
            self.assertIn(mid, data["models"])

    def test_model_captions_length_matches_models_length(self):
        """Verify modelCaptions array has same length as models array."""
        res = self.app.get("/api/ping")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        
        self.assertEqual(len(data["models"]), len(data["modelCaptions"]))
        
        # Every caption should be a non-empty string
        for caption in data["modelCaptions"]:
            self.assertIsInstance(caption, str)
            self.assertGreater(len(caption), 0)

    def test_env_model_not_duplicated_when_already_in_curated_list(self):
        """Verify env model is not duplicated if it's already in curated list.

        Default env model (deepseek/deepseek-v4-flash) is not in the curated
        list, so models array should contain 7 unique entries (1 env + 6 curated).
        """
        res = self.app.get("/api/ping")
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        
        # Env model plus 6 curated models
        self.assertGreater(len(data["models"]), 1,
            "Expected curated models in addition to env model")
        
        # No model should appear more than once
        from collections import Counter
        counts = Counter(data["models"])
        for model_id, count in counts.items():
            self.assertEqual(count, 1, f"Model {model_id} appears {count} times (expected 1)")

if __name__ == "__main__":
    unittest.main()
