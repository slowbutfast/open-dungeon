# Frontend Architecture & Structure Documentation

This document describes the structure, state management, event routing, and API contracts of the Single Page Application (SPA) web frontend.

---

## 1. Screens & Navigation Flow
The application switches between 6 main screens by toggling the `.hidden` and `.active` CSS classes on their wrapper elements.

- **Startup Screen (`#startup-screen`)**:
  - The initial view. Displays the application banner, the LLM connection status indicator (`#llm-status-pill`), and three primary choices:
    - `[1] Begin New Simulation` (`#btn-new-game`)
    - `[2] Restore Saved Simulation` (`#btn-restore-game`)
    - `[T] Toggle CRT Scanlines` (`#btn-toggle-crt`)
- **Story Genesis Presets Screen (`#preset-screen`)**:
  - Displays a grid (`#preset-list`) of pre-configured adventure templates loaded dynamically from `/api/presets`.
  - Navigation: "Back" (startup screen), "Customize Story" (`#btn-preset-customize`), "Next: Character Select" (`#btn-preset-next`), and "Custom Adventure" (`#btn-custom-preset`).
- **Custom Universe Configuration Screen (`#custom-preset-screen`)**:
  - Allows editing details for custom settings (Adventure Title `#custom-title`, Summary `#custom-summary`, and Narrator System Prompt `#custom-system-prompt`).
  - Navigation: "Back" (preset screen) and "Next: Character Select" (`#btn-submit-custom-preset`).
- **Character Genesis Screen (`#character-screen`)**:
  - Displays preset character avatars (`#character-grid`) or a custom creation form (`#custom-character-form`).
  - Navigation: "Back", "Customize Character / Select Preset Hero" (`#btn-char-custom-toggle`), and "Launch Simulation" (`#btn-submit-character`).
- **Restore Saved Simulation Screen (`#restore-screen`)**:
  - Lists saved sessions (`#save-list` loaded from `/api/saves`).
  - Item Options: "Restore" (loads save via API and opens gameplay) and "Delete" (prompts confirmation then deletes).
- **Gameplay Dashboard Screen (`#gameplay-screen` / class `.game-dashboard`)**:
  - **Status Bar**: Live feedback of `#val-location`, `#val-score`, `#val-moves`, and `#val-title`.
  - **Console Log**: Scrollable text log (`#console-log`) and streaming active text box (`#streaming-box`).
  - **Suggestions**: Interactive recommendation chips (`#suggestions-list`).
  - **Control Line**: Main command input field (`#console-input`) and Send button (`#btn-send`).
  - **Utility Bar**: Utility command triggers (`#btn-undo`, `#btn-retry`, `#btn-continue`, `#btn-scan`, `#btn-system-edit`, `#btn-menu`).
  - **Sidebar Tabs**: Toggles between Lorebook list/editor (`#tab-lore`, `#btn-add-lore`, `#lore-cards-list`) and memory summary/token controls (`#tab-memory`, `#summary-editor`, `#btn-save-summary`, `#token-limit-slider`).

---

## 2. Frontend State Variables (`web/static/app.js`)
- `presets`: Array of loaded story presets.
- `selectedPresetIdx`: Currently selected preset template index (null if custom preset).
- `selectedCharacterIdx`: Currently selected character template index (null if custom character).
- `currentGameState`: Active game state JSON object returned by `/api/state`.
- `commandHistory`: Array of input commands (for history cycling using Up/Down arrows inside the gameplay input console).
- `historyIndex`: Pointer to active command history index.
- `confirmResolve`: Promise resolver function for the confirmation modal overlay (`#modal-confirm`).
- `storyCustomized`: Boolean flag set to true if the user customized story properties.
- `activeMenuIndex`: Index of focused startup menu button (-1 if none).
- `toastTimer`: Timeout reference for dismissing notifications.

---

## 3. Keyboard Event Interceptors (`window.addEventListener("keydown")`)
Listens to global keyboard inputs to implement rich retro terminal hotkeys. It bypasses interception if an input, textarea, select is focused or if on the gameplay dashboard screen.

- **Startup Screen**:
  - `1`: Triggers "Begin New Simulation" (`#btn-new-game`).
  - `2`: Triggers "Restore Saved Simulation" (`#btn-restore-game`).
  - `t` or `T`: Toggles styling classes for CRT phosphor scanlines (`#btn-toggle-crt`).
  - `ArrowDown` / `ArrowUp`: Cyclically focuses buttons and updates `activeMenuIndex` with the `.menu-focus` highlight style.
  - `Enter`: Activates the currently focused button.
- **Preset Screen**:
  - `ArrowLeft` / `ArrowRight` / `ArrowUp` / `ArrowDown`: Navigates preset card selection.
  - `Enter`: Navigates to character genesis screen (if a preset card is active).
  - `Escape`: Returns to Startup Screen.
- **Character Genesis Screen**:
  - `ArrowLeft` / `ArrowRight` / `ArrowUp` / `ArrowDown`: Navigates character card selection.
  - `Enter`: Launches the game simulation (`#btn-submit-character`).
  - `Escape`: Returns to previous screen.
- **Restore Screen & Custom Preset Screen**:
  - `Escape`: Returns to previous screen.

---

## 4. API Endpoints
- `GET /api/presets` - Fetches story templates.
- `GET /api/ping` - Obtains connection details and LLM state.
- `GET /api/state` - Retreives current adventure session state.
- `POST /api/init` - Generates character and launches game.
- `POST /api/action` - Sends action command; streams responses.
- `POST /api/system` - Saves system prompts.
- `POST /api/summary` - Saves memory summary.
- `GET /api/saves` - Lists saved slots.
- `POST /api/saves/<id>` - Loads save game.
- `DELETE /api/saves/<id>` - Wipes save slot.
- `POST /api/lore` - Creates, deletes, or toggles lore cards.
- `POST /api/scan` - Scans history for context entities.
- `POST /api/settings` - Updates general parameters (e.g. `max_tokens`).
