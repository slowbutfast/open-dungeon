# Handoff Report: Keyboard Navigation & Default Highlight Fixes

## 1. Observation
I directly observed the following paths, line numbers, and content in the codebase:
- **`web/templates/index.html`** (lines 31-42) defines the startup screen buttons without `autofocus` or initial focus styling classes (like `menu-focus`):
  ```html
  <button id="btn-new-game" class="btn btn-secondary">
  ```
- **`web/static/app.js`** (line 12) initializes the active menu selection index to `-1`:
  ```javascript
  let activeMenuIndex = -1;
  ```
- **`web/static/app.js`** (lines 35-49) assigns visual highlights exclusively in response to browser `focus` and `blur` events:
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
- **`web/static/app.js`** (lines 191-226) captures keyboard inputs globally and handles shortcuts ('1', '2', 't'/'T') and navigation keys ('ArrowUp', 'ArrowDown', 'Enter').
- **`web/static/app.js`** (lines 253-264) resets navigation values when screen transitions back to the startup screen:
  ```javascript
  } else if (screenId === "startup-screen") {
      activeMenuIndex = -1;
      ...
      buttons.forEach(btn => {
          btn.classList.remove("menu-focus");
          btn.blur();
      });
  }
  ```
- **`web/static/app.js`** (lines 1012-1037) handles arrows and enter keys, shifting focus on arrow events using `buttons[activeMenuIndex].focus()`.

---

## 2. Logic Chain
1. **No startup focus/highlight**: Since `index.html` lacks autofocus attributes for the startup buttons, `activeMenuIndex` starts at `-1`, and the DOM load listener does not call `.focus()` or add `.menu-focus` to the first button, no menu choice has focus or highlight on initial load.
2. **First enter key failure**: If the user presses `Enter` key right after page load without first pressing an arrow key, `activeMenuIndex` remains `-1`, and `handleArrowNavigation` does not register the event to click the default action, causing keyboard interactions to feel broken initially.
3. **Loss of visual highlight on blur**: The current blur listener removes `.menu-focus` whenever a button loses browser focus. Clicking the page body or otherwise shifting focus off the buttons strips the menu-focus highlight entirely, even though keyboard navigation will still cycle from the last index when ArrowDown/ArrowUp is pressed.
4. **Resolution**:
   - Initializing `activeMenuIndex = 0` and manually adding `menu-focus` to the first button on startup provides visual highlighting without forcing browser focus.
   - Restricting `blur` class removal so it only fires if the index actually changes keeps the highlight visible.
   - Synchronizing this logic in `showScreen("startup-screen")` ensures transitions behave identically.

---

## 3. Caveats
- Browser-specific defaults for button focus are not tested. However, `style.css` contains `outline: none;` on focus, meaning normal browser outlines won't override or clash with the custom visual highlight.
- Text input focus is checked using `e.target.tagName`. This is sufficient for standard HTML input elements but might need expansion if custom elements or contenteditable divs are introduced.

---

## 4. Conclusion
The "Begin New Simulation" button is not focused or highlighted by default on startup. Achieving a visual highlight on startup without browser focus requires setting `activeMenuIndex = 0` on DOM load and screen reset, adding the `menu-focus` class manually on load, and keeping the highlighted class on blur for the active item.

---

## 5. Verification Method
1. **Manual Inspection**:
   - Inspect the modified `app.js` in a browser console.
   - Confirm that `btn-new-game` has the `menu-focus` class applied immediately on load.
   - Confirm `document.activeElement` is `body`, not the button.
2. **Keyboard Interaction Test**:
   - Load page -> Press `Enter` -> Should trigger New Simulation.
   - Load page -> Press `ArrowDown` -> Focus shifts to "Restore Saved Simulation".
   - Select option -> Click screen background -> Highlight on active option should persist.
3. **Automated Testing**:
   - Run backend test suite via `pytest` or Python unit tests:
     ```bash
     python3 -m unittest tests/test_api_endpoints.py
     ```
     (All tests should pass since we did not modify API behaviors).
