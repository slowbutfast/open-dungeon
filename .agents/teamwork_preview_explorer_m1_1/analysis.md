# Codebase Analysis: Keyboard Navigation and Default Highlight Fixes

This report outlines findings and recommended implementation strategy for keyboard navigation and visual highlights in the web UI of Retro Neural Adventure Link.

---

## 1. Where "Begin New Simulation" is focused or highlighted by default on startup
- **HTML Check**: In `web/templates/index.html` (line 31), the "Begin New Simulation" button (`#btn-new-game`) is defined with classes `btn btn-secondary`. It does **not** have the `autofocus` attribute or any inline styles/classes indicating a default focus or highlight.
- **CSS Check**: In `web/static/style.css` (lines 168-170), the default browser focus outline is removed via:
  ```css
  .btn:focus {
      outline: none;
  }
  ```
  The highlight style `.btn.menu-focus` is defined (lines 172-177) but is not applied to any element in the static HTML.
- **JS Check**: In `web/static/app.js` (line 12), the global active menu index variable `activeMenuIndex` is initialized to `-1`. No code runs on load to focus or apply a highlight class to the startup menu buttons.
- **Conclusion**: The button is **not** focused or visually highlighted by default on startup. It sits in an unselected state until keyboard navigation or mouse hover/tabbing begins.

---

## 2. Setup of Startup Menu Buttons in HTML/JS
- **HTML Structure (`web/templates/index.html`, lines 30-42)**:
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
- **JS Event Listeners (`web/static/app.js`, lines 17-49)**:
  - Button actions are set up via standard `click` event listeners (lines 17-33).
  - Visual highlight class toggle (`menu-focus`) is bound to browser `focus` and `blur` events (lines 35-49):
    ```javascript
    const startupButtons = [
        document.getElementById("btn-new-game"),
        document.getElementById("btn-restore-game"),
        document.getElementById("btn-toggle-crt")
    ];
    
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

---

## 3. Capture of Keyboard Events
- **Global Keydown Listener (`web/static/app.js`, lines 191-226)**:
  - Key events are caught at the `window` level, ignoring keypresses targeting text input/textareas:
    ```javascript
    window.addEventListener("keydown", (e) => {
        const activeScreen = getActiveScreenId();
        if (!activeScreen) return;
        if (activeScreen === "gameplay-screen") return;
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
            // Shortcuts
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
- **Arrow and Enter Helper (`web/static/app.js`, lines 1012-1037)**:
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

---

## 4. Visual Highlight Management without Default Focus on Startup
To enable a default visual highlight on "Begin New Simulation" on startup without giving the element browser focus (which can cause accessibility/layout focus rings or scroll jumping):
1. **Initialize default highlight state on load**: Set `activeMenuIndex = 0` on DOMContentLoaded and apply the `.menu-focus` class directly to `btn-new-game`.
2. **Prevent blur from removing the highlight of the active button**: Modify the `blur` event listener so that the active menu element keeps its highlight.
3. **Handle Screen Transition**: When transitioning back to the `startup-screen` in `showScreen("startup-screen")`, reset `activeMenuIndex = 0` and ensure the visual highlight class is added only to the first button while calling `btn.blur()` on all buttons.

---

## Recommended Implementation Strategy

### A. Modify `web/static/app.js` Focus Setup
*Target lines: 35-49*

**Before**:
```javascript
    const startupButtons = [
        document.getElementById("btn-new-game"),
        document.getElementById("btn-restore-game"),
        document.getElementById("btn-toggle-crt")
    ];
    
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

**After**:
```javascript
    const startupButtons = [
        document.getElementById("btn-new-game"),
        document.getElementById("btn-restore-game"),
        document.getElementById("btn-toggle-crt")
    ];
    
    // Set default menu selection index and visual highlight without browser focus
    activeMenuIndex = 0;
    if (startupButtons[0]) {
        startupButtons[0].classList.add("menu-focus");
    }
    
    startupButtons.forEach((btn, idx) => {
        btn.addEventListener("focus", () => {
            activeMenuIndex = idx;
            startupButtons.forEach((b, i) => b.classList.toggle("menu-focus", i === idx));
        });
        btn.addEventListener("blur", () => {
            // Keep the menu-focus class if this index remains selected (e.g. for pure keyboard nav)
            if (activeMenuIndex !== idx) {
                btn.classList.remove("menu-focus");
            }
        });
    });
```

---

### B. Modify `showScreen` function inside `web/static/app.js`
*Target lines: 253-264*

**Before**:
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

**After**:
```javascript
    } else if (screenId === "startup-screen") {
        activeMenuIndex = 0;
        const buttons = [
            document.getElementById("btn-new-game"),
            document.getElementById("btn-restore-game"),
            document.getElementById("btn-toggle-crt")
        ];
        buttons.forEach((btn, idx) => {
            btn.classList.toggle("menu-focus", idx === 0);
            btn.blur();
        });
    }
```
