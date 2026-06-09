# Analysis: Keyboard Navigation and Default Highlight Fixes (Milestone 1)

This report details the investigation of the web frontend's keyboard navigation behavior and the issue of default highlighting of the "Begin New Simulation" button on page startup.

---

## 1. Default Highlight on Startup

### Observation
On initial startup, the "Begin New Simulation" button (`#btn-new-game`) receives the `.menu-focus` highlight style by default.

### Source Analysis
1. In `web/templates/index.html` (line 182):
   ```html
   <input type="text" id="console-input" placeholder="Type gameplay action here (e.g. open mailbox)..." autocomplete="off" autofocus>
   ```
   The `#console-input` element is defined with the `autofocus` attribute.
2. In `web/templates/index.html` (line 146):
   The `#console-input` parent container `#gameplay-screen` is initialized with the `hidden` class:
   ```html
   <div id="gameplay-screen" class="game-dashboard hidden">
   ```
   Due to the `hidden` class, this element resolves to `display: none !important` in the stylesheet (`web/static/style.css` line 114).
3. **Browser Focus Behavior**: When a page loads, if the designated `autofocus` element is invisible (`display: none`), browsers fallback to focusing the first visible focusable element in the DOM tree. The first visible focusable element on the startup screen is the `#btn-new-game` button.
4. In `web/static/app.js` (lines 41-49):
   ```javascript
   startupButtons.forEach((btn, idx) => {
       btn.addEventListener("focus", () => {
           activeMenuIndex = idx;
           startupButtons.forEach((b, i) => b.classList.toggle("menu-focus", i === idx));
       });
       btn.addEventListener("blur", () => {
           btn.classList.remove("menu-focus");
       });
   });
   ```
   When the browser falls back and focuses `#btn-new-game`, the `focus` event listener triggers, setting `activeMenuIndex` to `0` and programmatically applying the `.menu-focus` style class to `#btn-new-game`. This causes the button to be visually highlighted by default on startup.

---

## 2. Startup Menu Buttons Setup

### HTML Structure
In `web/templates/index.html` (lines 30-42):
```html
<div class="menu-choices">
    <button id="btn-new-game" class="btn btn-secondary">
        <span class="btn-glow"></span>
        <span class="btn-text">[1] Begin New Simulation</span>
    </button>
    <button id="btn-restore-game" class="btn btn-secondary">
        <span class="btn-glow"></span>
        <span class="btn-text">[2] Restore Saved Simulation</span>
    </button>
    <button id="btn-toggle-crt" class="btn btn-secondary">
        <span class="btn-text">[T] Toggle CRT Scanlines</span>
    </button>
</div>
```
- All buttons have the `btn` and `btn-secondary` classes.
- Note: `.btn-secondary` is not defined in `style.css` but does not impact behavior.
- `.btn-glow` spans are empty and have no styling in `style.css` but can be left as is.

### JS Configuration
In `web/static/app.js`:
- **State Initialization** (line 12):
  ```javascript
  let activeMenuIndex = -1;
  ```
- **Click Handlers** (lines 17-33):
  Event listeners redirect clicks to actions (`loadPresets()`, `loadSavesList()`, and toggling CRT body classes).
- **Focus/Blur Handlers** (lines 41-49):
  These update `activeMenuIndex` and toggle the `.menu-focus` CSS class programmatically when buttons receive or lose focus.
- **Screen Reset** (lines 253-264):
  When returning to the startup screen via `showScreen("startup-screen")`, the button highlight is cleared:
  ```javascript
  } else if (screenId === "startup-screen") {
      activeMenuIndex = -1;
      const buttons = [
          document.getElementById("btn-new-game"),
          document.getElementById("btn-restore-game"),
          document.getElementById("btn-toggle-crt")
      ];
      buttons.forEach(btn => {
          btn.classList.remove("menu-focus");
          btn.blur();
      });
  }
  ```

---

## 3. Keyboard Event Capturing

Keyboard capturing is set up globally on the `window` object in `web/static/app.js` (lines 191-226):

```javascript
window.addEventListener("keydown", (e) => {
    const activeScreen = getActiveScreenId();
    if (!activeScreen) return;
    
    // If we are in gameplay screen, let the console input handle keypresses
    if (activeScreen === "gameplay-screen") return;
    
    // If typing in any input field or textarea, do not intercept
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
        return;
    }
    
    const key = e.key;
    
    if (activeScreen === "startup-screen") {
        const buttons = [
            document.getElementById("btn-new-game"),
            document.getElementById("btn-restore-game"),
            document.getElementById("btn-toggle-crt")
        ];
        
        // Handle shortcuts
        if (key === "1") {
            e.preventDefault();
            buttons[0].click();
        } else if (key === "2") {
            e.preventDefault();
            buttons[1].click();
        } else if (key.toLowerCase() === "t") {
            e.preventDefault();
            buttons[2].click();
        } else if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter") {
            handleArrowNavigation(e, buttons);
        }
    }
});
```

### Hotkey Triggers
- `key === "1"` → Triggers click on `btn-new-game` (Begin New Simulation).
- `key === "2"` → Triggers click on `btn-restore-game` (Restore Saved Simulation).
- `key.toLowerCase() === "t"` → Triggers click on `btn-toggle-crt` (Toggle CRT Scanlines).

### Arrow Navigation & Enter (lines 1012-1037)
```javascript
function handleArrowNavigation(e, buttons) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        
        if (e.key === "ArrowDown") {
            if (activeMenuIndex === -1) {
                activeMenuIndex = 0;
            } else {
                activeMenuIndex = (activeMenuIndex + 1) % buttons.length;
            }
        } else if (e.key === "ArrowUp") {
            if (activeMenuIndex === -1) {
                activeMenuIndex = buttons.length - 1;
            } else {
                activeMenuIndex = (activeMenuIndex - 1 + buttons.length) % buttons.length;
            }
        }
        
        buttons[activeMenuIndex].focus();
    } else if (e.key === "Enter") {
        if (activeMenuIndex !== -1) {
            e.preventDefault();
            buttons[activeMenuIndex].click();
        }
    }
}
```
- Arrow keys modify `activeMenuIndex` and call `.focus()` on the targeted button.
- When focused, the focus event listener takes care of updating classes, keeping mouse and keyboard states aligned.
- Pressing `Enter` programmatically clicks the focused button if `activeMenuIndex !== -1` (after preventing default browser event behavior).

---

## 4. Visual Highlight & Focus Management Strategy

To ensure that:
1. No button has focus or visual highlight on startup.
2. The user can immediately begin navigating with Arrow keys, which will focus/highlight the first or last button appropriately.
3. The console input gets correctly focused when the gameplay screen is active.

### Recommended Changes
- **Change 1 (HTML)**: In `web/templates/index.html` (line 182), remove the `autofocus` attribute from the console input element:
  ```html
  <!-- Before -->
  <input type="text" id="console-input" placeholder="Type gameplay action here (e.g. open mailbox)..." autocomplete="off" autofocus>
  
  <!-- After -->
  <input type="text" id="console-input" placeholder="Type gameplay action here (e.g. open mailbox)..." autocomplete="off">
  ```
- **Verification of JS transitions**: Verify that when switching screens to `gameplay-screen`, the JS handles the focus dynamically (which it already does in `web/static/app.js` line 252):
  ```javascript
  document.getElementById("console-input").focus();
  ```
- No other Javascript code changes are required because the initial value of `activeMenuIndex` is already `-1`, and the arrow navigation handlers correctly handle `-1` indices by starting at `0` (for `ArrowDown`) or `2` (for `ArrowUp`).
