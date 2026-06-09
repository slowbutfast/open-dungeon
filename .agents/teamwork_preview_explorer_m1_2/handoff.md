# Handoff Report — Explorer 2

## 1. Observation
I directly observed the following details in the codebase:

* **File**: `web/templates/index.html`
  * Line 182 contains the `autofocus` attribute on the hidden console input field:
    ```html
    <input type="text" id="console-input" placeholder="Type gameplay action here (e.g. open mailbox)..." autocomplete="off" autofocus>
    ```
  * Lines 30-42 define the startup buttons:
    ```html
    <div class="menu-choices">
        <button id="btn-new-game" class="btn btn-secondary">
            <span class="btn-glow"></span>
            <span class="btn-text">[1] Begin New Simulation</span>
        </button>
        ...
    </div>
    ```
  * Note: `#btn-new-game` does not have any `autofocus` attribute or default highlight class like `menu-focus`.

* **File**: `web/static/app.js`
  * Lines 41-49 configure the focus listener on startup buttons, applying the visual `menu-focus` class:
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
  * Lines 253-264 contain the `showScreen("startup-screen")` logic to explicitly reset the menu highlights and blur buttons:
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
  * No call to `showScreen("startup-screen")` exists during script startup in the `DOMContentLoaded` listener (lines 15-227).

* **File**: `web/static/style.css`
  * Lines 172-177 define the styling of the highlighted menu item:
    ```css
    .btn.menu-focus {
        background: rgba(56, 189, 248, 0.15);
        border-color: var(--text-neon);
        box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
        text-shadow: 0 0 5px var(--text-neon);
    }
    ```

---

## 2. Logic Chain
1. By default, `#btn-new-game` does not contain any highlight class or `autofocus` attribute (from observation of `index.html` lines 31-34).
2. Toggling the visual highlight class (`menu-focus`) occurs in the `"focus"` listener inside `app.js` lines 41-49 (from observation).
3. The `#console-input` element contains `autofocus` (from observation of `index.html` line 182), but its containing element `#gameplay-screen` is hidden on page load. When the browser tries to resolve `autofocus` on a hidden element, it fails and falls back to focusing the first visible focusable element on the page, which is `#btn-new-game`.
4. This focuses the button, which triggers the `"focus"` listener and applies the `menu-focus` class.
5. In addition, the `showScreen("startup-screen")` reset logic is never executed on initial page load because it is not invoked during `DOMContentLoaded` (from observation of `app.js` lines 15-227).
6. Therefore, the button remains focused and highlighted.
7. To resolve this, the autofocus fallback must be eliminated (by removing the `autofocus` attribute from the hidden `#console-input`), and the startup screen state must be programmatically reset on initialization (by calling `showScreen("startup-screen")` at the end of `DOMContentLoaded` in `app.js`).

---

## 3. Caveats
* No frontend E2E testing framework is currently configured in the codebase; analysis is based on code structure and standard browser behaviors.
* Exact browser behavior regarding autofocus on hidden fields might differ (e.g., between Chrome/Firefox/Safari), but removing `autofocus` from `#console-input` and calling `showScreen("startup-screen")` on load is browser-agnostic and robust.

---

## 4. Conclusion
To satisfy **R1 (Keyboard Navigation and Default Highlight Fixes)**, we must:
1. Remove `autofocus` from `#console-input` in `web/templates/index.html` at line 182.
2. Invoke `showScreen("startup-screen");` at the end of the `DOMContentLoaded` listener in `web/static/app.js` (around line 226).

---

## 5. Verification Method
1. Open `web/templates/index.html` and verify the `autofocus` attribute is removed from the `#console-input` element.
2. Open `web/static/app.js` and verify that `showScreen("startup-screen");` is called at the end of the DOMContentLoaded block.
3. Launch the web server (e.g., using `python3 web/server.py` or `game/run_game.sh` if available) and load the page in a browser.
4. **Verification checklist**:
   * On initial page load, no buttons on the startup screen should have the `menu-focus` styling.
   * Pressing `ArrowDown` should immediately focus and highlight the "Begin New Simulation" button.
   * Pressing `ArrowUp` should wrap around and focus/highlight the "Toggle CRT Scanlines" button.
   * Pressing `1`, `2`, or `t`/`T` keys on keyboard should instantly execute their respective button actions.
   * Pressing `Enter` on any highlighted button should activate it.
