"""Frontend map-panel render smoke (spatial-map-visualization-pathfinding, 1.5).

Fails today because no map panel exists yet: the MAP sidebar tab, the panel
root, and the mode toggle are all absent. This file pins the DOM contract the
Slice B implementation must satisfy (renderer-agnostic — D6 is a hand-rolled
canvas/DOM renderer, so these assertions target data attributes and element
classes, never a third-party graph library):

  #tab-btn-map                      sidebar tab button (label "MAP")
  #tab-map                          sidebar tab content container
  #map-panel                        panel root; data-mode + data-current-room-id
  #map-mode-toggle                  render-mode toggle button
  .map-room[data-room-id]           one element per room node
  .map-room.current-room            the current-room highlight
  .map-empty                        the empty-state element

Follows tests/e2e/test_barter_ui.py fixtures/port/save-dir conventions.
"""
import os
import sys
import time
import json
import socket
import subprocess
import shutil
import pytest
from playwright.sync_api import sync_playwright, expect

pytestmark = pytest.mark.e2e

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from tests.test_helpers import assert_save_dir_is_safe

TEST_SAVE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "adventures_map_e2e_test",
)


def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


@pytest.fixture(scope="session", autouse=True)
def start_server():
    port = 5008
    proc = None
    if is_port_open(port):
        raise RuntimeError(
            f"Port {port} is already in use — please stop your server before running tests."
        )

    env = os.environ.copy()
    env["MOCK_LLM"] = "1"
    env["SAVE_DIR"] = TEST_SAVE_DIR
    env["PORT"] = str(port)
    proc = subprocess.Popen(
        ["node", "web/server.js"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )
    for _ in range(50):
        if is_port_open(port):
            break
        time.sleep(0.1)
    else:
        raise RuntimeError("Express server failed to start on port 5008")

    yield

    if proc:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()

    assert_save_dir_is_safe(TEST_SAVE_DIR)
    if os.path.isdir(TEST_SAVE_DIR):
        shutil.rmtree(TEST_SAVE_DIR, ignore_errors=True)
    presets_file = os.path.join(os.path.dirname(TEST_SAVE_DIR), "presets.json")
    if os.path.isfile(presets_file):
        os.remove(presets_file)


@pytest.fixture(scope="function")
def game_page(page):
    """Launch a game session so we're on the gameplay screen."""
    errors = []
    page.on("console", lambda msg: errors.append(f"CONSOLE {msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: errors.append(f"PAGE ERROR: {err}"))
    page.goto("http://127.0.0.1:5008")
    page.wait_for_selector("#llm-status-pill:not(.llm-pill-checking)")

    page.keyboard.press("1")
    page.wait_for_selector(".preset-card")
    page.locator("#btn-custom-preset").click()
    page.wait_for_selector("#custom-preset-screen:not(.hidden)")
    page.locator("#btn-submit-custom-preset").click()
    page.wait_for_selector("#character-screen:not(.hidden)")
    page.wait_for_selector(".char-card")
    page.locator("#btn-submit-character").click()
    page.wait_for_selector("#gameplay-screen:not(.hidden)", timeout=15000)

    page._test_errors = errors
    return page


def _commit_move(page, text="go north"):
    """Commit one turn so the spatial graph has at least the current room."""
    page.locator("#console-input").fill(text)
    page.locator("#btn-send").click()
    page.wait_for_timeout(3000)


def _open_map_tab(page):
    page.locator("#tab-btn-map").click(timeout=5000)
    page.wait_for_selector("#map-panel", timeout=5000)


def _fetch_map(page):
    return page.evaluate("() => fetch('/api/map').then(r => r.json())")


def test_map_panel_renders_rooms_from_api(game_page):
    """The MAP tab renders the room graph served by GET /api/map."""
    page = game_page
    _commit_move(page)
    _open_map_tab(page)

    expect(page.locator("#map-panel")).to_be_visible()

    map_data = _fetch_map(page)
    assert map_data.get("rooms"), f"expected rooms in /api/map, got {map_data}"

    panel = page.locator("#map-panel")
    expect(panel).to_have_attribute("data-current-room-id", map_data["current_room_id"])
    assert page.locator(".map-room").count() >= 1, "the panel must render a room node per room"


def test_map_mode_toggle_switches_render_mode(game_page):
    """The mode toggle switches render modes without losing the map data."""
    page = game_page
    _commit_move(page)
    _open_map_tab(page)

    panel = page.locator("#map-panel")
    expect(panel).to_have_attribute("data-mode", "cartographic")
    rooms_before = page.locator(".map-room").count()

    page.locator("#map-mode-toggle").click()
    expect(panel).to_have_attribute("data-mode", "node-graph")
    assert page.locator(".map-room").count() == rooms_before, \
        "toggling render modes must not lose the map data"

    page.locator("#map-mode-toggle").click()
    expect(panel).to_have_attribute("data-mode", "cartographic")


def test_map_current_room_highlight(game_page):
    """The current room is highlighted among the rendered rooms."""
    page = game_page
    _commit_move(page)
    _open_map_tab(page)

    map_data = _fetch_map(page)
    current = map_data["current_room_id"]
    assert current, f"expected a current_room_id in /api/map, got {map_data}"

    highlight = page.locator(f'.map-room[data-room-id="{current}"].current-room')
    expect(highlight).to_have_count(1)


def test_map_empty_state(game_page):
    """An empty graph renders an empty state rather than an error."""
    page = game_page
    page.route(
        "**/api/map",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "rooms": [],
                "edges": [],
                "regions": [],
                "current_room_id": None,
            }),
        ),
    )

    # A committed turn drives the post-turn refresh cycle against the empty map.
    _commit_move(page, "look around")
    _open_map_tab(page)

    expect(page.locator("#map-panel")).to_be_visible()
    expect(page.locator("#map-panel .map-empty")).to_be_visible()
