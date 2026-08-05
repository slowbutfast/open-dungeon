import json
import os
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from tests.probe_runner import Probe, ProbeRunner, parse_sse


pytestmark = pytest.mark.integration


class MockProbeHandler(BaseHTTPRequestHandler):
    state = {"location": "Starting Location", "score": 0, "moves": 1}
    adventure_id = "mock-adventure"

    def do_GET(self):
        if self.path == "/api/ping":
            self.send_json({"status": "mock"})
        elif self.path == "/api/state":
            self.send_json({"adventure_id": self.adventure_id, **self.state})
        else:
            self.send_error(404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        if self.path == "/api/init":
            self.send_json({"status": "success", "adventure_id": self.adventure_id})
        elif self.path.startswith("/api/action"):
            self.state["moves"] += 1
            self.send_json({"narration": "mock narration", **self.state})
        elif self.path.startswith("/api/saves/"):
            self.send_json({"status": "success"})
        else:
            self.send_error(404)

    def send_json(self, payload):
        encoded = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, *_args):
        pass


def mock_server():
    MockProbeHandler.state = {"location": "Starting Location", "score": 0, "moves": 1}
    server = HTTPServer(("127.0.0.1", 0), MockProbeHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def test_probe_runner_lifecycle_and_driver(tmp_path):
    server, _ = mock_server()
    probe = Probe("alpha", project_root=tmp_path)
    probe.port = server.server_port
    probe.wait_ready()
    assert probe.action("look around")["narration"] == "mock narration"
    assert probe.state()["moves"] == 2
    server.shutdown()


def test_sse_parser_and_sandbox_isolation(tmp_path):
    parsed = parse_sse('data: {"type":"chunk","content":"hello"}\n\n'
                       'data: {"type":"done","location":"Hall","score":2,"moves":3}\n\n')
    assert parsed == {"narration": "hello", "location": "Hall", "score": 2, "moves": 3}
    first = Probe("one", project_root=tmp_path)
    second = Probe("two", project_root=tmp_path)
    assert first.save_dir != second.save_dir
    assert "game" in str(first.save_dir) and "playtest" in str(first.save_dir)


def test_runner_concurrency_cap():
    runner = ProbeRunner(["one", "two", "three"], max_concurrent=2)
    assert runner.max_concurrent == 2
    assert runner.pending == ["one", "two", "three"]


def test_probe_resume_only_after_init(tmp_path):
    probe = Probe("resume", project_root=tmp_path)
    assert probe.adventure_id is None
    probe.record_adventure("saved")
    assert probe.adventure_id == "saved"


def test_probe_resume_after_restart(tmp_path):
    server, _ = mock_server()
    probe = Probe("resume", project_root=tmp_path)
    probe.port = server.server_port
    probe.record_adventure("mock-adventure")
    probe.process = object()
    probe.wait_ready = lambda: None
    probe.request("POST", "/api/saves/mock-adventure")
    assert probe.adventure_id == "mock-adventure"
    server.shutdown()


def _probe_name(prefix):
    import uuid
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _cleanup_probe_dir(name):
    import shutil
    from tests.test_helpers import assert_save_dir_is_safe

    save_dir = os.path.join("game", "playtest", "adventures", f"probe-{name}")
    assert_save_dir_is_safe(save_dir, allow_playtest=True)
    shutil.rmtree(save_dir, ignore_errors=True)


def test_probe_real_server_lifecycle_and_teardown():
    name = _probe_name("live")
    probe = Probe(name)
    try:
        probe.start()
        probe.init()
        result = probe.action("look around")
        assert result["narration"]
        for key in ("location", "score", "moves"):
            assert key in result
        assert probe.state()["adventure_id"] == probe.adventure_id
        probe.stop()
        assert probe.process is None or probe.process.poll() is not None
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            assert s.connect_ex(("127.0.0.1", probe.port)) != 0
    finally:
        probe.stop()
        _cleanup_probe_dir(name)


def test_probe_real_server_crash_resume():
    name = _probe_name("resume")
    probe = Probe(name)
    try:
        probe.start()
        probe.init()
        adventure_id = probe.adventure_id
        location = probe.state()["location"]
        assert adventure_id
        probe.process.kill()
        probe.process.wait()
        probe.start()
        assert probe.adventure_id == adventure_id
        restored = probe.state()
        assert restored["adventure_id"] == adventure_id
        assert restored["location"] == location
    finally:
        probe.stop()
        _cleanup_probe_dir(name)


class TrackingProbe(Probe):
    active = 0
    peak = 0
    lock = threading.Lock()

    def start(self):
        with TrackingProbe.lock:
            TrackingProbe.active += 1
            TrackingProbe.peak = max(TrackingProbe.peak, TrackingProbe.active)
        try:
            return super().start()
        finally:
            with TrackingProbe.lock:
                TrackingProbe.active -= 1


class TrackingRunner(ProbeRunner):
    def _run_one(self, name):
        probe = TrackingProbe(name, **self.probe_options)
        self.active.append(probe)
        try:
            return probe.run()
        finally:
            probe.stop()
            self.active.remove(probe)


def test_runner_concurrency_cap_queues_real_servers():
    names = [_probe_name("cap") for _ in range(3)]
    try:
        runner = TrackingRunner(names, max_concurrent=2)
        results = runner.run()
        assert len(results) == 3
        assert all(result["status"] == "success" for result in results)
        assert TrackingProbe.peak <= 2
    finally:
        for name in names:
            _cleanup_probe_dir(name)


# ---------------------------------------------------------------------------
# Scripted narration via MOCK_SCRIPT_FILE (scriptable-mock-narrator)
# ---------------------------------------------------------------------------
# Each of these spawns a real `node web/server.js` probe in mock mode
# (MOCK_LLM=1) against a JSON array of canonical status lines served by the
# mock's `narration` intent. The engine owns the committed location, score,
# and moves; the script only proposes the status-line fields.

CANNED_NARRATION = "You walk south into the noisy cantina."


def _write_script(tmp_path, lines):
    script = tmp_path / "narration-script.json"
    script.write_text(json.dumps(lines))
    return str(script)


def _server_log_contains(probe, needle, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if needle in (probe.save_dir / "server.log").read_text(errors="replace"):
                return True
        except OSError:
            pass
        time.sleep(0.1)
    return False


def test_scripted_narration_varying_locations_and_holds_last(tmp_path):
    """Scripted probe emits varying locations per turn and holds the last line
    on exhaustion (spec: Scripted Narration via MOCK_SCRIPT_FILE)."""
    script = _write_script(tmp_path, [
        "[Status: Western Clearing | Score: 0 | Moves: 1]",
        "[Status: Northern Trail | Score: 0 | Moves: 2]",
    ])
    name = _probe_name("scripted")
    probe = Probe(name, mock_script_file=script)
    try:
        probe.start()
        probe.init()
        locations = [probe.action("look around")["location"] for _ in range(3)]
        assert locations == ["Western Clearing", "Northern Trail", "Northern Trail"]
    finally:
        probe.stop()
        _cleanup_probe_dir(name)


def test_scripted_default_path_is_canned_when_unset(tmp_path, monkeypatch):
    """With MOCK_SCRIPT_FILE unset the mock serves byte-identical canned
    narration (spec: Default Path Unchanged)."""
    monkeypatch.delenv("MOCK_SCRIPT_FILE", raising=False)
    name = _probe_name("canned")
    probe = Probe(name)
    try:
        probe.start()
        probe.init()
        result = probe.action("look around")
        assert result["location"] == "Cantina"
        assert result["narration"].strip() == CANNED_NARRATION
    finally:
        probe.stop()
        _cleanup_probe_dir(name)


def test_scripted_bad_path_missing_file_falls_back_to_canned(tmp_path):
    """A missing MOCK_SCRIPT_FILE falls back to canned narration with a warning
    and never crashes startup or the first narration (spec: Default Path
    Unchanged -> unreadable script handled)."""
    missing = os.path.join(str(tmp_path), "does-not-exist.json")
    name = _probe_name("badpath")
    probe = Probe(name, mock_script_file=missing)
    try:
        probe.start()
        probe.init()
        result = probe.action("look around")
        assert result["location"] == "Cantina"
        assert result["narration"].strip() == CANNED_NARRATION
        assert _server_log_contains(probe, "MOCK_SCRIPT_FILE")
    finally:
        probe.stop()
        _cleanup_probe_dir(name)


def test_scripted_bad_path_malformed_json_falls_back_to_canned(tmp_path):
    """A malformed MOCK_SCRIPT_FILE falls back to canned narration with a
    warning and does not crash the server (spec: Default Path Unchanged)."""
    bad = tmp_path / "malformed.json"
    bad.write_text("{ this is not valid json !!!")
    name = _probe_name("badjson")
    probe = Probe(name, mock_script_file=str(bad))
    try:
        probe.start()
        probe.init()
        result = probe.action("look around")
        assert result["location"] == "Cantina"
        assert result["narration"].strip() == CANNED_NARRATION
        assert _server_log_contains(probe, "MOCK_SCRIPT_FILE")
    finally:
        probe.stop()
        _cleanup_probe_dir(name)


def test_scripted_engine_owns_score_and_moves(tmp_path):
    """Committed score/moves come from the engine, not the scripted fields
    (spec: Engine Remains Score/Moves Owner)."""
    script = _write_script(tmp_path, [
        "[Status: Western Clearing | Score: 5 | Moves: 42]",
    ])
    name = _probe_name("owner")
    probe = Probe(name, mock_script_file=script)
    try:
        probe.start()
        probe.init()
        before = probe.state()["moves"]
        result = probe.action("look around")
        assert result["location"] == "Western Clearing"
        assert result["score"] == 0
        assert result["moves"] == before + 1
        assert result["moves"] != 42
        state = probe.state()
        assert state["score"] == 0
        assert state["moves"] == result["moves"]
    finally:
        probe.stop()
        _cleanup_probe_dir(name)


def test_scripted_runner_env_passthrough(tmp_path):
    """The runner passes MOCK_SCRIPT_FILE through to the spawned server env when
    configured and omits it otherwise (spec: Runner Env Passthrough)."""
    script = _write_script(tmp_path, [
        "[Status: Ashfall Market | Score: 0 | Moves: 1]",
    ])
    configured = Probe(_probe_name("envcfg"), mock_script_file=script)
    plain = Probe(_probe_name("envplain"))
    try:
        assert configured.environment()["MOCK_SCRIPT_FILE"] == script
        assert "MOCK_SCRIPT_FILE" not in plain.environment()
        # Spawn: the configured probe serves scripted narration end-to-end.
        configured.start()
        configured.init()
        assert configured.action("look around")["location"] == "Ashfall Market"
    finally:
        configured.stop()
        plain.stop()
        _cleanup_probe_dir(configured.name)
        _cleanup_probe_dir(plain.name)
