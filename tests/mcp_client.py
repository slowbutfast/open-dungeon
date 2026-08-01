"""
MCP test client helper for communicating with the MCP server via stdio.

Provides a McpClient class that:
1. Spawns the MCP server as a subprocess
2. Sends JSON-RPC messages over stdin as newline-delimited JSON
3. Reads JSON-RPC responses from stdout as newline-delimited JSON
4. Handles the MCP initialization handshake

NOTE: The @modelcontextprotocol/sdk StdioServerTransport uses newline-delimited
JSON for communication (not Content-Length headers). Each message is a single
line of JSON followed by \\n.
"""
import os
import json
import subprocess
import time
import select
import threading
import unittest

from tests.test_helpers import assert_save_dir_is_safe


MCP_SERVER_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "mcp",
    "server.js",
)


class McpClient:
    """A test client that communicates with the MCP server over stdio."""

    def __init__(self, server_path=None, env=None):
        self.server_path = server_path or MCP_SERVER_PATH
        self.proc = None
        self._buffer = b""
        self._request_id = 0
        self.env = env or {}
        self._stderr_thread = None
        self._stderr_output = []

    def _build_env(self):
        merged = os.environ.copy()
        # Ensure MOCK_LLM is set for test isolation
        if "MOCK_LLM" not in os.environ:
            merged.setdefault("MOCK_LLM", "1")
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        save_dir = os.path.join(tests_dir, "mcp_test_data")
        assert_save_dir_is_safe(save_dir)
        merged["SAVE_DIR"] = save_dir
        merged.update(self.env)
        return merged

    def _collect_stderr(self):
        """Continuously read stderr to prevent pipe buffer blocking."""
        try:
            while self.proc and self.proc.poll() is None:
                line = self.proc.stderr.readline()
                if line:
                    self._stderr_output.append(line.decode("utf-8", errors="replace").rstrip())
                else:
                    break
        except Exception:
            pass

    def start(self):
        """Start the MCP server subprocess."""
        tests_dir = os.path.dirname(os.path.abspath(__file__))
        save_dir = os.path.join(tests_dir, "mcp_test_data")
        assert_save_dir_is_safe(save_dir)
        os.makedirs(save_dir, exist_ok=True)

        env = self._build_env()
        self.proc = subprocess.Popen(
            ["node", self.server_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        )
        self._stderr_thread = threading.Thread(target=self._collect_stderr, daemon=True)
        self._stderr_thread.start()
        time.sleep(0.5)
        return self

    def stop(self):
        """Terminate the MCP server subprocess."""
        if self.proc:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=5)
            except Exception:
                try:
                    self.proc.kill()
                    self.proc.wait(timeout=2)
                except Exception:
                    pass
            self.proc = None

    def __enter__(self):
        return self.start()

    def __exit__(self, *args):
        self.stop()

    def _next_id(self):
        self._request_id += 1
        return self._request_id

    def _send_message(self, message):
        """Send a JSON-RPC message over stdin as newline-delimited JSON."""
        payload = json.dumps(message, ensure_ascii=False) + "\n"
        self.proc.stdin.write(payload.encode("utf-8"))
        self.proc.stdin.flush()

    def _read_message(self, timeout=10.0):
        """Read a single JSON-RPC message from stdout.

        The SDK's StdioServerTransport uses newline-delimited JSON.
        Reads until we have a complete line, then parses it as JSON.
        """
        deadline = time.time() + timeout

        while True:
            # Check for complete message in buffer (newline-delimited)
            if b"\n" in self._buffer:
                line, rest = self._buffer.split(b"\n", 1)
                self._buffer = rest
                line_str = line.decode("utf-8").strip()
                if line_str:
                    return json.loads(line_str)
                continue

            if time.time() > deadline:
                stderr_snippet = "\n".join(self._stderr_output[-10:])
                raise TimeoutError(
                    f"Timeout waiting for MCP response. "
                    f"Buffer: {self._buffer[:200]!r} "
                    f"stderr (last 10 lines):\n{stderr_snippet}"
                )

            if self.proc is not None and self.proc.poll() is not None:
                stderr_output = "\n".join(self._stderr_output)
                raise ConnectionError(
                    f"MCP server process terminated with code {self.proc.returncode}. "
                    f"stderr:\n{stderr_output}"
                )

            rlist, _, _ = select.select([self.proc.stdout], [], [], 0.1)
            if rlist:
                fd = self.proc.stdout.fileno()
                chunk = os.read(fd, 65536)
                if chunk:
                    self._buffer += chunk
                else:
                    time.sleep(0.05)
            else:
                time.sleep(0.05)

    def initialize(self):
        """Perform the MCP initialization handshake."""
        msg = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "initialize",
            "params": {
                "protocolVersion": "0.1.0",
                "capabilities": {},
                "clientInfo": {
                    "name": "mcp-test-client",
                    "version": "1.0.0"
                }
            }
        }
        self._send_message(msg)
        response = self._read_message()

        notif = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {}
        }
        self._send_message(notif)

        return response

    def send_request(self, method, params=None):
        """Send a JSON-RPC request and return the response."""
        msg = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": method,
            "params": params or {}
        }
        self._send_message(msg)
        return self._read_message()

    def list_tools(self):
        """Retrieve the list of available tools."""
        return self.send_request("tools/list")

    def call_tool(self, name, arguments=None):
        """Call a specific tool with the given arguments."""
        return self.send_request("tools/call", {
            "name": name,
            "arguments": arguments or {}
        })

    def init_session(self, title="MCP Test Adventure", system_prompt=None, preset_index=None):
        """Helper: initialize a new adventure session."""
        args = {}
        if preset_index is not None:
            args["preset_index"] = preset_index
        else:
            args["title"] = title
        if system_prompt is not None:
            args["system_prompt"] = system_prompt
        return self.call_tool("dungeon_init_session", args)

    def send_action(self, text, action_type="do"):
        """Helper: send a player action."""
        return self.call_tool("dungeon_send_action", {
            "action_type": action_type,
            "text": text
        })


def assert_mcp_success(response):
    """Assert that an MCP response indicates success (no error field)."""
    has_error = "error" in response or response.get("result", {}).get("isError") is True
    assert not has_error, (
        f"MCP request failed: {response.get('error', response.get('result', {}))}"
    )
    assert "result" in response, (
        f"MCP response missing 'result' field: {response}"
    )


def assert_tool_result(response):
    """Assert that a tool call response contains a result with content."""
    assert_mcp_success(response)
    result = response["result"]
    assert "content" in result, f"Tool result missing 'content': {result}"
    assert len(result["content"]) > 0, "Tool result has empty content"
    return result


class McpTestCase(unittest.TestCase):
    """Base class for MCP test cases that share a single server per class."""

    _shared_client = None  # Shared across all subclasses

    @classmethod
    def setUpClass(cls):
        if McpTestCase._shared_client is None:
            McpTestCase._shared_client = McpClient()
            McpTestCase._shared_client.start()
            McpTestCase._shared_client.initialize()

    @classmethod
    def tearDownClass(cls):
        pass  # Don't stop the server; let a session-level fixture handle it

    def setUp(self):
        """Ensure the client is connected and shared."""
        self.client = McpTestCase._shared_client

    def new_session(self, title="MCP Test"):
        """Create a fresh adventure for each test that needs it."""
        return self.client.init_session(title=title)

    def assert_tool_success(self, response):
        """Assert a tool call succeeded."""
        return assert_tool_result(response)
