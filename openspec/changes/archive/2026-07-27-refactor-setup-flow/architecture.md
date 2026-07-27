## Context

Currently, the setup flow is a simple sequence of screens without robust state preservation on backtracking, and the story preset configurations are statically loaded from memory. We are introducing a dedicated Preset Manager screen and template editor to separate permanent template configurations from one-off game setups, alongside a visual wizard progress indicator and focus management.

## System Architecture Diagram

```mermaid
graph TD
    subgraph Frontend (index.html / app.js)
        Startup[Startup Screen]
        PresetList["Select Universe (#preset-screen)"]
        CustomPreset["Customize Boundaries (#custom-preset-screen)"]
        CharacterSelect["Hero Genesis (#character-screen)"]
        LoadGame["Load Game (out of scope)"]
        
        PresetManager["Preset Manager (#preset-manager-screen)"]
        PresetEditor["Preset Template Editor (#preset-editor-screen)"]
    end

    subgraph Backend (Express Server)
        API_Presets["/api/presets[/:index]"]
        API_Init[/api/init]
        PresetsJSON[(presets.json)]
    end

    Startup -->|1: Begin Game| PresetList
    Startup -->|2: Load Game| LoadGame
    Startup -->|3: Manage Presets| PresetManager
    
    PresetList -->|Customize| CustomPreset
    PresetList -->|Next| CharacterSelect
    CustomPreset -->|Next| CharacterSelect
    CharacterSelect -->|Launch| API_Init
    
    PresetManager -->|Create / Edit| PresetEditor
    PresetEditor -->|Save| API_Presets
    API_Presets <--> PresetsJSON
```

## Goals / Non-Goals

**Goals:**
- Separate concern of editing permanent presets from setting up a single playtest session by creating `#preset-manager-screen` and `#preset-editor-screen`.
- Support JSON-backed persistence for presets (`presets.json`).
- Ensure setup wizard backtracking preserves user-customized configurations.
- Display a dynamic step-by-step wizard progress indicator on setup screens.
- Programmatically manage keyboard focus on transition.

**Non-Goals:**
- Do not modify save file isolation logic (this is tracked separately in GitHub Issue #6).
- Do not modify the gameplay HUD or debug panels.

## Decisions

- **Decision 1: Create Separate Screen for Preset Management (Option 2)**:
  - *Rationale*: Keeps components modular and separated by concern, preventing edits to template presets from interfering with active one-off session configurations.
  - *Alternatives considered*: Editing presets within the new session flow. Rejected due to tight coupling and risk of confusing the user on whether they are editing a one-off session or a permanent template.
- **Decision 2: Persistent presets.json in Game Directory**:
  - *Rationale*: Persisting presets in `game/presets.json` (or derived from `SAVE_DIR` in tests) allows template modification to survive restarts, while still maintaining full isolation during automated tests.
  - *Seed/fallback strategy*: On first run or when `presets.json` is missing/unreadable, the loader falls back to the hardcoded list in `engine/storyPresets.js` as the initial source of truth (see tasks.md 2.1). This defines first-run seeding and recovery behavior.
  - *Path resolution*: The presets file path MUST be derived from the same `SAVE_DIR` environment convention as save files, to avoid silent split-brain between prod and test environments.
  - *Alternatives considered*: Database storage. Rejected because SQLite is too heavy for simple preset config, and JSON is human-readable and easily checked into git if needed.
- **Decision 3: Wizard State Preservation via `window.storyCustomized`**:
  - *Rationale*: Backtracking from Step 3 (Hero Genesis) to Step 2 (Customize Boundaries) must not discard user-edited Title/Summary/Prompt. Persisting a `window.storyCustomized` flag (and the customized payload) in `app.js` decouples transient session state from the permanent preset store, so back buttons read from this cache instead of resetting.
  - *Alternatives considered*: Re-query the engine for the session state. Rejected because session customization is a frontend-only transient concern and round-tripping through the backend would couple setup flow to engine lifecycle.
- **Decision 4: Programmatic Keyboard Focus with Empty-List Fallback**:
  - *Rationale*: Entering `#preset-screen` or `#character-screen` should auto-focus the first active card so arrow-key navigation works without a mouse click. `ui/screens.js` focuses the first card/input on transition. When the grid is empty (no saved presets, no characters), focus MUST fall back to the screen's primary CTA (e.g., "+ Create Preset Template") to avoid an inaccessible dead state.
  - *Alternatives considered*: Leave focus on the screen container. Rejected because it breaks keyboard-only navigation and screen-reader expectations on entry.

## Risks / Trade-offs

- **Risk: Breaking existing E2E navigation tests**
  - *Mitigation*: The E2E tests in `test_menu_navigation.py` use keyboard shortcuts (1, 2, Enter, Escape) to test setup menu navigation. We must update the keyboard event interceptors in `app.js` to support the new screen flow and focus management without changing the existing screen hotkeys.
- **Risk: Index-shift on delete breaks subsequent PUT/DELETE**
  - *Mitigation*: `/api/presets/:index` uses array position; deleting a preset shifts subsequent indices. The frontend must re-fetch the preset list after every mutation and never cache indices across operations. The spec's PUT/DELETE scenarios assume the caller holds a freshly fetched index.
- **Risk: Empty preset/character list leaves focus in an inaccessible dead state**
  - *Mitigation*: Decision 4's empty-list fallback focuses the primary CTA; manual verification in `tests.md` should include an empty-state focus assertion, not just the "first card exists" case.
- **Risk: Accessibility regression from programmatic focus on back navigation**
  - *Mitigation*: Focus restoration must target a sensible landmark (heading or primary CTA), not an arbitrary nested element, so screen-reader users retain orientation when traversing back through the wizard.

## Testing

- **Automated (API CRUD)**: `python3 -m pytest tests/test_api_endpoints.py` covers GET/POST/PUT/DELETE on `/api/presets` and serves as the regression guard for the `storyPresets.js` first-run fallback seed (tests.md).
- **Automated (E2E navigation)**: `pytest tests/e2e/test_menu_navigation.py` covers keyboard hotkeys, arrow-card cycling, and launcher states across the refactored wizard sequence.
- **Manual**: See `tests.md` for the four manual verification paths (Preset CRUD, Wizard Navigation State Preservation, Progress Indicator Alignment, Keyboard Focus Management). The Focus Management case should be extended to cover the empty-list fallback described in Decision 4.

## Spec Gaps

The `preset-management/spec.md` only specifies preset CRUD Requirements. The following proposal items have no matching spec Requirements and should be added before implementation:
- Wizard progress indicator (programmatically displays the active step on setup screens)
- Keyboard focus management on screen transition
- Backtracking state preservation across wizard steps

These belong as Requirements (not just scenarios) so the spec matches the proposal's stated capabilities.
