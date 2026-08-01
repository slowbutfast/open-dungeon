"""
Pytest configuration for MCP tests.

Stops the shared MCP server after all tests complete.
"""
import atexit
import os
import pytest

from tests.mcp_client import McpTestCase


def pytest_configure(config):
    """Inject a fallback SAVE_DIR so un-configured tests never target game/adventures/."""
    tests_dir = os.path.dirname(os.path.abspath(__file__))
    fallback = os.path.join(tests_dir, ".tmp_saves", "default")
    os.environ.setdefault("SAVE_DIR", fallback)


def _stop_shared_server():
    """Stop the shared MCP server client if it was started."""
    client = getattr(McpTestCase, '_shared_client', None)
    if client is not None:
        client.stop()


# Register the cleanup handler
atexit.register(_stop_shared_server)
