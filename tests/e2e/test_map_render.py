"""Frontend gravitational node-map render + interaction E2E (gravitational-node-map).

The MAP sidebar tab renders the persisted room graph from GET /api/map as a
single-mode, Obsidian-style force-directed constellation. This file pins the
DOM contract and the interaction model the implementation must satisfy
(renderer-agnostic — a hand-rolled DOM/SVG renderer, so these assertions target
data attributes, element classes and geometry, never a graph library):

  #tab-btn-map                      sidebar tab button (label "MAP")
  #tab-map                          sidebar tab content container
  #map-panel                        panel root; data-current-room-id
  #map-canvas                       pan/zoom viewport (touch-action: none)
  #map-canvas-content               transformed world layer
  .map-room[data-room-id]           one circular orb per room (keyed diff)
  .map-room.current-room            the current-room highlight
  .map-edge[data-edge-key]          SVG edge keyed "<from>|<direction ?? ''>|<to>"
  #map-hover-card                   200 ms dwell preview (fine pointers only)
  #map-inspector                    anchored popover / mobile bottom sheet
  .map-empty                        the empty-state element

Follows tests/e2e/test_barter_ui.py fixtures/port/save-dir conventions.
"""
import copy
import os
import sys
import time
import json
import socket
import subprocess
import shutil
import pytest
from playwright.sync_api import expect

pytestmark = pytest.mark.e2e

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from tests.test_helpers import assert_save_dir_is_safe

TEST_TMP_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    ".tmp_od_root_map",
)
TEST_SAVE_DIR = os.path.join(TEST_TMP_ROOT, "local-dev", "adventures")


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
    env.pop("SAVE_DIR", None)
    env["OD_TMP_ROOT"] = TEST_TMP_ROOT  # web/server.js honours this
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

    assert_save_dir_is_safe(TEST_TMP_ROOT)
    shutil.rmtree(TEST_TMP_ROOT, ignore_errors=True)


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


@pytest.fixture(scope="function")
def mobile_game_page(browser):
    """A fresh 375x812 mobile context (not a resized desktop page)."""
    context = browser.new_context(
        viewport={"width": 375, "height": 812},
        is_mobile=True,
    )
    page = context.new_page()
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
    yield page
    context.close()


def _commit_move(page, text="go north"):
    """Commit one turn so the spatial graph has at least the current room."""
    page.locator("#console-input").fill(text)
    page.locator("#btn-send").click()
    page.wait_for_timeout(3000)


def _open_map_tab(page):
    page.locator("#tab-btn-map").click(timeout=5000)
    page.wait_for_selector("#map-panel", timeout=5000)


def _open_map_tab_mobile(page):
    page.locator('.mobile-tab[data-panel="map"]').click(timeout=5000)
    page.wait_for_selector("#tab-map.active #map-panel", timeout=5000)


def _fetch_map(page):
    return page.evaluate("() => fetch('/api/map').then(r => r.json())")


def _mock_map(page, fixture):
    page.route(
        "**/api/map",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(fixture),
        ),
    )


def _mock_path(page, payload, status=200):
    page.route(
        "**/api/path*",
        lambda route: route.fulfill(
            status=status,
            content_type="application/json",
            body=json.dumps(payload),
        ),
    )


def _room_rect(page, room_id):
    return page.evaluate(
        """(id) => {
            const el = document.querySelector(`.map-room[data-room-id="${id}"]`);
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                     width: r.width, height: r.height };
        }""",
        room_id,
    )


def _canvas_rect(page):
    return page.evaluate(
        """() => {
            const r = document.querySelector('#map-canvas').getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                     width: r.width, height: r.height };
        }"""
    )


def _rect_inside(inner, outer, tolerance=1.0):
    return (inner["left"] >= outer["left"] - tolerance
            and inner["top"] >= outer["top"] - tolerance
            and inner["right"] <= outer["right"] + tolerance
            and inner["bottom"] <= outer["bottom"] + tolerance)


def test_map_panel_renders_rooms_from_api(game_page):
    """The MAP tab renders the room graph served by GET /api/map."""
    page = game_page
    _commit_move(page)
    _open_map_tab(page)

    expect(page.locator("#map-panel")).to_be_visible()
    expect(page.locator("#map-mode-toggle")).to_have_count(0)

    map_data = _fetch_map(page)
    assert map_data.get("rooms"), f"expected rooms in /api/map, got {map_data}"

    panel = page.locator("#map-panel")
    expect(panel).to_have_attribute("data-current-room-id", map_data["current_room_id"])
    assert page.locator(".map-room").count() >= 1, "the panel must render a room node per room"

    # Every edge carries the route-matching key and rooms expose the two-tier
    # naming contract (compact canvas label + full name attribute).
    edge_keys = page.eval_on_selector_all(
        ".map-edge[data-edge-key]", "els => els.map(el => el.getAttribute('data-edge-key'))"
    )
    expected_keys = {
        f"{edge['from']}|{edge['direction'] if edge['direction'] is not None else ''}|{edge['to']}"
        for edge in map_data["edges"]
    }
    assert set(edge_keys) == expected_keys, (edge_keys, expected_keys)
    for key in edge_keys:
        assert key.count("|") == 2, key

    full_name = page.locator(".map-room").first.get_attribute("data-full-name")
    compact = page.locator(".map-room").first.locator(".map-room-name").inner_text()
    assert full_name, "rooms must store the full untruncated name"
    assert len(compact) <= 16, compact


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
    expect(highlight.locator(".map-room-meta")).to_contain_text("CURRENT")


def test_map_empty_state(game_page):
    """An empty graph renders an empty state rather than an error."""
    page = game_page
    _mock_map(page, {
        "rooms": [],
        "edges": [],
        "regions": [],
        "current_room_id": None,
    })

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

# Same graph, but the party starts in r1 so a route to r3 has a walkable path.
ROUTE_FIXTURE = copy.deepcopy(P6_FIXTURE)
ROUTE_FIXTURE["current_room_id"] = "r1"


def _dense_fixture(room_count=64):
    rooms = [{"id": "hub", "name": "Grand Central Nexus",
              "first_turn": 1, "last_visit_turn": room_count, "visit_count": room_count}]
    edges = []
    for index in range(1, room_count):
        room_id = f"n{index}"
        rooms.append({
            "id": room_id,
            "name": f"Winding Passage {index}",
            "first_turn": index,
            "last_visit_turn": index,
            "visit_count": 1,
        })
        edges.append({"from": "hub", "direction": "north", "to": room_id,
                      "kind": "walk", "inferred": 0})
    return {
        "rooms": rooms,
        "edges": edges,
        "regions": [{"room_ids": [room["id"] for room in rooms]}],
        "current_room_id": "hub",
    }


def _open_fixture_map(page, fixture=P6_FIXTURE):
    _mock_map(page, fixture)
    _commit_move(page, "look around")
    _open_map_tab(page)
    expect(page.locator(".map-room")).to_have_count(len(fixture["rooms"]))


def test_map_panel_fits_sidebar_and_centres_current_room(game_page):
    """The camera model keeps the graph inside the panel and the current room in view.

    Regression for the P6 defect: the old renderer sized the scroll box
    (#map-canvas) instead of a content layer inside it, so the box grew past
    #tab-map. The gravitational renderer instead transforms a bounded world
    layer and frames the current room with the camera.
    """
    page = game_page
    _open_fixture_map(page)

    tab = page.locator("#tab-map").bounding_box()
    canvas = _canvas_rect(page)
    assert canvas["right"] <= tab["x"] + tab["width"] + 0.5, (canvas, tab)
    assert canvas["bottom"] <= tab["y"] + tab["height"] + 0.5, (canvas, tab)

    # The current room (region 3) is inside the visible viewport without panning.
    current = _room_rect(page, "r4")
    assert _rect_inside(current, canvas), (current, canvas)

    # FIT frames every room inside the viewport.
    page.locator("#map-fit").click()
    page.wait_for_timeout(100)
    canvas = _canvas_rect(page)
    for room_id in ("r1", "r2", "r3", "r4"):
        assert _rect_inside(_room_rect(page, room_id), canvas), room_id

    # Resize re-centers on the current room without losing data or pins.
    page.set_viewport_size({"width": 900, "height": 900})
    page.wait_for_timeout(450)  # debounced re-layout is 150 ms
    canvas = _canvas_rect(page)
    assert _rect_inside(_room_rect(page, "r4"), canvas)
    assert page.locator(".map-room").count() == 4


def test_map_hover_dwell_opens_card_and_dims_neighbours(game_page):
    """A 200 ms fine-pointer dwell opens the full-name card and dims non-neighbours."""
    page = game_page
    _open_fixture_map(page)

    page.clock.install()
    page.evaluate(
        """() => {
            const node = document.querySelector('.map-room[data-room-id="r1"]');
            node.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
        }"""
    )

    page.clock.run_for(180)
    expect(page.locator("#map-hover-card")).to_be_hidden()

    page.clock.run_for(40)
    card = page.locator("#map-hover-card")
    expect(card).to_be_visible()
    expect(card).to_contain_text("North Hall")
    expect(card).to_contain_text("VISITED")
    expect(card).to_contain_text("Region 1")

    assert page.eval_on_selector("#map-canvas", "el => el.classList.contains('has-hover')")
    expect(page.locator(".map-room.is-neighbor")).to_have_count(1)

    # The reverse edge r2 -> r1 and the forward r1 -> r2 are both adjacent.
    assert page.locator(".map-edge.is-neighbor").count() == 2

    # Moving onto the card within the 150 ms grace keeps it open.
    page.evaluate(
        """() => {
            const node = document.querySelector('.map-room[data-room-id="r1"]');
            const card = document.getElementById('map-hover-card');
            node.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }));
            card.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        }"""
    )
    page.clock.run_for(200)
    expect(card).to_be_visible()

    # Leaving the node dismisses the card after the 150 ms grace period.
    page.evaluate(
        """() => {
            const node = document.querySelector('.map-room[data-room-id="r1"]');
            const card = document.getElementById('map-hover-card');
            node.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }));
            card.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
        }"""
    )
    page.clock.run_for(200)
    expect(card).to_be_hidden()
    assert not page.eval_on_selector("#map-canvas", "el => el.classList.contains('has-hover')")


def test_map_fast_sweep_does_not_open_hover_card(game_page):
    """A sweep faster than the dwell threshold never pins or opens the card."""
    page = game_page
    _open_fixture_map(page)

    page.clock.install()
    # Simulate a sub-200 ms sweep across r1 then r2 and off the canvas in one
    # JS task. Playwright's locator.hover() advances the fake clock during
    # actionability waits, which would defeat the dwell-threshold assertion.
    page.evaluate(
        """() => {
            const a = document.querySelector('.map-room[data-room-id="r1"]');
            const b = document.querySelector('.map-room[data-room-id="r2"]');
            a.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
            a.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: b }));
            b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse', relatedTarget: a }));
            b.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }));
        }"""
    )
    page.clock.run_for(400)

    expect(page.locator("#map-hover-card")).to_be_hidden()
    expect(page.locator(".map-canvas.has-hover")).to_have_count(0)


def test_map_drag_pins_node_in_memory_and_dblclick_unpins(game_page):
    """Dragging pins a session-only homeAnchor; a desktop dblclick unpins it."""
    page = game_page
    _open_fixture_map(page)

    node = page.locator('.map-room[data-room-id="r2"]')
    box = node.bounding_box()
    start_x = box["x"] + box["width"] / 2
    start_y = box["y"] + box["height"] / 2

    page.mouse.move(start_x, start_y)
    page.mouse.down()
    # Drag inward (left/up) so the orb stays inside the visible viewport; a
    # node dragged under the clipped canvas edge cannot be clicked afterwards.
    page.mouse.move(start_x - 35, start_y - 25, steps=10)
    page.mouse.up()

    expect(node).to_have_attribute("data-pinned", "true")
    assert page.evaluate(
        """() => Object.keys(localStorage).filter(k => /map|pin|node|coord/i.test(k))"""
    ) == [], "pins must never be persisted to localStorage"

    page.locator('.map-room[data-room-id="r2"]').dblclick()
    expect(page.locator('.map-room[data-room-id="r2"]')).to_have_attribute("data-pinned", "false")


def test_map_pan_zoom_and_fit_controls(game_page):
    """Toolbar zoom, cursor-anchored wheel zoom, panning and FIT all move the camera."""
    page = game_page
    _open_fixture_map(page)

    canvas = _canvas_rect(page)
    zoom_before = float(page.locator("#map-canvas").get_attribute("data-zoom"))

    page.locator("#map-zoom-in").click()
    zoom_in = float(page.locator("#map-canvas").get_attribute("data-zoom"))
    assert zoom_in > zoom_before

    page.locator("#map-zoom-out").click()
    zoom_out = float(page.locator("#map-canvas").get_attribute("data-zoom"))
    assert zoom_out < zoom_in

    page.mouse.move(canvas["left"] + canvas["width"] / 2, canvas["top"] + canvas["height"] / 2)
    page.mouse.wheel(0, -240)
    page.wait_for_timeout(100)
    zoom_wheel = float(page.locator("#map-canvas").get_attribute("data-zoom"))
    assert zoom_wheel > zoom_out, "wheel-up must zoom in around the cursor"

    transform_before = page.locator("#map-canvas-content").get_attribute("style")
    page.mouse.move(canvas["left"] + 30, canvas["top"] + canvas["height"] - 30)
    page.mouse.down()
    page.mouse.move(canvas["left"] + 90, canvas["top"] + canvas["height"] - 70, steps=8)
    page.mouse.up()
    transform_after = page.locator("#map-canvas-content").get_attribute("style")
    assert transform_after != transform_before, "background drag must pan the camera"

    page.locator("#map-fit").click()
    page.wait_for_timeout(100)
    fitted = _canvas_rect(page)
    for room_id in ("r1", "r2", "r3", "r4"):
        assert _rect_inside(_room_rect(page, room_id), fitted), room_id


def test_map_keyboard_inspector_open_and_escape(game_page):
    """Focused nodes open the inspector with Enter; Escape closes it."""
    page = game_page
    _open_fixture_map(page)

    node = page.locator('.map-room[data-room-id="r3"]')
    node.focus()
    page.keyboard.press("Enter")

    inspector = page.locator("#map-inspector")
    expect(inspector).to_be_visible()
    expect(page.locator("#map-inspector-title")).to_have_text("Vault of Echoes")
    expect(inspector).to_contain_text("Region 2")
    expect(inspector).to_contain_text("archway")
    expect(inspector.locator('[data-action="route"]')).to_be_visible()

    page.keyboard.press("Escape")
    expect(inspector).to_be_hidden()


def test_map_mobile_inspector_bottom_sheet_and_suppressed_hover(game_page):
    """Mobile renders a docked bottom sheet and never opens the hover card."""
    page = game_page
    page.set_viewport_size({"width": 390, "height": 844})
    _mock_map(page, P6_FIXTURE)
    _commit_move(page, "look around")
    _open_map_tab_mobile(page)
    expect(page.locator(".map-room")).to_have_count(4)

    # Mobile canvas fills the pane instead of collapsing to a 200px strip.
    canvas_box = page.locator("#map-canvas").bounding_box()
    assert canvas_box["height"] >= 420, canvas_box

    # Hover is suppressed below the desktop breakpoint even with a fine pointer.
    page.locator('.map-room[data-room-id="r1"]').hover()
    page.wait_for_timeout(350)
    expect(page.locator("#map-hover-card")).to_be_hidden()

    page.locator('.map-room[data-room-id="r3"]').click()
    inspector = page.locator("#map-inspector")
    expect(inspector).to_be_visible()
    expect(page.locator("#map-inspector-title")).to_have_text("Vault of Echoes")

    box = inspector.bounding_box()
    assert box["width"] >= 380, box
    assert box["y"] + box["height"] >= 844 - 60, "bottom sheet must dock near the viewport bottom"

    page.keyboard.press("Escape")
    expect(inspector).to_be_hidden()


def test_map_mobile_panel_fits_above_tab_bar(mobile_game_page):
    """375x812 fresh mobile load: panel + canvas fit above the tab bar."""
    page = mobile_game_page
    _mock_map(page, P6_FIXTURE)
    _commit_move(page, "look around")
    _open_map_tab_mobile(page)
    expect(page.locator(".map-room")).to_have_count(4)

    tab = page.locator("#tab-map").bounding_box()
    tab_bar = page.locator("#mobile-tab-bar").bounding_box()
    canvas = _canvas_rect(page)

    tab_rect = {
        "left": tab["x"], "top": tab["y"],
        "right": tab["x"] + tab["width"], "bottom": tab["y"] + tab["height"],
    }

    assert tab["y"] >= -0.5, tab
    assert tab_rect["bottom"] <= tab_bar["y"] + 0.5, (tab, tab_bar)
    assert _rect_inside(canvas, tab_rect), (canvas, tab_rect)
    assert canvas["height"] >= 250, canvas
    for room_id in ("r1", "r2", "r3", "r4"):
        room = _room_rect(page, room_id)
        assert _rect_inside(room, tab_rect), (room_id, room, tab_rect)
    assert _rect_inside(_room_rect(page, "r4"), tab_rect), "current room is clipped"


def test_map_route_highlights_reachable_path(game_page):
    """ROUTE HERE matches /api/path steps (including direction: null) to edges."""
    page = game_page
    _mock_path(page, {
        "found": True,
        "from_room_id": "r1",
        "to_room_id": "r3",
        "step_count": 2,
        "steps": [
            {"from_room_id": "r1", "direction": "east", "to_room_id": "r2"},
            {"from_room_id": "r2", "direction": "archway", "to_room_id": "r3"},
        ],
        "reason": None,
    })
    _open_fixture_map(page, ROUTE_FIXTURE)

    page.locator('.map-room[data-room-id="r3"]').click()
    expect(page.locator("#map-inspector")).to_be_visible()
    page.locator('#map-inspector [data-action="route"]').click()

    expect(page.locator(".map-edge-route")).to_have_count(2)
    status = page.locator("#map-inspector-route-status")
    expect(status).to_have_attribute("aria-live", "polite")
    expect(status).to_contain_text("2 steps")
    expect(status).to_contain_text("east")
    expect(status).to_contain_text("archway")


def test_map_route_unreachable_shows_reason_without_edges(game_page):
    """A found:false route paints no stale edges and explains why."""
    page = game_page
    _mock_path(page, {
        "found": False,
        "from_room_id": "r1",
        "to_room_id": "r4",
        "step_count": 0,
        "steps": [],
        "reason": "different_region",
    })
    _open_fixture_map(page, ROUTE_FIXTURE)

    page.locator('.map-room[data-room-id="r4"]').click()
    page.locator('#map-inspector [data-action="route"]').click()

    expect(page.locator(".map-edge-route")).to_have_count(0)
    expect(page.locator("#map-inspector-route-status")).to_contain_text("different region")


def test_map_route_404_shows_inline_reason(game_page):
    """A 404 from /api/path is surfaced inline without painting route edges."""
    page = game_page
    _mock_path(page, {"error": "Room 'ghost' not found."}, status=404)
    _open_fixture_map(page, ROUTE_FIXTURE)

    page.locator('.map-room[data-room-id="r3"]').click()
    page.locator('#map-inspector [data-action="route"]').click()

    expect(page.locator(".map-edge-route")).to_have_count(0)
    expect(page.locator("#map-inspector-route-status")).to_contain_text("404")


def test_map_refresh_keeps_inspector_and_clears_route(game_page):
    """A keyed turn refresh preserves the open inspector and clears stale routes."""
    page = game_page
    _mock_path(page, {
        "found": True,
        "from_room_id": "r1",
        "to_room_id": "r3",
        "step_count": 2,
        "steps": [
            {"from_room_id": "r1", "direction": "east", "to_room_id": "r2"},
            {"from_room_id": "r2", "direction": "archway", "to_room_id": "r3"},
        ],
        "reason": None,
    })
    _open_fixture_map(page, ROUTE_FIXTURE)

    page.locator('.map-room[data-room-id="r3"]').click()
    page.locator('#map-inspector [data-action="route"]').click()
    expect(page.locator(".map-edge-route")).to_have_count(2)

    # Re-activating the tab forces refreshMapPanel() against the same payload.
    page.locator("#tab-btn-map").click()
    page.wait_for_timeout(500)

    expect(page.locator(".map-edge-route")).to_have_count(0)
    expect(page.locator("#map-inspector")).to_be_visible()
    expect(page.locator("#map-inspector-title")).to_have_text("Vault of Echoes")
    assert page.locator(".map-room").count() == 4


def test_map_pinch_zoom_on_touch_pointers(game_page):
    """Two-pointer spread zooms the camera around the pinch midpoint."""
    page = game_page
    _open_fixture_map(page)
    canvas = _canvas_rect(page)
    zoom_before = float(page.locator("#map-canvas").get_attribute("data-zoom"))

    page.evaluate(
        """({cx, cy}) => {
            const canvas = document.getElementById('map-canvas');
            const send = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
                bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch',
                clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
            }));
            send('pointerdown', 1, cx - 40, cy);
            send('pointerdown', 2, cx + 40, cy);
            send('pointermove', 1, cx - 90, cy);
            send('pointermove', 2, cx + 90, cy);
            send('pointerup', 1, cx - 90, cy);
            send('pointerup', 2, cx + 90, cy);
        }""",
        {"cx": canvas["left"] + canvas["width"] / 2, "cy": canvas["top"] + canvas["height"] / 2},
    )
    zoom_after = float(page.locator("#map-canvas").get_attribute("data-zoom"))
    assert zoom_after > zoom_before, (zoom_before, zoom_after)


def test_map_route_matches_direction_null_step(game_page):
    """A `direction: null` (onward) step matches its `data-edge-key` edge."""
    page = game_page
    fixture = copy.deepcopy(P6_FIXTURE)
    fixture["current_room_id"] = "r3"
    _mock_path(page, {
        "found": True,
        "from_room_id": "r3",
        "to_room_id": "r4",
        "step_count": 1,
        "steps": [{"from_room_id": "r3", "direction": None, "to_room_id": "r4"}],
        "reason": None,
    })
    _open_fixture_map(page, fixture)

    page.locator('.map-room[data-room-id="r4"]').click()
    page.locator('#map-inspector [data-action="route"]').click()

    expect(page.locator(".map-edge-route")).to_have_count(1)
    assert page.locator(".map-edge-route").get_attribute("data-edge-key") == "r3||r4"
    expect(page.locator("#map-inspector-route-status")).to_contain_text("1 step")


def test_map_refresh_closes_inspector_for_removed_room(game_page):
    """An undo/refresh that removes the inspected room closes the inspector."""
    page = game_page
    state = {"fixture": copy.deepcopy(P6_FIXTURE)}
    page.route(
        "**/api/map",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(state["fixture"]),
        ),
    )
    _commit_move(page, "look around")
    _open_map_tab(page)
    expect(page.locator(".map-room")).to_have_count(4)

    page.locator('.map-room[data-room-id="r3"]').click()
    expect(page.locator("#map-inspector")).to_be_visible()

    # The room vanishes from the next payload.
    state["fixture"] = {
        "rooms": [room for room in P6_FIXTURE["rooms"] if room["id"] != "r3"],
        "edges": [
            edge for edge in P6_FIXTURE["edges"]
            if edge["from"] != "r3" and edge["to"] != "r3"
        ],
        "regions": [{"room_ids": ["r1", "r2"]}, {"room_ids": ["r4"]}],
        "current_room_id": "r4",
    }
    page.locator("#tab-btn-map").click()
    page.wait_for_timeout(600)

    expect(page.locator("#map-inspector")).to_be_hidden()
    expect(page.locator(".map-room")).to_have_count(3)
    expect(page.locator('.map-room[data-room-id="r3"]')).to_have_count(0)


def test_map_hover_card_available_under_reduced_motion(game_page):
    """prefers-reduced-motion disables animation but never the hover information."""
    page = game_page
    page.emulate_media(reduced_motion="reduce")
    _open_fixture_map(page)

    page.clock.install()
    page.evaluate(
        """() => {
            const node = document.querySelector('.map-room[data-room-id="r1"]');
            node.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
        }"""
    )
    page.clock.run_for(260)

    expect(page.locator("#map-hover-card")).to_be_visible()
    expect(page.locator("#map-hover-card")).to_contain_text("North Hall")


def test_map_inspector_exit_chip_jumps_to_neighbour(game_page):
    """Activating an exit chip centers and inspects the target room."""
    page = game_page
    _open_fixture_map(page)

    page.locator('.map-room[data-room-id="r2"]').click()
    expect(page.locator("#map-inspector-title")).to_have_text("Gallery")

    chip = page.locator('#map-inspector .map-exit-chip[data-target-id="r3"]').first
    expect(chip).to_be_visible()
    chip.click()

    expect(page.locator("#map-inspector")).to_be_visible()
    expect(page.locator("#map-inspector-title")).to_have_text("Vault of Echoes")
    canvas = _canvas_rect(page)
    assert _rect_inside(_room_rect(page, "r3"), canvas)


def test_map_inspector_unpin_button(game_page):
    """The inspector's Unpin button removes the session pin."""
    page = game_page
    _open_fixture_map(page)

    node = page.locator('.map-room[data-room-id="r2"]')
    box = node.bounding_box()
    x = box["x"] + box["width"] / 2
    y = box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x - 30, y - 20, steps=8)
    page.mouse.up()
    expect(page.locator('.map-room[data-room-id="r2"]')).to_have_attribute("data-pinned", "true")

    page.locator('.map-room[data-room-id="r2"]').click()
    unpin = page.locator('#map-inspector [data-action="unpin"]')
    expect(unpin).to_be_visible()
    unpin.click()

    expect(page.locator('.map-room[data-room-id="r2"]')).to_have_attribute("data-pinned", "false")


# ─── PATCH-01 reproductions ───────────────────────────────────────────────

def test_map_fit_survives_noop_resize_and_preserves_manual_pan(game_page):
    """Initial FIT / user pan must not be overwritten by a no-op ResizeObserver."""
    page = game_page
    _open_fixture_map(page)

    expect(page.locator("#map-center")).to_have_text("◎")

    page.locator("#map-fit").click()
    page.wait_for_timeout(80)
    fitted = page.locator("#map-canvas-content").get_attribute("style")

    # A no-op resize event (same dimensions) must not recenter the camera.
    page.evaluate("() => window.dispatchEvent(new Event('resize'))")
    page.wait_for_timeout(350)
    assert page.locator("#map-canvas-content").get_attribute("style") == fitted, \
        "a no-op resize overwrote the FIT camera"

    # A manual pan must survive a real viewport resize.
    canvas = _canvas_rect(page)
    page.mouse.move(canvas["left"] + 30, canvas["top"] + canvas["height"] - 30)
    page.mouse.down()
    page.mouse.move(canvas["left"] + 90, canvas["top"] + canvas["height"] - 70, steps=8)
    page.mouse.up()
    panned = page.locator("#map-canvas-content").get_attribute("style")

    page.set_viewport_size({"width": 1180, "height": 720})
    page.wait_for_timeout(450)
    assert page.locator("#map-canvas-content").get_attribute("style") == panned, \
        "resize discarded the user's manual pan"
    assert page.locator(".map-room").count() == 4


def test_map_tap_hits_small_orb_at_low_zoom(game_page):
    """Coarse/touch taps hit a 44 px screen target; desktop mouse pans instead."""
    page = game_page
    _open_fixture_map(page)

    for _ in range(8):
        page.locator("#map-zoom-out").click()
    page.wait_for_timeout(100)
    zoom = float(page.locator("#map-canvas").get_attribute("data-zoom"))
    assert zoom <= 0.35, zoom

    target = page.evaluate(
        """() => {
            const rooms = [...document.querySelectorAll('.map-room')].map(el => {
                const r = el.getBoundingClientRect();
                return { id: el.getAttribute('data-room-id'),
                         name: el.getAttribute('data-full-name'),
                         x: r.left + r.width / 2, y: r.top + r.height / 2 };
            });
            const r1 = rooms.find(room => room.id === 'r1');
            const clickX = r1.x;
            const clickY = r1.y + 18;  // outside the scaled orb, inside a 44px target
            const nearest = rooms.reduce((best, room) => {
                const d = Math.hypot(room.x - clickX, room.y - clickY);
                return (!best || d < best.d) ? { ...room, d } : best;
            }, null);
            return { clickX, clickY, name: nearest.name, distance: nearest.d };
        }"""
    )
    assert target["distance"] <= 22, target

    # Coarse/touch pointer: the screen-space fallback selects the nearest orb.
    page.evaluate(
        """({x, y}) => {
            const canvas = document.getElementById('map-canvas');
            const send = type => canvas.dispatchEvent(new PointerEvent(type, {
                bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch',
                clientX: x, clientY: y, button: 0,
                buttons: type === 'pointerdown' ? 1 : 0,
            }));
            send('pointerdown');
            send('pointerup');
        }""",
        {"x": target["clickX"], "y": target["clickY"]},
    )
    expect(page.locator("#map-inspector")).to_be_visible()
    expect(page.locator("#map-inspector-title")).to_have_text(target["name"])
    page.keyboard.press("Escape")
    expect(page.locator("#map-inspector")).to_be_hidden()

    # Desktop mouse: an off-node grab must pan the canvas, not drag the orb.
    transform_before = page.locator("#map-canvas-content").get_attribute("style")
    page.mouse.move(target["clickX"], target["clickY"])
    page.mouse.down()
    page.mouse.move(target["clickX"] + 50, target["clickY"] - 30, steps=8)
    page.mouse.up()
    transform_after = page.locator("#map-canvas-content").get_attribute("style")
    assert transform_after != transform_before, "desktop off-node drag must pan the camera"
    expect(page.locator("#map-inspector")).to_be_hidden()
    assert page.locator('.map-room[data-pinned="true"]').count() == 0


def test_map_switching_nodes_clears_route_status(game_page):
    """Switching inspected rooms clears stale route status text."""
    page = game_page
    _mock_path(page, {
        "found": True,
        "from_room_id": "r1",
        "to_room_id": "r3",
        "step_count": 2,
        "steps": [
            {"from_room_id": "r1", "direction": "east", "to_room_id": "r2"},
            {"from_room_id": "r2", "direction": "archway", "to_room_id": "r3"},
        ],
        "reason": None,
    })
    _open_fixture_map(page, ROUTE_FIXTURE)

    page.locator('.map-room[data-room-id="r3"]').click()
    page.locator('#map-inspector [data-action="route"]').click()
    status = page.locator("#map-inspector-route-status")
    expect(status).to_contain_text("2 steps")

    page.locator('.map-room[data-room-id="r2"]').click()
    expect(page.locator("#map-inspector-title")).to_have_text("Gallery")
    assert status.inner_text() == "", "stale route status leaked onto the next room"


def test_map_inspector_stays_below_top_margin(game_page):
    """The desktop inspector never overlaps the top status bar."""
    page = game_page
    _open_fixture_map(page)

    page.locator('.map-room[data-room-id="r2"]').click()
    expect(page.locator("#map-inspector")).to_be_visible()
    box = page.locator("#map-inspector").bounding_box()
    assert box["y"] >= 108, f"inspector top {box['y']} overlaps the top toolbar"
    assert box["y"] + box["height"] <= 720 - 8 + 0.5, box


def test_map_dense_graph_culls_colliding_labels(game_page):
    """A 24-room graph culls lower-priority labels instead of stacking text."""
    page = game_page
    rooms = [{"id": "hub", "name": "Grand Central Nexus", "first_turn": 1, "last_visit_turn": 9, "visit_count": 9}]
    edges = []
    for index in range(1, 24):
        room_id = f"n{index}"
        rooms.append({
            "id": room_id,
            "name": f"Winding Passage {index}",
            "first_turn": index,
            "last_visit_turn": index,
            "visit_count": 1,
        })
        edges.append({"from": "hub", "direction": "north", "to": room_id, "kind": "walk", "inferred": 0})
    fixture = {
        "rooms": rooms,
        "edges": edges,
        "regions": [{"room_ids": [room["id"] for room in rooms]}],
        "current_room_id": "hub",
    }
    _mock_map(page, fixture)
    _commit_move(page, "look around")
    _open_map_tab(page)
    expect(page.locator(".map-room")).to_have_count(24)
    page.wait_for_timeout(250)  # label culling runs on requestAnimationFrame

    assert page.locator(".map-room-name.is-label-culled").count() > 0, \
        "dense graphs must cull colliding labels"
    expect(page.locator('.map-room[data-room-id="hub"] .map-room-name')).not_to_have_class(
        "map-room-name is-label-culled"
    )
    overlaps = page.evaluate(
        """() => {
            const rects = [...document.querySelectorAll('.map-room-name')]
                .filter(el => !el.classList.contains('is-label-culled'))
                .map(el => el.getBoundingClientRect());
            let overlaps = 0;
            for (let i = 0; i < rects.length; i += 1) {
                for (let j = i + 1; j < rects.length; j += 1) {
                    const a = rects[i];
                    const b = rects[j];
                    if (!(a.right <= b.left || b.right <= a.left
                        || a.bottom <= b.top || b.bottom <= a.top)) overlaps += 1;
                }
            }
            return overlaps;
        }"""
    )
    assert overlaps == 0, f"{overlaps} visible labels overlap"


# ─── PATCH-03 reproductions ───────────────────────────────────────────────

def test_map_culling_is_debounced_and_uses_cached_metrics(game_page):
    """A 64-room graph must not re-measure/re-cull labels on every wheel frame."""
    page = game_page
    _mock_map(page, _dense_fixture(64))
    _commit_move(page, "look around")
    _open_map_tab(page)
    expect(page.locator(".map-room")).to_have_count(64)
    page.wait_for_timeout(400)  # initial cull settles

    runs_before = int(page.locator("#map-canvas").get_attribute("data-cull-runs") or 0)
    page.evaluate(
        """() => {
            window.__labelRects = 0;
            const original = Element.prototype.getBoundingClientRect;
            Element.prototype.getBoundingClientRect = function () {
                if (this.matches?.('.map-room-name, .map-room-meta, .map-edge-label')) {
                    window.__labelRects += 1;
                }
                return original.call(this);
            };
        }"""
    )

    canvas = _canvas_rect(page)
    page.evaluate(
        """({x, y}) => {
            const canvas = document.getElementById('map-canvas');
            for (let i = 0; i < 12; i += 1) {
                canvas.dispatchEvent(new WheelEvent('wheel', {
                    bubbles: true, cancelable: true, deltaY: -45,
                    clientX: x, clientY: y,
                }));
            }
        }""",
        {"x": canvas["left"] + canvas["width"] / 2, "y": canvas["top"] + canvas["height"] / 2},
    )

    runs_during = int(page.locator("#map-canvas").get_attribute("data-cull-runs") or 0)
    reads_during = page.evaluate("() => window.__labelRects")
    assert runs_during == runs_before, "culling must be debounced during a wheel gesture"
    assert reads_during == 0, f"wheel frames read {reads_during} label rects"

    page.wait_for_timeout(350)
    runs_after = int(page.locator("#map-canvas").get_attribute("data-cull-runs") or 0)
    reads_after = page.evaluate("() => window.__labelRects")
    assert runs_after == runs_before + 1, (runs_before, runs_during, runs_after)
    assert reads_after == 0, f"settled cull read {reads_after} label rects instead of using cache"


def test_map_mobile_inspector_pans_covered_node_above_sheet(mobile_game_page):
    """Tapping a node hidden behind the bottom sheet pans it into view."""
    page = mobile_game_page
    _mock_map(page, _dense_fixture(15))
    _commit_move(page, "look around")
    _open_map_tab_mobile(page)
    expect(page.locator(".map-room")).to_have_count(15)

    # The hub has 14 exits, so its bottom sheet is tall enough to cover the
    # centre of the canvas — exactly the citadel failure mode.
    target = {"id": "hub"}
    page.locator('.map-room[data-room-id="hub"]').click()
    inspector = page.locator("#map-inspector")
    expect(inspector).to_be_visible()

    node = _room_rect(page, target["id"])
    sheet = inspector.bounding_box()
    assert node["bottom"] <= sheet["y"] - 8, (target, node, sheet)


def test_map_inspector_clamps_left_of_desktop_sidebar(game_page):
    """The desktop inspector never covers sidebar tabs or map controls."""
    page = game_page
    _open_fixture_map(page)

    page.locator('.map-room[data-room-id="r2"]').click()
    expect(page.locator("#map-inspector")).to_be_visible()
    inspector = page.locator("#map-inspector").bounding_box()
    sidebar = page.locator(".sidebar-panel").bounding_box()
    assert inspector["x"] + inspector["width"] <= sidebar["x"] - 8 + 0.5, (inspector, sidebar)


def test_map_colliding_room_names_render_distinct_labels(game_page):
    """Shared prefixes/non-digit suffixes get unique compact labels at render time."""
    page = game_page
    fixture = {
        "rooms": [
            {"id": "bells", "name": "Chapel of Quiet Bells", "first_turn": 1, "last_visit_turn": 1, "visit_count": 1},
            {"id": "waters", "name": "Chapel of Quiet Waters", "first_turn": 2, "last_visit_turn": 2, "visit_count": 1},
            {"id": "tunnel-b", "name": "Sector 7 Maintenance Tunnel B", "first_turn": 3, "last_visit_turn": 3, "visit_count": 1},
            {"id": "tunnel-c", "name": "Sector 7 Maintenance Tunnel C", "first_turn": 4, "last_visit_turn": 4, "visit_count": 1},
        ],
        "edges": [
            {"from": "bells", "direction": "east", "to": "waters", "kind": "walk", "inferred": 0},
            {"from": "waters", "direction": "east", "to": "tunnel-b", "kind": "walk", "inferred": 0},
            {"from": "tunnel-b", "direction": "east", "to": "tunnel-c", "kind": "walk", "inferred": 0},
        ],
        "regions": [{"room_ids": ["bells", "waters", "tunnel-b", "tunnel-c"]}],
        "current_room_id": "bells",
    }
    _mock_map(page, fixture)
    _commit_move(page, "look around")
    _open_map_tab(page)
    expect(page.locator(".map-room")).to_have_count(4)

    labels = page.eval_on_selector_all(".map-room-name", "els => els.map(el => el.textContent)")
    assert len(set(labels)) == 4, labels
    assert all(len(label) <= 16 for label in labels), labels


# ─── PATCH-04 scopes A1/A2 ────────────────────────────────────────────────

def test_map_meta_never_outranks_culled_names(game_page):
    """VISITED captions must not survive when their own room name is culled."""
    page = game_page
    _mock_map(page, _dense_fixture(40))
    _commit_move(page, "look around")
    _open_map_tab(page)
    expect(page.locator(".map-room")).to_have_count(40)
    page.wait_for_timeout(350)

    assert page.locator(".map-room-name.is-label-culled").count() > 0, \
        "dense graph must cull some names"

    violations = page.evaluate(
        """() => {
            const bad = [];
            for (const room of document.querySelectorAll('.map-room')) {
                const id = room.getAttribute('data-room-id');
                if (id === 'hub') continue;
                const name = room.querySelector('.map-room-name');
                const meta = room.querySelector('.map-room-meta');
                if (name?.classList.contains('is-label-culled')
                    && !meta?.classList.contains('is-label-culled')) {
                    bad.push(id);
                }
            }
            return bad;
        }"""
    )
    assert violations == [], violations

    current = page.locator('.map-room[data-room-id="hub"] .map-room-meta')
    expect(current).to_contain_text("CURRENT")
    assert not current.evaluate("el => el.classList.contains('is-label-culled')"), \
        "◉ CURRENT must never be culled"


def test_map_hidden_render_refits_and_preserves_manual_pan(game_page):
    """A hidden-tab render must not leave a stale FIT camera."""
    page = game_page
    _open_fixture_map(page)
    page.wait_for_timeout(200)

    # Commit a turn while the map tab is hidden; the renderer measures the
    # hidden canvas (fallback size) during the post-turn refresh.
    page.locator("#tab-btn-lore").click()
    _commit_move(page, "look around")
    _open_map_tab(page)
    page.wait_for_timeout(250)
    zoom_after = float(page.locator("#map-canvas").get_attribute("data-zoom"))
    # Ground truth: the same graph's direct FIT zoom. We only click FIT after
    # measuring, so the assertion still proves the show path refit correctly.
    page.locator("#map-fit").click()
    page.wait_for_timeout(100)
    fit_zoom = float(page.locator("#map-canvas").get_attribute("data-zoom"))
    assert abs(zoom_after - fit_zoom) / fit_zoom <= 0.02, (zoom_after, fit_zoom)

    # A manual pan survives the same hidden-render/show cycle.
    canvas = _canvas_rect(page)
    page.mouse.move(canvas["left"] + 30, canvas["top"] + canvas["height"] - 30)
    page.mouse.down()
    page.mouse.move(canvas["left"] + 75, canvas["top"] + canvas["height"] - 60, steps=8)
    page.mouse.up()
    panned = page.locator("#map-canvas-content").get_attribute("style")

    page.locator("#tab-btn-lore").click()
    _commit_move(page, "look around")
    _open_map_tab(page)
    page.wait_for_timeout(250)
    assert page.locator("#map-canvas-content").get_attribute("style") == panned, \
        "showing the tab overrode a manual camera"
