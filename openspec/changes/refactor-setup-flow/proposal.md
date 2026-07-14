## Why

Currently, the setup flow for starting a new simulation session is fragile: backing out of character selection discards user customized settings, and there is no visual indicator to orient players in the setup sequence. Furthermore, universe templates (story presets) are static and hardcoded in memory, preventing players from saving, editing, or deleting custom universe configurations.

## What Changes

- **Modified Game Setup Flow**: Introduce a step-by-step progress indicator and correct back-button routing to ensure player customized state is preserved throughout the setup wizard.
- **Improved Keyboard Focus**: Programmatically focus cards and buttons when switching screens to ensure keyboard navigation works seamlessly out-of-the-box.
- **Dedicated Preset Manager Screen**: Separate Concerns by introducing a dedicated screen to create, edit, and delete permanent universe preset templates.
- **Filesystem-Backed Presets**: Load, save, and delete presets dynamically from a local `presets.json` file in the game engine.

## Capabilities

### New Capabilities
- `preset-management`: Persistent creation, modification, and deletion of custom universe preset templates via a JSON config file and dynamic UI editor.

### Modified Capabilities
- `game-engine`: Load presets dynamically from the filesystem and support RESTful CRUD endpoints for preset templates.

## Impact

- Affects `web/templates/index.html` (new screens, editor layouts, progress indicators).
- Affects `web/static/js/` modules (`app.js`, `ui/screens.js`, `api/presets.js`).
- Affects backend routing in `web/routes/game.js` and engine configuration in `engine/index.js` and `engine/storyPresets.js`.
