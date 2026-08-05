#!/usr/bin/env python3
"""Supervise isolated web-server playtest probes."""

import argparse
import atexit
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from tests.test_helpers import assert_save_dir_is_safe
except ModuleNotFoundError:
    from test_helpers import assert_save_dir_is_safe


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def parse_sse(body):
    chunks = []
    done_content = None
    result = {}
    for line in body.splitlines():
        if not line.startswith("data:"):
            continue
        try:
            event = json.loads(line[5:].strip())
        except json.JSONDecodeError:
            continue
        if event.get("type") == "chunk":
            chunks.append(event.get("content", ""))
        elif event.get("type") == "done":
            done_content = event.get("content")
        for key in ("location", "score", "moves"):
            if key in event:
                result[key] = event[key]
    result["narration"] = done_content if done_content else "".join(chunks)
    return {"narration": result.pop("narration"), **result}


class Probe:
    def __init__(self, name, project_root=None, save_dir=None, mock=True,
                 llm_backend=None, model=None, timeout=20, max_restarts=3,
                 mock_script_file=None):
        self.name = name
        self.project_root = Path(project_root or Path(__file__).resolve().parents[1]).resolve()
        self.save_dir = Path(save_dir or self.project_root / "game" / "playtest" /
                             "adventures" / f"probe-{name}").resolve()
        self._assert_safe_save_dir()
        self.port = free_port()
        self.mock = bool(mock)
        self.llm_backend = llm_backend
        self.model = model
        self.mock_script_file = str(mock_script_file) if mock_script_file else None
        self.timeout = timeout
        self.max_restarts = max_restarts
        self.restarts = 0
        self.process = None
        self.log = None
        self.adventure_id = None
        self.state_file = self.save_dir / "probe-state.json"
        self._lock = threading.Lock()
        self._load_state()

    def _assert_safe_save_dir(self):
        playtest_root = (self.project_root / "game" / "playtest").resolve()
        if self.save_dir == self.project_root / "game" / "adventures" or \
                playtest_root not in self.save_dir.parents:
            raise ValueError(f"probe SAVE_DIR must be under {playtest_root}: {self.save_dir}")
        if self.project_root == Path(__file__).resolve().parents[1]:
            assert_save_dir_is_safe(self.save_dir, allow_playtest=True)

    def _load_state(self):
        try:
            self.adventure_id = json.loads(self.state_file.read_text()).get("adventure_id")
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            self.adventure_id = None

    def record_adventure(self, adventure_id):
        self.adventure_id = adventure_id
        self.save_dir.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps({"adventure_id": adventure_id}, indent=2))

    def environment(self):
        env = os.environ.copy()
        env.update({"PORT": str(self.port), "SAVE_DIR": str(self.save_dir),
                    "MOCK_LLM": "1" if self.mock else "0"})
        if self.llm_backend:
            env["LLM_BACKEND"] = self.llm_backend
        if self.model:
            env["OPENROUTER_MODEL"] = self.model
        # Scripted mock narration (scriptable-mock-narrator, D5): pass the
        # configured script through to the spawned server; omitted by default so
        # probes without a script behave exactly as before.
        if self.mock_script_file:
            env["MOCK_SCRIPT_FILE"] = self.mock_script_file
        return env

    def start(self):
        with self._lock:
            if self.process and self.process.poll() is None:
                return
            self.save_dir.mkdir(parents=True, exist_ok=True)
            if self.log:
                self.log.close()
            self.log = open(self.save_dir / "server.log", "ab")
            self.process = subprocess.Popen(
                ["node", "web/server.js"], cwd=self.project_root,
                env=self.environment(), stdout=self.log, stderr=subprocess.STDOUT)
        self.wait_ready()
        if self.adventure_id:
            try:
                self.request("POST", f"/api/saves/{self.adventure_id}")
            except (HTTPError, URLError):
                self.adventure_id = None

    def wait_ready(self):
        deadline = time.monotonic() + self.timeout
        last_error = None
        while time.monotonic() < deadline:
            if self.process and self.process.poll() is not None:
                break
            try:
                response = self.request("GET", "/api/ping")
                if response.get("status") in ("ok", "online", "mock"):
                    return response
            except (HTTPError, URLError, TimeoutError) as error:
                last_error = error
            time.sleep(0.1)
        log_tail = ""
        try:
            log_tail = (self.save_dir / "server.log").read_text(errors="replace")[-2000:]
        except OSError:
            pass
        raise RuntimeError(f"probe {self.name} did not become ready: {last_error}\n{log_tail}")

    def stop(self):
        with self._lock:
            process = self.process
            self.process = None
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
        if self.log:
            self.log.close()
            self.log = None

    def restart(self):
        if self.restarts >= self.max_restarts:
            raise RuntimeError(f"probe {self.name} exceeded restart limit ({self.max_restarts})")
        self.restarts += 1
        self.stop()
        self.start()

    def request(self, method, path, payload=None):
        data = None if payload is None else json.dumps(payload).encode()
        request = Request(f"http://127.0.0.1:{self.port}{path}", data=data, method=method)
        if data is not None:
            request.add_header("Content-Type", "application/json")
        with urlopen(request, timeout=self.timeout) as response:
            body = response.read().decode()
            return json.loads(body) if body else {}

    def init(self, title=None):
        try:
            response = self.request("POST", "/api/init", {"title": title or f"Probe {self.name}"})
        except (HTTPError, URLError):
            self.restart()
            response = self.request("POST", "/api/init", {"title": title or f"Probe {self.name}"})
        self.record_adventure(response["adventure_id"])
        return response

    def state(self):
        return self.request("GET", "/api/state")

    def action(self, text, action_type="do"):
        payload = {"action_type": action_type, "text": text}
        try:
            response = self.request("POST", "/api/action?format=json", payload)
            if "narration" in response:
                return response
        except (HTTPError, URLError, ValueError):
            pass
        try:
            data = json.dumps(payload).encode()
            request = Request(f"http://127.0.0.1:{self.port}/api/action", data=data,
                              method="POST", headers={"Content-Type": "application/json"})
            with urlopen(request, timeout=self.timeout) as response:
                result = parse_sse(response.read().decode())
            result.update({key: self.state().get(key) for key in ("location", "score", "moves")})
            return result
        except (HTTPError, URLError, TimeoutError):
            self.restart()
            return self.action(text, action_type)

    def run(self):
        self.start()
        initialized = self.init()
        return {"probe": self.name, "port": self.port, "save_dir": str(self.save_dir),
                "adventure_id": initialized["adventure_id"], "status": "success"}

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *_args):
        self.stop()


class ProbeRunner:
    def __init__(self, probes, max_concurrent=None, **probe_options):
        self.pending = list(probes)
        self.max_concurrent = max_concurrent or len(self.pending) or 1
        self.probe_options = probe_options
        self.active = []

    def run(self):
        results = []
        with ThreadPoolExecutor(max_workers=self.max_concurrent) as pool:
            futures = {pool.submit(self._run_one, name): name for name in self.pending}
            for future in as_completed(futures):
                try:
                    results.append(future.result())
                except Exception as error:
                    results.append({"probe": futures[future], "status": "failed", "error": str(error)})
        return sorted(results, key=lambda result: result["probe"])

    def _run_one(self, name):
        probe = Probe(name, **self.probe_options)
        self.active.append(probe)
        try:
            return probe.run()
        finally:
            probe.stop()
            self.active.remove(probe)

    def stop_all(self):
        for probe in list(self.active):
            probe.stop()


_RUNNER = None


def _cleanup(*_args):
    if _RUNNER:
        _RUNNER.stop_all()


def _handle_signal(signum, _frame):
    _cleanup()
    raise SystemExit(128 + signum)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("--probes", nargs="+", required=True)
    run_parser.add_argument("--mock", choices=("0", "1"), default="1")
    run_parser.add_argument("--llm-backend")
    run_parser.add_argument("--openrouter-model")
    run_parser.add_argument("--mock-script-file",
                            help="JSON array of canonical status lines for the "
                                 "mock narrator, e.g. game/playtest/scripts/<probe>.json")
    run_parser.add_argument("--max-concurrent", type=int)
    run_parser.add_argument("--timeout", type=float, default=20)
    args = parser.parse_args(argv)
    if args.command == "run":
        global _RUNNER
        _RUNNER = ProbeRunner(args.probes, max_concurrent=args.max_concurrent,
                              mock=args.mock == "1", llm_backend=args.llm_backend,
                              model=args.openrouter_model, timeout=args.timeout,
                              mock_script_file=args.mock_script_file)
        print(json.dumps(_RUNNER.run(), indent=2))
        return 0
    return 1


atexit.register(_cleanup)
for _signal in (signal.SIGINT, signal.SIGTERM):
    signal.signal(_signal, _handle_signal)


if __name__ == "__main__":
    sys.exit(main())
