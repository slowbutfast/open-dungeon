"""
Pytest configuration for MCP tests.

Stops the shared MCP server after all tests complete.
"""
import atexit
import pytest

from tests.mcp_client import McpTestCase


def _stop_shared_server():
    """Stop the shared MCP server client if it was started."""
    client = getattr(McpTestCase, '_shared_client', None)
    if client is not None:
        client.stop()


# Register the cleanup handler
atexit.register(_stop_shared_server)
