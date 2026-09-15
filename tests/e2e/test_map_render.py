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


# The P6 fixture: 4 rooms in 3 regions with a confirmed walk edge, an inferred
# reverse, a portal and a time edge; the current room is in region 3.
P6_FIXTURE = {
    "rooms": [
        {"id": "r1", "name": "North Hall", "first_turn": 1, "last_visit_turn": 5, "visit_count": 1},
        {"id": "r2", "name": "Gallery", "first_turn": 2, "last_visit_turn": 4, "visit_count": 1},
        {"id": "r3", "name": "Vault of Echoes", "first_turn": 3, "last_visit_turn": 3, "visit_count": 1},
        {"id": "r4", "name": "Dawn Camp", "first_turn": 4, "last_visit_turn": 5, "visit_count": 1},
    ],
    "edges": [
        {"from": "r1", "direction": "east", "to": "r2", "kind": "walk", "inferred": 0},
        {"from": "r2", "direction": "west", "to": "r1", "kind": "walk", "inferred": 1},
        {"from": "r2", "direction": "archway", "to": "r3", "kind": "portal", "inferred": 0},
        {"from": "r3", "direction": None, "to": "r4", "kind": "time", "inferred": 0},
    ],
    "regions": [{"room_ids": ["r1", "r2"]}, {"room_ids": ["r3"]}, {"room_ids": ["r4"]}],
    "current_room_id": "r4",
}


def test_map_panel_fits_sidebar_and_centres_current_room(game_page):
    """A multi-region graph fits the narrow sidebar without clipping.

    Regression for the P6 defect: renderMapPanel sized the scroll box
    (#map-canvas) instead of a content layer inside it, so the box grew past
    #tab-map (overflow: hidden) and the right-hand region + current room were
    unreachable (no scrollbar).
    """
    page = game_page
    page.route(
        "**/api/map",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(P6_FIXTURE),
        ),
    )
    _commit_move(page, "look around")
    _open_map_tab(page)

    expect(page.locator("#map-panel")).to_have_attribute("data-current-room-id", "r4")
    assert page.locator(".map-room").count() == 4

    # The scroll box must not overflow its tab.
    metrics = page.evaluate(
        """() => {
            const tab = document.querySelector('#tab-map').getBoundingClientRect();
            const canvas = document.querySelector('#map-canvas');
            const rect = canvas.getBoundingClientRect();
            return { tabRight: tab.right, canvasRight: rect.right };
        }"""
    )
    assert metrics["canvasRight"] <= metrics["tabRight"] + 0.5, metrics

    # Every room is inside the scrollable content bounds (reachable).
    reachable = page.evaluate(
        """() => {
            const canvas = document.querySelector('#map-canvas');
            const content = document.querySelector('#map-canvas-content');
            const maxX = content.offsetWidth;
            const maxY = content.offsetHeight;
            return [...document.querySelectorAll('.map-room')].every(el => (
                el.offsetLeft >= 0 && el.offsetLeft + el.offsetWidth <= maxX + 0.5 &&
                el.offsetTop >= 0 && el.offsetTop + el.offsetHeight <= maxY + 0.5
            ));
        }"""
    )
    assert reachable, "every room must be within the canvas scroll bounds"

    # The current room (region 3) is scrolled into the visible rect.
    current_in_view = page.evaluate(
        """() => {
            const canvas = document.querySelector('#map-canvas');
            const cur = document.querySelector('.map-room.current-room');
            if (!cur) return false;
            const c = canvas.getBoundingClientRect();
            const r = cur.getBoundingClientRect();
            return r.left >= c.left - 0.5 && r.right <= c.right + 0.5 &&
                   r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5;
        }"""
    )
    assert current_in_view, "the current room must be scrolled into view"

    # Re-layout on width change: the debounced resize listener re-renders and the
    # map still stays within its tab without losing data.
    page.set_viewport_size({"width": 800, "height": 900})
    page.wait_for_timeout(400)  # debounced re-render is 150ms
    resized = page.evaluate(
        """() => {
            const tab = document.querySelector('#tab-map').getBoundingClientRect();
            const canvas = document.querySelector('#map-canvas').getBoundingClientRect();
            return {
                tabRight: tab.right,
                canvasRight: canvas.right,
                rooms: document.querySelectorAll('.map-room').length,
            };
        }"""
    )
    assert resized["canvasRight"] <= resized["tabRight"] + 0.5, resized
    assert resized["rooms"] == 4, resized
