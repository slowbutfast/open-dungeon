# Frontend Architecture & Structure Documentation

This document describes the structure, state management, event routing, and API contracts of the Single Page Application (SPA) web frontend.

---

## 1. File Layout (ES Modules, Zero-Build)

```
web/static/
  js/
    app.js              (bootstrap — event wiring, window compatibility)
    state.js            (pub/sub reactive store for shared state)
    utils.js            (pure utility functions)
    ui/
      toast.js          (showToast, showConfirm)
      screens.js        (screen routing, modals, sidebar tabs, CRT toggle)
      renderers.js      (DOM rendering — state, suggestions, lore, inventory, etc.)
    components/
      barterModal.js    (Barter Modal UI — inventory + trader offers side-by-side)
      actionChips.js    (Action chips — Talk, Barter, Goals rendered from NPC entities)
      mapPanel.js       (MAP panel — cartographic + node-graph render modes, current-room highlight)
    api/
      saves.js          (loadSavesList, loadSaveGame, deleteSaveGame)
      settings.js       (pingLlm, saveSystemPrompt, saveSummaryMemory)
      presets.js        (loadPresets, loadCharactersList, launchSimulation)
      lore.js           (toggleLoreCard, editLoreCard, saveLoreCard, triggerLoreScan)
      memory.js         (syncState, syncMemoryAndLore, syncMemoryDetails)
      streaming.js      (submitPlayerCommand, executeStreamAction, revealAssistantText)
      debug.js          (pollDebugData, startDebugPolling, toggleCallDetails)
      barter.js         (fetchInventory, fetchOffers, executeTrade, fetchGoals, createGoal, completeGoal, acceptGoal, failGoal)
      map.js            (fetchMap — spatial room graph for the MAP panel)
      auth.js           (initAuthBanner, renderQuota, handleAuthError — sign-in/profile + quota) 
  style.css
```

**Loading**: `index.html` loads `<script type="module" src="/static/js/app.js">`. No bundler — native ESM via Express `express.static`.

### Module Dependency Tree

```
app.js
  ├── state.js          (leaf — no deps)
  ├── utils.js          (leaf — no deps)
  ├── ui/toast.js       (leaf — no deps)
  ├── ui/screens.js     ── utils.js (scrollToBottom), components/mapPanel.js
  ├── ui/renderers.js   ── utils.js (cleanMarkdownText, scrollToBottom, escapeHtml)
  ├── components/barterModal.js  ── ui/toast.js, ui/screens.js, api/memory.js, api/barter.js
  ├── components/actionChips.js  ── components/barterModal.js, ui/toast.js, state.js, api/barter.js
  ├── components/mapPanel.js     ── api/map.js
  ├── api/settings.js   ── ui/toast.js, ui/screens.js
  ├── api/saves.js      ── ui/toast.js, ui/screens.js
  ├── api/presets.js    ── ui/screens.js
  ├── api/lore.js       ── ui/toast.js, ui/screens.js, utils.js
  ├── api/memory.js     ── ui/renderers.js
  ├── api/streaming.js  ── utils.js, ui/screens.js, ui/renderers.js, api/memory.js, components/actionChips.js, components/mapPanel.js, api/auth.js
  ├── api/debug.js      ── utils.js, ui/renderers.js
  ├── api/barter.js     (leaf — no module deps)
  ├── api/map.js        (leaf — no module deps)
  └── api/auth.js       (leaf — no module deps)
```

`components/mapPanel.js` is imported by both `ui/screens.js` (tab activation) and `api/streaming.js` (post-turn refresh); it depends only on `api/map.js`, so there is no dependency cycle.

---

## 2. State Management (`js/state.js`)

All shared state is managed through a simple pub/sub store.

```js
getState()        // returns current state object
updateState({})   // merges partial state, notifies subscribers, syncs to window.*
subscribe(fn)     // registers listener, returns unsubscribe function
resetState()      // resets to initial values
```

State fields managed by the store:

| Field | Initial | Used by |
|---|---|---|
| `presets` | `[]` | presets.js, screens.js |
| `selectedPresetIdx` | `null` | presets.js |
| `selectedCharacterIdx` | `null` | presets.js |
| `currentGameState` | `null` | memory.js, streaming.js, settings.js, lore.js |
| `commandHistory` | `[]` | streaming.js |
| `historyIndex` | `-1` | streaming.js |
| `storyCustomized` | `false` | presets.js |
| `activeMenuIndex` | `-1` | app.js (arrow nav), screens.js |

### Migration Bridge

All module functions are also assigned to `window.*` via `Object.assign` in `app.js` so that existing inline `onclick` handlers (e.g., `showScreen(...)`, `closeModal(...)`, `switchSidebarTab(...)`) continue to work. This bridge can be removed once all inline handlers are converted to programmatic `addEventListener` calls.

---

## 3. Screens & Navigation Flow

The application switches between 6 main screens by toggling the `.hidden` and `.active` CSS classes on their wrapper elements. Managed by `showScreen()` in `js/ui/screens.js`.

- **Startup Screen (`#startup-screen`)**:
  - The initial view. Displays the application banner, the LLM connection status indicator (`#llm-status-pill`), and three primary choices:
    - `[1] Begin New Simulation` (`#btn-new-game`)
    - `[2] Restore Saved Simulation` (`#btn-restore-game`)
    - `[T] Toggle CRT Scanlines` (`#btn-toggle-crt`)
- **Story Genesis Presets Screen (`#preset-screen`)**:
  - Displays a grid (`#preset-list`) of pre-configured adventure templates loaded dynamically from `/api/presets` via `loadPresets()` in `js/api/presets.js`.
  - Navigation: "Back" (startup screen), "Customize Story" (`#btn-preset-customize`), "Next: Character Select" (`#btn-preset-next`), and "Custom Adventure" (`#btn-custom-preset`).
- **Custom Universe Configuration Screen (`#custom-preset-screen`)**:
  - Allows editing details for custom settings (Adventure Title `#custom-title`, Summary `#custom-summary`, and Narrator System Prompt `#custom-system-prompt`).
  - Navigation: "Back" (preset screen) and "Next: Character Select" (`#btn-submit-custom-preset`).
- **Character Genesis Screen (`#character-screen`)**:
  - Displays preset character avatars (`#character-grid`) or a custom creation form (`#custom-character-form`).
  - Navigation: "Back", "Customize Character / Select Preset Hero" (`#btn-char-custom-toggle`), and "Launch Simulation" (`#btn-submit-character`).
- **Restore Saved Simulation Screen (`#restore-screen`)**:
  - Lists saved sessions (`#save-list` loaded from `/api/saves` via `loadSavesList()` in `js/api/saves.js`).
  - Item Options: "Restore" (loads save via API and opens gameplay) and "Delete" (prompts confirmation then deletes).
- **Gameplay Dashboard Screen (`#gameplay-screen` / class `.game-dashboard`)**:
  - **Status Bar**: Live feedback of `#val-location`, `#val-score`, `#val-moves`, and `#val-title`.
  - **Console Log**: Scrollable text log (`#console-log`) and streaming active text box (`#streaming-box`).
  - **Action Chips**: Interactive chips (`#action-chips-list` inside `#action-chips`) rendered by `actionChips.js` — `💬 Talk`, `🔄 Barter`, `📜 Goals` for each detected NPC/trader entity in the narration.
  - **Suggestions**: Interactive recommendation chips (`#suggestions-list`) rendered by `renderSuggestions()` in `js/ui/renderers.js`.
  - **Control Line**: Main command input field (`#console-input`) and Send button (`#btn-send`). Handled by `submitPlayerCommand()` in `js/api/streaming.js`.
  - **Utility Bar**: Utility command triggers (`#btn-undo`, `#btn-retry`, `#btn-continue`, `#btn-scan`, `#btn-system-edit`, `#btn-menu`).
  - **Sidebar Tabs**: Toggles between Lorebook list/editor (`#tab-lore`, `#btn-add-lore`, `#lore-cards-list`), memory summary/token controls (`#tab-memory`, `#summary-editor`, `#btn-save-summary`, `#token-limit-slider`), and the MAP panel (`#tab-map`, `#tab-btn-map`, `#map-panel`, `#map-mode-toggle`). Tab switching via `switchSidebarTab()` in `js/ui/screens.js`, which calls `refreshMapPanel()` when the map tab is selected.
  - **Mobile Tab Bar (`#mobile-tab-bar`)**: Bottom `.mobile-tab` buttons (`data-panel`) switch the console/sidebar on small viewports. The MAP entry (`data-panel="map"`) routes through `Screens.switchSidebarTab("map")` in `js/app.js`.
  - **Barter Modal (`#modal-barter`)**: Side-by-side modal showing player inventory (left) and trader offers (right). Supports one-click trade execution. Managed by `barterModal.js`.

---

## 4. Keyboard Event Interceptors (`window.addEventListener("keydown")` in `js/app.js`)

Listens to global keyboard inputs to implement rich retro terminal hotkeys. Bypasses interception if an input, textarea, or select is focused, or if on the gameplay dashboard screen.

- **Startup Screen**:
  - `1`: Triggers "Begin New Simulation" (`#btn-new-game`).
  - `2`: Triggers "Restore Saved Simulation" (`#btn-restore-game`).
  - `t` or `T`: Toggles styling classes for CRT phosphor scanlines (`#btn-toggle-crt`).
  - `ArrowDown` / `ArrowUp`: Cyclically focuses buttons via `handleArrowNavigation()` and updates `activeMenuIndex` with the `.menu-focus` highlight style.
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

## 5. API Endpoints

Consumed by modules in `js/api/`:

| Method | Endpoint | Module | Purpose |
|---|---|---|---|
| GET | `/api/presets` | presets.js | Fetches story templates |
| GET | `/api/ping` | settings.js | Connection details and LLM state |
| GET | `/api/state` | memory.js | Current adventure session state |
| POST | `/api/init` | presets.js | Generates character and launches game |
| POST | `/api/action` | streaming.js | Sends action command; streams SSE response |
| POST | `/api/system` | settings.js | Saves system prompts |
| POST | `/api/summary` | settings.js | Saves memory summary |
| GET | `/api/saves` | saves.js | Lists saved slots |
| POST | `/api/saves/<id>` | saves.js | Loads save game |
| DELETE | `/api/saves/<id>` | saves.js | Wipes save slot |
| POST | `/api/lore` | lore.js | Creates, deletes, or toggles lore cards |
| POST | `/api/scan` | lore.js | Scans history for context entities |
| POST | `/api/settings` | app.js (bootstrap) | Updates general parameters (e.g. `max_tokens`, `model`) |
| GET | `/api/memory/inventory` | memory.js | Fetches current inventory items |
| GET | `/api/memory/events` | memory.js | Fetches recent event log |
| GET | `/api/memory/stats` | memory.js | Fetches memory statistics |
| GET | `/api/debug/info` | debug.js | Fetches LLM call info and debug logs |
| GET | `/api/map` | map.js | Fetches the spatial room graph (rooms, edges, regions, current room) |
| POST | `/api/trade/offer` | barterModal.js | Registers a barter trade offer |
| GET | `/api/trade/offers` | barterModal.js | Lists barter offers for a trader |
| POST | `/api/trade` | barterModal.js | Executes a barter trade (SSE stream) |
| POST | `/api/goals` | actionChips.js | Creates a quest goal |
| GET | `/api/goals` | actionChips.js | Lists active quest goals |
| POST | `/api/goals/complete` | actionChips.js | Completes a quest goal (SSE stream) |

---

## 6. Key Rendering Pipeline

1. User submits command → `submitPlayerCommand()` in `js/api/streaming.js`
2. Slash commands are intercepted locally; regular actions POST to `/api/action`
3. SSE stream is consumed by `executeStreamAction()` — accumulates chunks, filters system events
4. On stream end → re-fetches `/api/state`, calls `renderState()` with `skipLastAssistant=true`
5. Immediately after that post-stream `renderState(state, true)`, `refreshMapPanel()` (in `js/api/streaming.js`) refreshes the MAP panel from `/api/map` through the existing post-turn render cycle — scoped to this path, no store refactor (GH #31)
6. The final assistant response is revealed character-by-character via `revealAssistantText()`
7. After reveal completes → `setCurrentNarration(text)` in `actionChips.js` parses NPC/trader entities from the narration text and renders `💬 Talk`, `🔄 Barter`, `📜 Goals` chips below the console log
8. `syncMemoryAndLore()` silently updates sidebar (lore cards, inventory, event log, memory stats)
9. Clicking `🔄 Barter` opens the Barter Modal (`barterModal.js`) which fetches `/api/memory/inventory` and `/api/trade/offers` and displays them side-by-side; one-click trade executes via `POST /api/trade` and triggers a toast notification

The MAP panel renderer (`components/mapPanel.js`) is hand-rolled per D6: DOM room nodes (`.map-room[data-room-id]`) plus an SVG edge layer, zero-build with no graph library. Cartographic mode clusters rooms by region with curved walk paths, distinct portal/time arrows, and dashed inferred edges; node-graph mode renders straight labelled edges and highlights the current room.

The panel's sizing model keeps the graph within its container: `#map-canvas` is a panel-bound scroll box (`width: 100%`) that is never sized from JS, and only the inner `#map-canvas-content` layer is sized from the layout. `computeLayout(data, panelWidth)` is width-aware — it caps the columns per region to the available width and wraps region bands onto new rows, so a narrow sidebar grows downward instead of overflowing. After every render the current room is scrolled into view (clamped), and edge endpoints are trimmed to the room border (`boxBorderPoint`) so arrowheads are not hidden beneath the room nodes. The panel re-renders from its cached payload on a debounced `window resize` (150 ms) as well as on tab activation and post-turn refresh, so the desktop-sidebar ↔ mobile-tab switch re-lays out. Layout is deterministic per `(payload, width)`.

---

## 7. Authentication & Quota UI (`vercel-deployment-and-auth`)

When deployed on Vercel, every LLM-touching request is gated by the backend's
default-deny auth + quota middleware. The frontend surfaces that state through
`js/api/auth.js`:

- **Sign-in / profile banner** (`#auth-banner`, rendered into the startup
  header): `initAuthBanner()` calls `GET /api/user/me`. An authenticated user
  sees *"Signed in as &lt;name|email|sub&gt;"* plus a **Sign out** link to
  `/api/auth/logout`; otherwise a **Sign in with Vercel** link to
  `/api/auth/login` is shown.
- **Remaining-quota indicator** (`#val-quota` in the status bar):
  `initAuthBanner()` calls `GET /api/user/quota` and `renderQuota()` prints
  `$remaining / $limit`, flagging the element when the balance hits zero.
- **Live SSE updates**: `executeStreamAction()` recognizes the backend's
  `data: {"type":"user_quota", ...}` event and calls `renderQuota()`, so the
  balance decrements as each turn's cost is committed to the ledger.
- **HTTP failure handling**: `handleAuthError(status)` maps `401` →
  redirect to `/api/auth/login`, `402` → *"quota exhausted"* alert, and `429`
  → *"turn already in progress"* alert. It is invoked on the initial
  `/api/action` response and on the undo request so a rejected request never
  falls through to JSON parsing.

### Gated root document & static CDN serving

The root document (`/`) is **server-routed**, not statically rewritten.
`vercel.json` rewrites `/` → `/api/index.js`, and the Express handler in
`web/server.js` chooses the template: when `config.isVercel` is true and
`req.user` is null (no valid signed `od_session` cookie) it sends
`web/templates/gate.html` — a self-contained retro-terminal access gate with a
`[ Sign in with Vercel ]` trigger to `/api/auth/login`. Authenticated requests,
and every local-development request (where the auth middleware attaches
`LOCAL_DEV_USER`), receive `web/templates/index.html`. Because `/` always
returns HTTP 200 content — gate or app — it never issues a 302, which removes
the OAuth redirect-loop class entirely, and `index.html` and its presets are
never transmitted to an unauthenticated client.

`res.sendFile` resolves a runtime path, so Node File Trace cannot statically
discover the templates; `vercel.json` therefore declares
`functions["api/index.js"].includeFiles = "web/templates/**"` to bundle them
into the lambda. Without it the function would ENOENT at request time.

`/` is served from the function and its body depends on `od_session`, so the
handler sets `Cache-Control: private, no-store` and `Vary: Cookie`. Deployed
source paths are shadowed by `/web/(.*)`, `/engine/(.*)`, and `/mcp/(.*)`
redirects declared ahead of the rewrites: without them the CDN serves
`web/templates/index.html` directly and the gate only covers the bare `/` URL,
while the server source trees are served as static content.

Static assets stay on the Edge CDN: `/static/(.*)` → `/web/static/$1`, with
immutable caching for `/static/js/vendor/*` and `no-store` for the unbundled ES
modules. `api/index.js` is not invoked for them. Locally Express serves the
same files via `express.static`, so the zero-build ESM workflow is unchanged.

The gate's `?auth_error=` banner lives in `/static/js/gate.js`, loaded as a
module. The site-wide CSP sets `script-src 'self'`, so an inline handler would
be silently dropped in production — the external module keeps the failure
notice working without a `'sha256-…'` exemption.

### Fail-closed Diagnostic Reporting

When running on Vercel (`VERCEL=1`) without required secrets (`VERCEL_APP_CLIENT_ID`,
`VERCEL_APP_CLIENT_SECRET`, `SESSION_SECRET`, `OPENROUTER_API_KEY`, or `LLM_BACKEND`),
the Express server boots into fail-closed diagnostic mode rather than crashing lambda
cold-start initialization with `500 FUNCTION_INVOCATION_FAILED`. Requests to `/api/*`
(including `/api/auth/login`) return HTTP 500 with a rich, styled diagnostic HTML
page (or structured JSON if requested via API) detailing the missing variables,
configuration issues, and remediation steps. In addition, if redirected with
`?auth_error=`, `initAuthBanner()` in `js/api/auth.js` renders an informative notice
on the home screen.