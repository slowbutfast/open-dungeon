"""Restore-save manager E2E (gravitational-node-map PATCH-04).

Runs against an isolated OD_TMP_ROOT (the env knob web/server.js honors) and
seeds save JSON directly into <root>/local-dev/adventures. Covers sorting,
persistence, move-threshold prune preview/confirm, pagination and textContent
hardening of LLM-sourced save fields.
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import time

import pytest
from playwright.sync_api import expect

pytestmark = pytest.mark.e2e

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from tests.test_helpers import assert_save_dir_is_safe

TESTS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_ROOT = os.path.join(TESTS_DIR, ".tmp_od_root_restore")
TEST_SAVE_DIR = os.path.join(TEST_ROOT, "local-dev", "adventures")


def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


@pytest.fixture(scope="session", autouse=True)
def start_server():
    port = 5009
    if is_port_open(port):
        raise RuntimeError(
            f"Port {port} is already in use — please stop your server before running tests."
        )

    env = os.environ.copy()
    env.pop("SAVE_DIR", None)
    env["MOCK_LLM"] = "1"
    env["OD_TMP_ROOT"] = TEST_ROOT
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
        raise RuntimeError("Express server failed to start on port 5009")

    yield

    proc.terminate()
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        proc.kill()
    assert_save_dir_is_safe(TEST_ROOT)
    shutil.rmtree(TEST_ROOT, ignore_errors=True)


def _seed(saves):
    os.makedirs(TEST_SAVE_DIR, exist_ok=True)
    for name in os.listdir(TEST_SAVE_DIR):
        if name.endswith(".json"):
            os.remove(os.path.join(TEST_SAVE_DIR, name))
    for index, save in enumerate(saves):
        save_id = save["id"]
        payload = {
            "adventure_id": save_id,
            "title": save["title"],
            "location": save.get("location", "Test Room"),
            "summary": save.get("summary", f"{save['title']} summary"),
            "score": 0,
            "moves": save.get("moves", 0),
            "history": [],
            "archived_history": [],
        }
        path = os.path.join(TEST_SAVE_DIR, f"{save_id}.json")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle)
        mtime = save.get("mtime_s", 1_700_000_000 + index)
        os.utime(path, (mtime, mtime))


@pytest.fixture(scope="function")
def restore_page(page):
    page.goto("http://127.0.0.1:5009")
    page.wait_for_selector("#llm-status-pill:not(.llm-pill-checking)")
    return page


def _open_restore(page):
    page.keyboard.press("2")
    page.wait_for_selector("#restore-screen:not(.hidden)")


def _titles(page):
    return page.eval_on_selector_all("#save-list .save-item h4", "els => els.map(el => el.textContent)")


@pytest.fixture(autouse=True)
def clear_root_between_tests():
    shutil.rmtree(TEST_ROOT, ignore_errors=True)
    yield


def test_restore_sorts_and_persists_choice(restore_page):
    page = restore_page
    _seed([
        {"id": "z", "title": "Zebra 10", "moves": 5, "mtime_s": 1_700_000_300},
        {"id": "a", "title": "alpha 2", "moves": 20, "mtime_s": 1_700_000_100},
        {"id": "c", "title": "Alpha 11", "moves": 1, "mtime_s": 1_700_000_200},
    ])
    _open_restore(page)
    expect(page.locator("#save-list .save-item")).to_have_count(3)
    assert _titles(page) == ["Zebra 10", "Alpha 11", "alpha 2"]  # recent

    page.locator("#save-sort").select_option("alpha")
    assert _titles(page) == ["alpha 2", "Alpha 11", "Zebra 10"]

    page.reload()
    page.wait_for_selector("#llm-status-pill:not(.llm-pill-checking)")
    _open_restore(page)
    expect(page.locator("#save-sort")).to_have_value("alpha")
    assert _titles(page) == ["alpha 2", "Alpha 11", "Zebra 10"]

    page.locator("#save-sort").select_option("moves")
    assert _titles(page) == ["alpha 2", "Zebra 10", "Alpha 11"]
    expect(page.locator(".save-meta").first).to_contain_text("Moves: 20")


def test_restore_paginates_and_show_more(restore_page):
    page = restore_page
    _seed([
        {"id": f"s{i:03d}", "title": f"Save {i:03d}", "moves": i, "mtime_s": 1_700_000_000 + i}
        for i in range(60)
    ])
    _open_restore(page)
    expect(page.locator("#save-list .save-item")).to_have_count(50)
    more = page.locator("#btn-saves-more")
    expect(more).to_be_visible()
    expect(more).to_contain_text("10 remaining")
    more.click()
    expect(page.locator("#save-list .save-item")).to_have_count(60)
    expect(more).to_be_hidden()


def test_restore_prune_preview_and_confirm(restore_page):
    page = restore_page
    _seed([
        {"id": "low1", "title": "Low One", "moves": 1},
        {"id": "low2", "title": "Low Two", "moves": 2},
        {"id": "keep", "title": "Keeper", "moves": 5},
    ])
    _open_restore(page)
    expect(page.locator("#save-list .save-item")).to_have_count(3)

    page.locator("#save-prune-moves").fill("3")
    preview = page.locator("#save-prune-preview")
    expect(preview).to_contain_text("2 with < 3 moves", timeout=5000)

    page.locator("#btn-prune-saves").click()
    page.wait_for_selector("#modal-confirm:not(.hidden)")
    page.locator("#btn-confirm-yes").click()

    expect(page.locator("#save-list .save-item")).to_have_count(1)
    expect(page.locator("#save-list .save-item h4")).to_have_text("Keeper")
    assert sorted(name for name in os.listdir(TEST_SAVE_DIR) if name.endswith(".json")) == ["keep.json"]


def test_restore_renders_save_fields_as_text(restore_page):
    page = restore_page
    malicious = '<img src=x onerror="window.__xss=1">'
    _seed([
        {"id": "evil", "title": malicious, "moves": 1, "summary": malicious},
    ])
    _open_restore(page)
    expect(page.locator("#save-list .save-item")).to_have_count(1)
    expect(page.locator("#save-list .save-item h4")).to_have_text(malicious)
    assert page.locator("#save-list img").count() == 0
    assert page.evaluate("() => window.__xss") is None
