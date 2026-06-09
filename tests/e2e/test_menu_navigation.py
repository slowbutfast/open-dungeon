import os
import sys
import time
import socket
import subprocess
import re
import pytest
from playwright.sync_api import sync_playwright, expect

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

@pytest.fixture(scope="session", autouse=True)
def start_server():
    """Starts the Flask server in mock mode if it is not already running."""
    port = 5001
    proc = None
    if not is_port_open(port):
        env = os.environ.copy()
        env["MOCK_LLM"] = "1"  # Force mock mode for testing
        proc = subprocess.Popen(
            ["./venv/bin/python3", "web/server.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env
        )
        # Wait for the server to spin up
        for _ in range(50):
            if is_port_open(port):
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("Flask server failed to start on port 5001")
    
    yield
    
    if proc:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()

@pytest.fixture(scope="function")
def main_page(page):
    """Navigates to the main page and ensures a clean state."""
    page.goto("http://127.0.0.1:5001")
    # Wait for the status pill to check connection or mock status
    page.wait_for_selector("#llm-status-pill:not(.llm-pill-checking)")
    return page

def test_startup_menu_keyboard_navigation(main_page):
    """Validates keyboard focus highlights, wrap-around, and Enter key activation on Startup Screen."""
    btn_new = main_page.locator("#btn-new-game")
    btn_restore = main_page.locator("#btn-restore-game")
    btn_crt = main_page.locator("#btn-toggle-crt")
    
    # R1: Verify no button is highlighted or focused by default on startup
    expect(btn_new).not_to_have_class(re.compile(r"menu-focus"))
    expect(btn_restore).not_to_have_class(re.compile(r"menu-focus"))
    expect(btn_crt).not_to_have_class(re.compile(r"menu-focus"))
    
    # Press ArrowDown: Highlights first button
    main_page.keyboard.press("ArrowDown")
    expect(btn_new).to_have_class(re.compile(r"menu-focus"))
    expect(btn_restore).not_to_have_class(re.compile(r"menu-focus"))
    
    # Press ArrowDown: Highlights second button
    main_page.keyboard.press("ArrowDown")
    expect(btn_restore).to_have_class(re.compile(r"menu-focus"))
    expect(btn_new).not_to_have_class(re.compile(r"menu-focus"))
    
    # Press ArrowDown: Highlights third button
    main_page.keyboard.press("ArrowDown")
    expect(btn_crt).to_have_class(re.compile(r"menu-focus"))
    expect(btn_restore).not_to_have_class(re.compile(r"menu-focus"))
    
    # Press ArrowDown: Wrap around back to the first button
    main_page.keyboard.press("ArrowDown")
    expect(btn_new).to_have_class(re.compile(r"menu-focus"))
    expect(btn_crt).not_to_have_class(re.compile(r"menu-focus"))
    
    # Press ArrowUp: Wrap around backwards to the third button
    main_page.keyboard.press("ArrowUp")
    expect(btn_crt).to_have_class(re.compile(r"menu-focus"))
    expect(btn_new).not_to_have_class(re.compile(r"menu-focus"))
    
    # Press Enter on highlighted CRT button: Verify CRT class toggles
    body = main_page.locator("body")
    expect(body).to_have_class(re.compile(r"crt-effect"))
    
    main_page.keyboard.press("Enter")
    expect(body).not_to_have_class(re.compile(r"crt-effect"))
    expect(body).to_have_class(re.compile(r"theme-plain"))
    
    # Press Enter again to toggle it back
    main_page.keyboard.press("Enter")
    expect(body).to_have_class(re.compile(r"crt-effect"))

def test_startup_menu_hotkeys(main_page):
    """Validates instant hotkeys (1, 2, t/T) to navigate screens or toggle options."""
    # Press '1' to start a new game
    main_page.keyboard.press("1")
    expect(main_page.locator("#preset-screen")).to_have_class(re.compile(r"active"))
    expect(main_page.locator("#preset-screen")).not_to_have_class(re.compile(r"hidden"))
    
    # Press Escape to return to startup
    main_page.keyboard.press("Escape")
    expect(main_page.locator("#startup-screen")).to_have_class(re.compile(r"active"))
    
    # Press '2' to go to restore screen
    main_page.keyboard.press("2")
    expect(main_page.locator("#restore-screen")).to_have_class(re.compile(r"active"))
    
    # Press Escape to return
    main_page.keyboard.press("Escape")
    expect(main_page.locator("#startup-screen")).to_have_class(re.compile(r"active"))
    
    # Press 't' (lowercase) to toggle CRT scanlines
    body = main_page.locator("body")
    expect(body).to_have_class(re.compile(r"crt-effect"))
    main_page.keyboard.press("t")
    expect(body).not_to_have_class(re.compile(r"crt-effect"))
    
    # Press 'T' (uppercase) to toggle back
    main_page.keyboard.press("Shift+T")
    expect(body).to_have_class(re.compile(r"crt-effect"))

def test_preset_menu_navigation(main_page):
    """Validates Arrow navigation on Preset Cards and Enter confirmation."""
    main_page.keyboard.press("1")  # Enter Preset Screen
    main_page.wait_for_selector(".preset-card")
    
    btn_customize = main_page.locator("#btn-preset-customize")
    btn_next = main_page.locator("#btn-preset-next")
    expect(btn_customize).to_have_class(re.compile(r"hidden"))
    expect(btn_next).to_have_class(re.compile(r"hidden"))
    
    # Navigating presets with arrow keys
    main_page.keyboard.press("ArrowRight")
    cards = main_page.locator(".preset-card")
    expect(cards.nth(0)).to_have_class(re.compile(r"active"))
    expect(btn_customize).not_to_have_class(re.compile(r"hidden"))
    expect(btn_next).not_to_have_class(re.compile(r"hidden"))
    
    main_page.keyboard.press("ArrowRight")
    expect(cards.nth(1)).to_have_class(re.compile(r"active"))
    expect(cards.nth(0)).not_to_have_class(re.compile(r"active"))
    
    # Hit Enter on active preset card to navigate to Character screen
    main_page.keyboard.press("Enter")
    expect(main_page.locator("#character-screen")).to_have_class(re.compile(r"active"))

def test_custom_preset_navigation(main_page):
    """Validates configuring a Custom Adventure screen flow."""
    main_page.keyboard.press("1")  # Enter Preset Screen
    main_page.wait_for_selector(".preset-card")
    
    # Use mouse to click Custom Adventure
    main_page.locator("#btn-custom-preset").click()
    expect(main_page.locator("#custom-preset-screen")).to_have_class(re.compile(r"active"))
    
    # Fill in a custom title
    title_input = main_page.locator("#custom-title")
    title_input.fill("Playwright E2E Adventure")
    
    # Click Next
    main_page.locator("#btn-submit-custom-preset").click()
    expect(main_page.locator("#character-screen")).to_have_class(re.compile(r"active"))

def test_character_genesis_and_launch(main_page):
    """Validates selection, customizing character toggle, and launching state changes."""
    main_page.keyboard.press("1")
    main_page.wait_for_selector(".preset-card")
    main_page.keyboard.press("ArrowRight")
    main_page.keyboard.press("Enter")
    
    main_page.wait_for_selector(".char-card")
    char_cards = main_page.locator(".char-card")
    expect(char_cards.nth(0)).to_have_class(re.compile(r"active"))
    
    # Arrow navigation on characters
    main_page.keyboard.press("ArrowRight")
    expect(char_cards.nth(1)).to_have_class(re.compile(r"active"))
    expect(char_cards.nth(0)).not_to_have_class(re.compile(r"active"))
    
    # Toggle Custom Hero Genesis Form
    custom_toggle = main_page.locator("#btn-char-custom-toggle")
    custom_toggle.click()
    
    custom_form = main_page.locator("#custom-character-form")
    preset_section = main_page.locator("#preset-character-section")
    expect(custom_form).not_to_have_class(re.compile(r"hidden"))
    expect(preset_section).to_have_class(re.compile(r"hidden"))
    
    # Toggle back to preset characters list
    custom_toggle.click()
    expect(custom_form).to_have_class(re.compile(r"hidden"))
    expect(preset_section).not_to_have_class(re.compile(r"hidden"))
    
    # Click Launch Simulation: Verify loading state disabled buttons
    submit_btn = main_page.locator("#btn-submit-character")
    back_btn = main_page.locator("#btn-char-back")
    
    submit_btn.click()
    
    # R2 Acceptance Criteria: Disables and displays connecting text during connection init
    expect(submit_btn).to_be_disabled()
    expect(back_btn).to_be_disabled()
    expect(custom_toggle).to_be_disabled()
    expect(submit_btn).to_have_text("CONNECTING NEURAL LINK...")
    
    # Wait for gameplay screen to load
    main_page.wait_for_selector("#gameplay-screen:not(.hidden)", timeout=15000)
    expect(main_page.locator("#gameplay-screen")).to_have_class(re.compile(r"active"))
    
    # Ensure stats bar items exist
    expect(main_page.locator("#val-location")).to_be_visible()
    expect(main_page.locator("#val-score")).to_be_visible()
    expect(main_page.locator("#val-moves")).to_be_visible()

def test_gameplay_exit_and_save(main_page):
    """Validates escaping simulation, aborting, confirming exit, saving, and deletion."""
    # Launch new game session
    main_page.keyboard.press("1")
    main_page.wait_for_selector(".preset-card")
    main_page.keyboard.press("ArrowRight")
    main_page.keyboard.press("Enter")
    main_page.wait_for_selector(".char-card")
    main_page.locator("#btn-submit-character").click()
    main_page.wait_for_selector("#gameplay-screen:not(.hidden)", timeout=15000)
    
    # Click return to start menu button
    btn_menu = main_page.locator("#btn-menu")
    btn_menu.click()
    
    # Verify confirmation modal is shown
    confirm_modal = main_page.locator("#modal-confirm")
    expect(confirm_modal).not_to_have_class(re.compile(r"hidden"))
    
    # Click Cancel (No)
    main_page.locator("#btn-confirm-no").click()
    expect(confirm_modal).to_have_class(re.compile(r"hidden"))
    expect(main_page.locator("#gameplay-screen")).to_have_class(re.compile(r"active"))
    
    # Click return to start menu again
    btn_menu.click()
    expect(confirm_modal).not_to_have_class(re.compile(r"hidden"))
    
    # Click Confirm (Yes) -> Exits to startup screen
    main_page.locator("#btn-confirm-yes").click()
    expect(confirm_modal).to_have_class(re.compile(r"hidden"))
    expect(main_page.locator("#startup-screen")).to_have_class(re.compile(r"active"))
    
    # Go to Restore Screen to verify connection is preserved
    main_page.keyboard.press("2")
    main_page.wait_for_selector("#save-list")
    
    save_items = main_page.locator(".save-item")
    expect(save_items.first).to_be_visible()
    
    # Cleanup: Delete the newly created save slot
    delete_btn = save_items.first.locator(".btn-delete")
    delete_btn.click()
    
    # Accept the wipe warning popup
    expect(confirm_modal).not_to_have_class(re.compile(r"hidden"))
    main_page.locator("#btn-confirm-yes").click()
    expect(confirm_modal).to_have_class(re.compile(r"hidden"))
    
    # Wait for list to update to ensure deletion is processed
    time.sleep(0.5)
