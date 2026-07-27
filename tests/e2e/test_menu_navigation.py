import os
import sys
import time
import socket
import subprocess
import re
import shutil
import pytest
from playwright.sync_api import sync_playwright, expect

# Enable console logging for debugging
@pytest.fixture(scope="function")
def main_page(page):
    """Navigates to the main page and ensures a clean state."""
    errors = []
    page.on("console", lambda msg: errors.append(f"CONSOLE {msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: errors.append(f"PAGE ERROR: {err}"))
    page.goto("http://127.0.0.1:5001")
    # Wait for the status pill to check connection or mock status
    page.wait_for_selector("#llm-status-pill:not(.llm-pill-checking)")
    
    # Attach errors to page for test access
    page._test_errors = errors
    return page

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Isolated save directory for E2E tests
TEST_SAVE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "adventures")

def is_port_open(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

@pytest.fixture(scope="session", autouse=True)
def start_server():
    """Starts the Flask server in mock mode if it is not already running."""
    port = 5001
    proc = None
    if is_port_open(port):
        raise RuntimeError(
            f"Port {port} is already in use — please stop your server before running tests."
        )

    env = os.environ.copy()
    env["MOCK_LLM"] = "1"  # Force mock mode for testing
    env["SAVE_DIR"] = TEST_SAVE_DIR  # Isolate test saves
    proc = subprocess.Popen(
        ["node", "web/server.js"],
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
    
    # Clean up isolated test save directory and generated presets file
    if os.path.isdir(TEST_SAVE_DIR):
        shutil.rmtree(TEST_SAVE_DIR, ignore_errors=True)
    presets_file = os.path.join(os.path.dirname(TEST_SAVE_DIR), 'presets.json')
    if os.path.isfile(presets_file):
        os.remove(presets_file)

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
    main_page.wait_for_selector("#character-screen:not(.hidden)")
    expect(main_page.locator("#character-screen")).to_have_class(re.compile(r"active"))
    
    main_page.wait_for_selector(".char-card")

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
    main_page.wait_for_timeout(200)
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
    
    main_page.wait_for_selector(".char-card")
    
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
    main_page.wait_for_timeout(200)
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

def test_gameplay_console_lockouts_and_utility_loaders(main_page):
    """Validates loader text and element lockout states during lore scanning and system prompt saving."""
    # 1. Launch a new simulation game
    main_page.keyboard.press("1")
    main_page.wait_for_selector(".preset-card")
    main_page.keyboard.press("ArrowRight")
    main_page.wait_for_timeout(200)
    main_page.keyboard.press("Enter")
    main_page.wait_for_selector(".char-card")
    main_page.locator("#btn-submit-character").click()
    main_page.wait_for_selector("#gameplay-screen:not(.hidden)", timeout=15000)
    
    # 2. Test Lore Scan Button Loading State and Lockouts
    scan_btn = main_page.locator("#btn-scan")
    scan_btn.click()
    
    # Verify the button text changes to '/scan (scanning...)' and is disabled along with console input
    expect(scan_btn).to_be_disabled()
    expect(scan_btn).to_have_text("/scan (scanning...)")
    expect(main_page.locator("#console-input")).to_be_disabled()
    expect(main_page.locator("#btn-send")).to_be_disabled()
    
    # Wait for the scan to finish
    try:
        main_page.wait_for_selector("div.log-turn-system:has-text('Scan complete')", timeout=15000)
    except Exception as e:
        print("DIAGNOSTIC - CONSOLE LOG TEXT:", main_page.locator("#console-log").inner_text())
        raise e
    expect(scan_btn).to_be_enabled()
    expect(scan_btn).to_have_text("/scan")
    expect(main_page.locator("#console-input")).to_be_enabled()
    
    # 3. Test Save System Prompt Button Loading State and Lockouts
    main_page.locator("#btn-system-edit").click()
    main_page.wait_for_selector("#modal-system-prompt:not(.hidden)")
    
    save_prompt_btn = main_page.locator("#btn-save-system-prompt")
    save_prompt_btn.click()
    
    # Verify the button changes to '[APPLYING RULES...]' and is disabled
    expect(save_prompt_btn).to_be_disabled()
    expect(save_prompt_btn).to_have_text("[APPLYING RULES...]")
    
    # Wait for modal to close
    main_page.wait_for_selector("#modal-system-prompt", state="hidden", timeout=10000)


def test_preset_manager_screen_navigation(main_page):
    """Validates navigating to the preset manager screen from the preset screen and returning."""
    main_page.keyboard.press("1")
    main_page.wait_for_selector(".preset-card")
    
    # Click the preset manage button to open preset manager screen
    manage_btn = main_page.locator("#btn-manage-presets")
    manage_btn.click()
    
    # Verify preset manager screen is shown
    manager_screen = main_page.locator("#preset-manager-screen")
    expect(manager_screen).to_have_class(re.compile(r"active"))
    expect(manager_screen).not_to_have_class(re.compile(r"hidden"))
    
    # Verify preset list is rendered in the manager
    main_page.wait_for_selector("#preset-manager-list .preset-card")
    manager_cards = main_page.locator("#preset-manager-list .preset-card")
    expect(manager_cards.first).to_be_visible()
    
    # Click back button to return to preset screen
    manager_back_btn = main_page.locator("#btn-manager-back")
    manager_back_btn.click()
    expect(main_page.locator("#preset-screen")).to_have_class(re.compile(r"active"))


def test_preset_editor_create_flow(main_page):
    """Validates creating a new preset via the editor screen."""
    main_page.keyboard.press("1")
    main_page.wait_for_selector(".preset-card")
    
    # Click manage presets button
    main_page.locator("#btn-manage-presets").click()
    main_page.wait_for_selector("#preset-manager-screen:not(.hidden)")
    # Wait for the preset cards to render in the manager
    main_page.wait_for_selector("#preset-manager-list .preset-card")
    
    # Click create new preset button
    main_page.locator("#btn-create-preset").click()
    
    # Verify editor screen is shown
    main_page.wait_for_selector("#preset-editor-screen:not(.hidden)")
    expect(main_page.locator("#preset-editor-screen")).to_have_class(re.compile(r"active"))
    
    # Verify form fields exist
    expect(main_page.locator("#editor-preset-name")).to_be_visible()
    expect(main_page.locator("#editor-preset-title")).to_be_visible()
    expect(main_page.locator("#editor-preset-summary")).to_be_visible()
    expect(main_page.locator("#editor-preset-system-prompt")).to_be_visible()
    
    # Fill in the form
    main_page.locator("#editor-preset-name").fill("E2E Test Preset")
    main_page.locator("#editor-preset-title").fill("E2E Test Adventure")
    main_page.locator("#editor-preset-summary").fill("An E2E tested adventure.")
    
    # Click save button
    main_page.locator("#btn-editor-save").click()
    
    # Verify we return to manager screen
    main_page.wait_for_selector("#preset-manager-screen:not(.hidden)")
    expect(main_page.locator("#preset-manager-screen")).to_have_class(re.compile(r"active"))
    
    # Verify the new preset appears in the manager list
    new_card = main_page.locator("#preset-manager-list .preset-card").filter(has_text="E2E Test Preset")
    expect(new_card.first).to_be_visible()
    
    # Cleanup: delete the created preset
    delete_btn = new_card.first.locator(".btn-delete-preset")
    delete_btn.click()
    main_page.wait_for_selector("#modal-confirm:not(.hidden)")
    main_page.locator("#btn-confirm-yes").click()
    main_page.wait_for_selector("#modal-confirm", state="hidden")


def test_preset_editor_edit_flow(main_page):
    """Validates editing an existing preset via the editor screen."""
    main_page.keyboard.press("1")
    main_page.wait_for_selector(".preset-card")
    
    # Navigate to preset manager
    main_page.locator("#btn-manage-presets").click()
    main_page.wait_for_selector("#preset-manager-screen:not(.hidden)")
    # Wait for the preset cards to render in the manager
    main_page.wait_for_selector("#preset-manager-list .preset-card")
    
    # Click edit button on the "Lord of the Rings" preset card
    lotr_card = main_page.locator("#preset-manager-list .preset-card").filter(has_text="Lord of the Rings")
    edit_btn = lotr_card.locator(".btn-edit-preset")
    edit_btn.click()
    
    # Verify editor screen is shown in edit mode
    main_page.wait_for_selector("#preset-editor-screen:not(.hidden)")
    expect(main_page.locator("#preset-editor-screen")).to_have_class(re.compile(r"active"))
    
    # Verify the name field is pre-populated with the correct preset
    name_input = main_page.locator("#editor-preset-name")
    expect(name_input).to_have_value("Lord of the Rings (Middle-earth Fantasy)")
    
    # Modify the name
    name_input.fill("Edited E2E Preset")
    
    # Save
    main_page.locator("#btn-editor-save").click()
    main_page.wait_for_selector("#preset-manager-screen:not(.hidden)")
    expect(main_page.locator("#preset-manager-screen")).to_have_class(re.compile(r"active"))
    
    # Verify the edited preset appears in the manager
    edited_card = main_page.locator("#preset-manager-list .preset-card").filter(has_text="Edited E2E Preset")
    expect(edited_card.first).to_be_visible()
    
    # Clean up: restore the original name
    lotr_card = main_page.locator("#preset-manager-list .preset-card").filter(has_text="Edited E2E Preset")
    lotr_card.locator(".btn-edit-preset").click()
    main_page.wait_for_selector("#preset-editor-screen:not(.hidden)")
    main_page.locator("#editor-preset-name").fill("Lord of the Rings (Middle-earth Fantasy)")
    main_page.locator("#btn-editor-save").click()
    main_page.wait_for_selector("#preset-manager-screen:not(.hidden)")


def test_preset_editor_delete_flow(main_page):
    """Validates deleting a preset from the preset manager screen."""
    main_page.keyboard.press("1")
    main_page.wait_for_selector(".preset-card")
    
    # Navigate to preset manager
    main_page.locator("#btn-manage-presets").click()
    main_page.wait_for_selector("#preset-manager-screen:not(.hidden)")
    # Wait for the preset cards to render in the manager
    main_page.wait_for_selector("#preset-manager-list .preset-card")
    
    # Count initial number of preset cards
    initial_count = main_page.locator("#preset-manager-list .preset-card").count()
    
    # Click delete button on the first preset card in the manager list
    first_card = main_page.locator("#preset-manager-list .preset-card").first
    delete_btn = first_card.locator(".btn-delete-preset")
    delete_btn.click()
    
    # Verify confirmation modal appears
    confirm_modal = main_page.locator("#modal-confirm")
    expect(confirm_modal).not_to_have_class(re.compile(r"hidden"))
    
    # Confirm deletion
    main_page.locator("#btn-confirm-yes").click()
    expect(confirm_modal).to_have_class(re.compile(r"hidden"))
    
    # Verify the preset card count decreased
    main_page.wait_for_function(
        f'document.querySelectorAll("#preset-manager-list .preset-card").length === {initial_count - 1}',
        timeout=5000
    )
    new_count = main_page.locator("#preset-manager-list .preset-card").count()
    assert new_count == initial_count - 1


def test_setup_flow_boundary_custom_to_character(main_page):
    """Validates the boundary between custom-preset-screen and character-screen with state preservation."""
    main_page.keyboard.press("1")
    main_page.wait_for_selector(".preset-card")
    
    # Enter custom preset screen
    main_page.locator("#btn-custom-preset").click()
    expect(main_page.locator("#custom-preset-screen")).to_have_class(re.compile(r"active"))
    
    # Fill in custom fields
    main_page.locator("#custom-title").fill("Boundary Test Adventure")
    main_page.locator("#custom-summary").fill("Testing boundary transitions.")
    
    # Proceed to character screen
    main_page.locator("#btn-submit-custom-preset").click()
    expect(main_page.locator("#character-screen")).to_have_class(re.compile(r"active"))
    
    # Verify back button returns to custom-preset-screen (boundary)
    main_page.locator("#btn-char-back").click()
    expect(main_page.locator("#custom-preset-screen")).to_have_class(re.compile(r"active"))
    # Verify custom values preserved
    expect(main_page.locator("#custom-title")).to_have_value("Boundary Test Adventure")


def test_setup_flow_boundary_preset_to_character(main_page):
    """Validates the boundary between preset-screen and character-screen with state preservation."""
    main_page.keyboard.press("1")
    main_page.wait_for_selector(".preset-card")
    
    # Select a preset
    main_page.keyboard.press("ArrowRight")
    main_page.wait_for_timeout(200)
    main_page.keyboard.press("Enter")
    main_page.wait_for_selector("#character-screen:not(.hidden)")
    expect(main_page.locator("#character-screen")).to_have_class(re.compile(r"active"))
    
    # Wait for character cards to render
    main_page.wait_for_selector(".char-card")
    
    # Verify back button returns to preset-screen (boundary)
    main_page.locator("#btn-char-back").click()
    main_page.wait_for_selector("#preset-screen:not(.hidden)")
    expect(main_page.locator("#preset-screen")).to_have_class(re.compile(r"active"))
    
    # Wait for preset cards to render again
    main_page.wait_for_selector(".preset-card")
    
    # Re-select a preset and verify character screen still shows character cards
    main_page.keyboard.press("ArrowRight")
    main_page.wait_for_timeout(200)
    main_page.keyboard.press("Enter")
    main_page.wait_for_selector("#character-screen:not(.hidden)")
    expect(main_page.locator("#character-screen")).to_have_class(re.compile(r"active"))
    main_page.wait_for_selector(".char-card")
    char_cards = main_page.locator(".char-card")
    expect(char_cards.first).to_be_visible()


def test_setup_flow_progress_indicator(main_page):
    """Validates retro progress indicator appears on setup screens."""
    main_page.keyboard.press("1")
    main_page.wait_for_selector(".preset-card")
    
    # Verify progress indicator exists on preset-screen
    progress = main_page.locator("#preset-screen .progress-indicator")
    expect(progress).to_be_visible()
    expect(progress.locator(".progress-step")).to_have_count(3)
    
    # Navigate to custom preset screen
    main_page.locator("#btn-custom-preset").click()
    progress_custom = main_page.locator("#custom-preset-screen .progress-indicator")
    expect(progress_custom).to_be_visible()
    expect(progress_custom.locator(".progress-step")).to_have_count(3)
    
    # Navigate to character screen
    main_page.locator("#btn-submit-custom-preset").click()
    progress_char = main_page.locator("#character-screen .progress-indicator")
    expect(progress_char).to_be_visible()
    expect(progress_char.locator(".progress-step")).to_have_count(3)

