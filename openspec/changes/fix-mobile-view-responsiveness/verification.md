# Mobile View Success Criteria & Verification Plan

## Scope

This document defines success criteria and verification steps for fixing the mobile view responsiveness. **Out of scope**: floating debug panel (new feature).

## Target Viewports

| Device Type | Width | Height | Notes |
|-------------|-------|--------|-------|
| iPhone SE | 375px | 667px | Smallest common phone |
| iPhone 12/13 | 390px | 844px | Modern phone with notch |
| iPhone 16 Pro | 430px | 932px | Latest iPhone with dynamic island |
| iPad Mini | 768px | 1024px | Tablet breakpoint |
| iPad Pro | 1024px | 1366px | Large tablet |

---

## Success Criteria

### 1. Startup Screen (`#startup-screen`)

**Layout:**
- [ ] No horizontal overflow at any viewport width (320px+)
- [ ] Title `OPENDUNGEON` wraps gracefully or scales down on screens < 400px
- [ ] Subtitle text (including LLM status pill) does not overflow container
- [ ] Menu buttons stack vertically with adequate spacing (min 12px gap)
- [ ] Buttons have min-height 44px for touch targets
- [ ] Keyboard hints (`[1]`, `[2]`, `[T]`) are hidden on mobile (already done via `.kbd-hint { display: none }`)

**Navigation:**
- [ ] "Begin New Simulation" button is tappable and navigates to preset screen
- [ ] "Restore Saved Simulation" button is tappable and navigates to restore screen
- [ ] "Toggle CRT Scanlines" button is tappable and toggles CRT effect
- [ ] All buttons have visible focus/active states when tapped

**Safe Areas:**
- [ ] Content respects `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` on notched devices
- [ ] Buttons do not overlap with home indicator area

**Fonts:**
- [ ] Title font-size scales appropriately (max 2.5rem on mobile)
- [ ] Subtitle remains legible (min 0.75rem)
- [ ] Button text is readable (min 0.9rem)

### 2. Preset Screen (`#preset-screen`)

**Layout:**
- [ ] Progress indicator wraps or stacks on screens < 500px
- [ ] Panel header does not overflow
- [ ] Preset cards stack vertically (single column) on mobile
- [ ] Each card has min-height 80px for comfortable tapping
- [ ] Card content (title, description) is fully visible without horizontal scroll
- [ ] Footer navigation buttons wrap to multiple rows if needed, or stack vertically
- [ ] No button text truncation

**Navigation:**
- [ ] Tapping preset card selects it (adds `active` class)
- [ ] "Customize Story" button appears after selecting preset
- [ ] "Next: Adventure Config" button appears after selecting preset
- [ ] "Back" button returns to startup screen
- [ ] "Manage Presets" button navigates to preset manager screen
- [ ] "Custom Adventure" button navigates to custom preset screen

**Grid Behavior:**
- [ ] `.preset-grid` uses `grid-template-columns: 1fr` on mobile (not `auto-fit, minmax(220px, 1fr)`)
- [ ] Cards have adequate padding (min 12px) for touch targets
- [ ] Active card highlight is visible

**Tablet (768-1023px):**
- [ ] `.preset-grid` uses `grid-template-columns: repeat(2, 1fr)` for 2-column layout
- [ ] Cards maintain readable text size

### 3. Custom Preset Screen (`#custom-preset-screen`)

**Layout:**
- [ ] Progress indicator wraps or stacks on mobile
- [ ] Form container scrolls vertically if content overflows
- [ ] Textarea for system prompt has min-height 120px but max-height 50vh to prevent overflow
- [ ] Form inputs have min-height 44px
- [ ] Labels stack above inputs (not side-by-side) on mobile
- [ ] Footer buttons stack vertically or wrap gracefully

**Touch Targets:**
- [ ] All inputs have min-height 44px
- [ ] Buttons have min-height 44px
- [ ] Adequate spacing between form groups (min 16px)

### 4. Character Screen (`#character-screen`)

**Layout:**
- [ ] Progress indicator wraps or stacks on mobile
- [ ] Character cards stack vertically (single column) on mobile
- [ ] Each card has min-height 80px
- [ ] Custom character form (when toggled) stacks labels above inputs
- [ ] Footer buttons wrap or stack vertically

**Navigation:**
- [ ] Tapping character card selects it (adds `active` class)
- [ ] "Customize Character" button toggles custom form visibility
- [ ] "Back" button returns to previous screen (custom-preset or preset)
- [ ] "Launch Simulation" button navigates to gameplay screen
- [ ] All buttons have visible focus/active states when tapped

**Grid Behavior:**
- [ ] `.character-grid` uses `grid-template-columns: 1fr` on mobile
- [ ] Cards have adequate padding for touch targets

### 5. Gameplay Screen (`#gameplay-screen`)

**Layout:**
- [ ] Console log scrolls vertically without horizontal overflow
- [ ] Status bar wraps to 2x2 grid on mobile (already done)
- [ ] Console utilities wrap gracefully (already done via `flex-wrap: wrap`)
- [ ] Action chips wrap to multiple rows (already done via `flex-wrap: wrap`)
- [ ] Input area has min-height 44px (already done)
- [ ] Mobile tab bar is visible and functional (already done)

**Fonts:**
- [ ] Console log font-size is 0.85rem on mobile (already done)
- [ ] `.log-turn-user`, `.log-turn-assistant`, `.log-turn-system` all render at same size (inherit from `.console-log`)
- [ ] Status bar text is legible (min 0.9rem)

### 6. Modals (All)

**General Modal Behavior:**
- [ ] Modal overlay covers full viewport
- [ ] Modal content has `max-width: 90vw` on mobile
- [ ] Modal content has `max-height: 90vh` and scrolls vertically
- [ ] Modal padding is reduced on mobile (min 12px)
- [ ] Close button is visible and has min 44px touch target

**Barter Modal Specific:**
- [ ] `.barter-layout` stacks vertically on mobile: `grid-template-columns: 1fr`
- [ ] `.barter-arrow` is hidden or repositioned (not side-by-side)
- [ ] Item lists scroll vertically within modal
- [ ] Trade buttons have min-height 44px

**System Prompt Modal:**
- [ ] Textarea has min-height 150px but max-height 60vh
- [ ] Save/Cancel buttons stack vertically or wrap

**Lore Card Modal:**
- [ ] Card content scrolls vertically if overflow
- [ ] Badge and description are fully visible

**Confirmation Modal:**
- [ ] Yes/No buttons stack vertically or wrap
- [ ] Message text is fully visible

### 7. Restore Screen (`#restore-screen`)

**Layout:**
- [ ] Save list scrolls vertically
- [ ] Each save item has min-height 60px
- [ ] Load/Delete buttons are visible and have min 44px touch targets
- [ ] Footer back button is visible

### 8. Preset Manager & Editor Screens

**Manager Screen:**
- [ ] Preset cards stack vertically on mobile
- [ ] Edit/Delete buttons are visible and have min 44px touch targets
- [ ] Footer back button is visible

**Editor Screen:**
- [ ] Form fields stack vertically
- [ ] Textareas have appropriate min/max heights
- [ ] Save/Cancel buttons wrap or stack
- [ ] Character sub-forms are accessible and usable

---

## Verification Plan

### Playwright Test Setup

Create new test file: `tests/e2e/test_mobile_viewport.py`

```python
import pytest
from playwright.sync_api import sync_playwright, expect

MOBILE_VIEWPORTS = {
    "iphone-se": {"width": 375, "height": 667},
    "iphone-12": {"width": 390, "height": 844},
    "iphone-16-pro": {"width": 430, "height": 932},
    "ipad-mini": {"width": 768, "height": 1024},
}

@pytest.fixture(params=MOBILE_VIEWPORTS.keys())
def mobile_page(page, request):
    viewport = MOBILE_VIEWPORTS[request.param]
    page.set_viewport_size(viewport)
    page.goto("http://127.0.0.1:5001")
    page.wait_for_selector("#llm-status-pill:not(.llm-pill-checking)")
    return page
```

### Test Cases

#### 1. No Horizontal Overflow

```python
def test_no_horizontal_overflow(mobile_page):
    """Verify no horizontal scroll on any wizard screen."""
    screens = ["startup-screen", "preset-screen", "custom-preset-screen", "character-screen"]
    
    for screen_id in screens:
        mobile_page.keyboard.press("1")  # Navigate to screen
        mobile_page.wait_for_selector(f"#{screen_id}:not(.hidden)")
        
        # Check for horizontal overflow
        overflow = mobile_page.evaluate("""
            () => {
                const el = document.documentElement;
                return el.scrollWidth > el.clientWidth;
            }
        """)
        assert not overflow, f"Horizontal overflow detected on {screen_id}"
```

#### 2. Touch Target Sizes

```python
def test_touch_target_sizes(mobile_page):
    """Verify all interactive elements meet 44x44px minimum."""
    mobile_page.keyboard.press("1")
    mobile_page.wait_for_selector(".preset-card")
    
    buttons = mobile_page.locator("button:visible")
    for i in range(buttons.count()):
        box = buttons.nth(i).bounding_box()
        assert box["height"] >= 44, f"Button height {box['height']}px < 44px"
        assert box["width"] >= 44, f"Button width {box['width']}px < 44px"
```

#### 3. Menu Button Navigation (Touch)

```python
def test_startup_menu_button_navigation(mobile_page):
    """Verify startup menu buttons are tappable and navigate correctly on mobile."""
    # Verify we're on startup screen
    expect(mobile_page.locator("#startup-screen")).to_have_class(re.compile(r"active"))
    
    # Tap "Begin New Simulation" button
    btn_new = mobile_page.locator("#btn-new-game")
    expect(btn_new).to_be_visible()
    btn_new.tap()
    
    # Should navigate to preset screen
    mobile_page.wait_for_selector("#preset-screen:not(.hidden)")
    expect(mobile_page.locator("#preset-screen")).to_have_class(re.compile(r"active"))
    
    # Tap Back button
    btn_back = mobile_page.locator("#preset-screen .btn-back")
    expect(btn_back).to_be_visible()
    btn_back.tap()
    
    # Should return to startup screen
    expect(mobile_page.locator("#startup-screen")).to_have_class(re.compile(r"active"))
    
    # Tap "Restore Saved Simulation" button
    btn_restore = mobile_page.locator("#btn-restore-game")
    expect(btn_restore).to_be_visible()
    btn_restore.tap()
    
    # Should navigate to restore screen
    mobile_page.wait_for_selector("#restore-screen:not(.hidden)")
    expect(mobile_page.locator("#restore-screen")).to_have_class(re.compile(r"active"))

def test_preset_screen_button_navigation(mobile_page):
    """Verify preset screen buttons are tappable on mobile."""
    # Navigate to preset screen
    mobile_page.keyboard.press("1")
    mobile_page.wait_for_selector(".preset-card")
    
    # Tap first preset card
    first_card = mobile_page.locator(".preset-card").first
    expect(first_card).to_be_visible()
    first_card.tap()
    
    # Customize and Next buttons should appear
    btn_customize = mobile_page.locator("#btn-preset-customize")
    btn_next = mobile_page.locator("#btn-preset-next")
    expect(btn_customize).to_be_visible()
    expect(btn_next).to_be_visible()
    
    # Tap Next button
    btn_next.tap()
    
    # Should navigate to custom-preset screen (adventure config)
    mobile_page.wait_for_selector("#custom-preset-screen:not(.hidden)")
    expect(mobile_page.locator("#custom-preset-screen")).to_have_class(re.compile(r"active"))

def test_character_screen_button_navigation(mobile_page):
    """Verify character screen buttons are tappable on mobile."""
    # Navigate to character screen
    mobile_page.keyboard.press("1")
    mobile_page.wait_for_selector(".preset-card")
    mobile_page.keyboard.press("ArrowRight")
    mobile_page.keyboard.press("Enter")
    mobile_page.wait_for_selector("#custom-preset-screen:not(.hidden)")
    mobile_page.locator("#btn-submit-custom-preset").tap()
    mobile_page.wait_for_selector("#character-screen:not(.hidden)")
    
    # Tap first character card
    first_char = mobile_page.locator(".char-card").first
    expect(first_char).to_be_visible()
    first_char.tap()
    
    # Verify card is selected (has active class)
    expect(first_char).to_have_class(re.compile(r"active"))
    
    # Tap Launch Simulation button
    btn_launch = mobile_page.locator("#btn-submit-character")
    expect(btn_launch).to_be_visible()
    btn_launch.tap()
    
    # Should navigate to gameplay screen
    mobile_page.wait_for_selector("#gameplay-screen:not(.hidden)", timeout=15000)
    expect(mobile_page.locator("#gameplay-screen")).to_have_class(re.compile(r"active"))

def test_footer_navigation_buttons(mobile_page):
    """Verify footer navigation buttons are accessible and tappable on mobile."""
    # Navigate to preset screen
    mobile_page.keyboard.press("1")
    mobile_page.wait_for_selector(".preset-card")
    
    # Scroll to bottom if needed to see footer
    mobile_page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    
    # Verify footer buttons are visible and tappable
    btn_back = mobile_page.locator("#preset-screen .btn-back")
    btn_manage = mobile_page.locator("#btn-manage-presets")
    
    expect(btn_back).to_be_visible()
    expect(btn_manage).to_be_visible()
    
    # Tap Manage Presets
    btn_manage.tap()
    mobile_page.wait_for_selector("#preset-manager-screen:not(.hidden)")
    expect(mobile_page.locator("#preset-manager-screen")).to_have_class(re.compile(r"active"))
    
    # Tap Back to return
    btn_manager_back = mobile_page.locator("#btn-manager-back")
    expect(btn_manager_back).to_be_visible()
    btn_manager_back.tap()
    
    # Should return to preset screen
    expect(mobile_page.locator("#preset-screen")).to_have_class(re.compile(r"active"))
```

#### 5. Font Size Consistency

```python
def test_console_font_consistency(mobile_page):
    """Verify all console turn types render at same font size."""
    # Launch game to get to gameplay screen
    # ... (navigate through wizard)
    
    font_sizes = mobile_page.evaluate("""
        () => {
            const user = document.querySelector('.log-turn-user');
            const assistant = document.querySelector('.log-turn-assistant');
            const system = document.querySelector('.log-turn-system');
            return {
                user: user ? getComputedStyle(user).fontSize : null,
                assistant: assistant ? getComputedStyle(assistant).fontSize : null,
                system: system ? getComputedStyle(system).fontSize : null,
            };
        }
    """)
    
    # All should be equal (or inherit from base)
    assert font_sizes["user"] == font_sizes["assistant"] == font_sizes["system"]
```

#### 6. Modal Responsiveness

```python
def test_barter_modal_mobile(mobile_page):
    """Verify barter modal stacks vertically on mobile."""
    # Open barter modal
    # ... (trigger modal)
    
    layout = mobile_page.evaluate("""
        () => {
            const layout = document.querySelector('.barter-layout');
            const style = getComputedStyle(layout);
            return {
                gridTemplateColumns: style.gridTemplateColumns,
                isStacked: style.gridTemplateColumns === '1fr' || style.gridTemplateColumns.includes('1fr')
            };
        }
    """)
    
    assert layout["isStacked"], "Barter layout should stack vertically on mobile"
```

#### 7. Screenshot Verification

```python
def test_screenshot_startup_screen(mobile_page):
    """Capture screenshot of startup screen for manual review."""
    mobile_page.screenshot(path=f"screenshots/startup-{mobile_page.viewport['width']}px.png")

def test_screenshot_preset_screen(mobile_page):
    """Capture screenshot of preset screen for manual review."""
    mobile_page.keyboard.press("1")
    mobile_page.wait_for_selector(".preset-card")
    mobile_page.screenshot(path=f"screenshots/preset-{mobile_page.viewport['width']}px.png")

# ... similar for other screens
```

### Manual Verification Checklist

After running Playwright tests, manually review screenshots for:

**Startup Screen:**
- [ ] Title is readable and does not overflow
- [ ] Buttons are clearly separated and tappable
- [ ] No horizontal scroll
- [ ] "Begin New Simulation" button navigates to preset screen
- [ ] "Restore Saved Simulation" button navigates to restore screen

**Preset Screen:**
- [ ] Cards stack vertically (mobile) or 2-column (tablet)
- [ ] Card text is fully visible
- [ ] Footer buttons are accessible
- [ ] Tapping preset card selects it (shows active state)
- [ ] "Next" button navigates to adventure config
- [ ] "Back" button returns to startup screen

**Character Screen:**
- [ ] Character cards stack vertically
- [ ] Custom form is usable
- [ ] Tapping character card selects it
- [ ] "Launch Simulation" button navigates to gameplay

**Gameplay Screen:**
- [ ] Console text is legible
- [ ] Status bar is readable
- [ ] Input area is accessible
- [ ] Mobile tab bar is functional

**Modals:**
- [ ] Barter modal stacks vertically
- [ ] All buttons are tappable
- [ ] Content scrolls if needed

### Automated CSS Property Checks

```python
def test_safe_area_insets(mobile_page):
    """Verify safe-area-inset properties are set."""
    has_safe_area = mobile_page.evaluate("""
        () => {
            const styles = document.styleSheets;
            // Check for env(safe-area-inset-*) in computed styles
            const body = getComputedStyle(document.body);
            return true; // Placeholder - actual check requires parsing CSS
        }
    """)
    # Manual verification via screenshot review
```

---

## Font Rendering Verification

### Expected Font Sizes (Mobile)

| Element | Expected Size | Notes |
|---------|---------------|-------|
| `.startup-header h1` | 2rem - 2.5rem | Scales down on small screens |
| `.startup-header .subtitle` | 0.75rem - 0.8rem | Legible but compact |
| `.btn` (menu buttons) | 0.9rem - 1rem | Readable touch targets |
| `.console-log` | 0.85rem | Base console size |
| `.log-turn-user` | 0.85rem | Inherits from `.console-log` |
| `.log-turn-assistant` | 0.85rem | Inherits from `.console-log` |
| `.log-turn-system` | 0.85rem | Inherits from `.console-log` |
| `.status-bar` | 0.9rem - 1rem | Readable status info |
| `.panel-header h2` | 1.2rem - 1.4rem | Section headers |

### Font Family Verification

```python
def test_font_families(mobile_page):
    """Verify correct font families are applied."""
    fonts = mobile_page.evaluate("""
        () => {
            return {
                title: getComputedStyle(document.querySelector('.startup-header h1')).fontFamily,
                body: getComputedStyle(document.querySelector('.console-log')).fontFamily,
                mono: getComputedStyle(document.querySelector('.code-font')).fontFamily,
            };
        }
    """)
    
    assert "VT323" in fonts["title"], "Title should use VT323"
    assert "Inter" in fonts["body"] or "system-ui" in fonts["body"], "Body should use Inter or system-ui"
    assert "JetBrains Mono" in fonts["mono"], "Code should use JetBrains Mono"
```

---

## Regression Testing

Ensure desktop view (>= 1024px) remains unchanged:

```python
def test_desktop_view_unchanged(page):
    """Verify desktop layout is not affected by mobile changes."""
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto("http://127.0.0.1:5001")
    
    # Verify preset grid uses multi-column layout
    page.keyboard.press("1")
    page.wait_for_selector(".preset-card")
    
    grid_columns = page.evaluate("""
        () => {
            const grid = document.querySelector('.preset-grid');
            return getComputedStyle(grid).gridTemplateColumns;
        }
    """)
    
    # Should have multiple columns (not 1fr)
    assert "1fr 1fr" in grid_columns or grid_columns.count("1fr") > 1
```

---

## Deliverables

1. **Updated CSS** in `web/static/style.css`:
   - Mobile-first wizard screen styles
   - Modal responsive styles
   - Console font consistency
   - Touch target improvements

2. **Updated HTML** in `web/templates/index.html` (if needed):
   - Structural changes for mobile-first layouts
   - Safe-area inset support

3. **New E2E tests** in `tests/e2e/test_mobile_viewport.py`:
   - Viewport emulation tests
   - Screenshot capture tests
   - CSS property verification tests

4. **Screenshot baseline** in `tests/e2e/screenshots/`:
   - Reference screenshots for each screen at each viewport
   - Manual review checklist

5. **Updated proposal** in `openspec/changes/fix-mobile-view-responsiveness/`:
   - Final implementation details
   - Test results summary

---

## Acceptance Criteria Summary

- [ ] All wizard screens usable on 375px-wide phone (iPhone SE) without horizontal overflow
- [ ] All wizard screens usable on 430px-wide phone (iPhone 16 Pro) without horizontal overflow
- [ ] All wizard screens usable on 768px-wide tablet (iPad Mini) with 2-column layout
- [ ] Presets and characters browsable with touch-friendly cards (min 44px height)
- [ ] All menu buttons tappable and navigate correctly on mobile (startup, preset, character screens)
- [ ] Footer navigation buttons accessible and functional on all mobile viewports
- [ ] All modals responsive and usable on mobile (vertical stacking)
- [ ] Console font sizes consistent across all turn types (0.85rem)
- [ ] Safe-area insets respected on notched devices (iPhone 12/13/16 Pro)
- [ ] Desktop layout (>= 1024px) completely unchanged
- [ ] Playwright tests pass for all mobile viewports (iPhone SE, iPhone 12, iPhone 16 Pro, iPad Mini)
- [ ] Screenshots manually reviewed and approved for each viewport

---

## Pending Manual Verification (Required Before Archive)

**Status**: ⏳ Awaiting manual verification on physical device(s)

**What to verify on your phone**:
1. **Wizard screens** — Open the app on your phone and navigate through all wizard screens (startup → preset → custom-preset → character → gameplay). Verify:
   - No horizontal overflow or awkward text wrapping
   - Buttons are easy to tap (not too small or cramped)
   - Footer navigation buttons are accessible without excessive scrolling
   - Safe-area insets work correctly on notched devices (content doesn't overlap with notch or home indicator)

2. **Grid layouts** — On a tablet (iPad or similar), verify:
   - Preset and character grids display as 2-column layout
   - Cards are readable and tappable

3. **Modals** — Open the barter modal and system prompt modal on your phone:
   - Modal content fits within viewport (no overflow)
   - Barter layout stacks vertically (not side-by-side)
   - Trade buttons are tappable

4. **Console** — Once in gameplay, verify:
   - All message types (user, assistant, system) render at the same font size
   - Text is legible and evenly spaced

**How to test on your phone**:
```bash
# Terminal 1: Start the server
node web/server.js

# Terminal 2: Start a Cloudflare Tunnel (or use ngrok/local network)
cloudflared tunnel --url http://localhost:5001
```
Then open the tunnel URL on your phone.

**Do this before running**:
```bash
openspec archive fix-mobile-view-responsiveness
```

Once verified, check off the items above and proceed to archive.
