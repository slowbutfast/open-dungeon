# Keyboard Navigation and Default Highlight Analysis (M1)

## Summary of Findings

### 1. Default Focus / Highlight of "Begin New Simulation" Button on Startup
* **Root Cause**:
  * In `web/templates/index.html` (line 182), the `#console-input` element has an `autofocus` attribute:
    ```html
    <input type="text" id="console-input" placeholder="Type gameplay action here (e.g. open mailbox)..." autocomplete="off" autofocus>
    ```
    Since the `#gameplay-screen` container is hidden on page load, the browser tries to resolve the `autofocus` attribute. In some browsers, focusing a hidden element falls back to focusing the first visible focusable element on the screen, which is `#btn-new-game` ("Begin New Simulation").
  * Additionally, `web/static/app.js` sets up event listeners on the startup buttons to add the visual highlight class `menu-focus` whenever they receive focus:
    ```javascript
    startupButtons.forEach((btn, idx) => {
        btn.addEventListener("focus", () => {
            activeMenuIndex = idx;
            startupButtons.forEach((b, i) => b.classList.toggle("menu-focus", i === idx));
        });
        ...
    });
    ```
  * During page load/initialization, the application does not invoke any helper (like `showScreen("startup-screen")`) to explicitly blur the menu buttons and reset `activeMenuIndex` to `-1`. Therefore, if the browser auto-focuses the first button, it receives the `menu-focus` class and appears highlighted by default.

### 2. Startup Menu Buttons Setup
* **HTML Structure** (`web/templates/index.html` lines 30-42):
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
* **JS Listeners** (`web/static/app.js` lines 17-49):
  * Click handlers transition to the appropriate screen (`preset-screen` or `restore-screen`) or toggle CRT classes.
  * Focus and blur handlers sync `activeMenuIndex` and toggle the `menu-focus` class.

### 3. Keyboard Event Capture (Shortcuts and Arrows)
* **Event Interception** (`web/static/app.js` lines 191-226):
  * Keyboard events are captured on the `window` using a `"keydown"` event listener.
  * Keypresses are ignored if the active screen is not `"startup-screen"`, or if the user is typing in a form input/textarea/select element.
* **Shortcut Triggers**:
  * `'1'` clicks the first button (`btn-new-game`).
  * `'2'` clicks the second button (`btn-restore-game`).
  * `'t'` or `'T'` clicks the third button (`btn-toggle-crt`).
* **Arrow Navigation and Enter** (`web/static/app.js` lines 1012-1037):
  * Up/Down Arrow keys prevent default scrolling and invoke `handleArrowNavigation(e, buttons)`.
  * `ArrowDown` wraps around to `0` from the bottom, and `ArrowUp` wraps around to the last index from the top.
  * `Enter` clicks the currently focused menu item if `activeMenuIndex !== -1`.

---

## Proposed Implementation Strategy

To resolve the default highlight issues and ensure robust keyboard navigation, the following two-step change is recommended:

### Step 1: Remove `autofocus` from `#console-input`
In `web/templates/index.html` (line 182), remove the `autofocus` attribute. This is safe because `showScreen("gameplay-screen")` already calls `focus()` programmatically when entering the gameplay dashboard:
```javascript
// web/static/app.js (line 252)
document.getElementById("console-input").focus();
```

**Proposed Change in `web/templates/index.html` (Line 182)**:
* **Before**:
  ```html
  <input type="text" id="console-input" placeholder="Type gameplay action here (e.g. open mailbox)..." autocomplete="off" autofocus>
  ```
* **After**:
  ```html
  <input type="text" id="console-input" placeholder="Type gameplay action here (e.g. open mailbox)..." autocomplete="off">
  ```

### Step 2: Initialize Startup Screen State on DOM Load
Call `showScreen("startup-screen")` at the end of the `DOMContentLoaded` listener in `web/static/app.js`. This will explicitly reset `activeMenuIndex = -1` and blur all buttons, clearing any initial browser-assigned focus and preventing a default visual highlight on startup.

**Proposed Change in `web/static/app.js` (Line 226-227)**:
* **Before**:
  ```javascript
      });
  });
  ```
* **After**:
  ```javascript
      });
      
      // Initialize the startup screen and clear default focus/highlight states
      showScreen("startup-screen");
  });
  ```

---

## Code Diffs Reference

### `web/templates/index.html`
```diff
@@ -182,1 +182,1 @@
-                         <input type="text" id="console-input" placeholder="Type gameplay action here (e.g. open mailbox)..." autocomplete="off" autofocus>
+                         <input type="text" id="console-input" placeholder="Type gameplay action here (e.g. open mailbox)..." autocomplete="off">
```

### `web/static/app.js`
```diff
@@ -225,3 +225,6 @@
         }
     });
+    
+    // Initialize the startup screen and clear default focus/highlight states
+    showScreen("startup-screen");
 });
```
