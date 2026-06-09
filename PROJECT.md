# Project: Retro Text-Adventure Web UI Enhancements

## Architecture
- **Backend**: Python Flask server (`web/server.py`) serving static assets, templates, and exposing REST APIs for game state and SSE streams.
- **Frontend**: Single-page application (`web/templates/index.html`) styled via `web/static/style.css` and controlled via interactive JavaScript in `web/static/app.js`.
- **Game Engine**: Python-based adventure engine (`game/adventure_engine.py`) managing adventure states, saves, history, and LLM integrations.

## Code Layout
- `web/server.py` — Flask server and REST/SSE endpoints.
- `web/templates/index.html` — Main UI layout.
- `web/static/app.js` — Frontend state, event handlers, SSE rendering, keyboard navigation.
- `web/static/style.css` — Terminal-style UI styling, animations, scanlines.
- `game/` — Game core logic (story preset management, adventure engine).
- `tests/` — Backend unit tests and integration mocks.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Keyboard Navigation (R1) | Implement arrow key navigation, startup shortcuts (1, 2, T/t), Enter key activation, and default focus prevention on startup. | None | PLANNED |
| 2 | M2: Loading States (R2) | Implement loading indicator/state on "Launch Simulation" button and disable other character genesis screen inputs during initialization. | None | PLANNED |
| 3 | M3: Atomic State Rendering (R3) | Eliminate visual streaming flash by atomically transitioning streaming box visibility and final history render. | None | PLANNED |
| 4 | M4: E2E Integration (Tiers 1-5) | Pass all E2E test tiers (1-4) and complete white-box adversarial hardening (Tier 5). | M1, M2, M3 | PLANNED |

## Interface Contracts
### Frontend ↔ Backend API
- `POST /api/init`
  - Input: `{"preset_idx": int/null, "title": str/null, "summary": str/null, "system_prompt": str/null, "character": {"name": str, "type": str, "desc": str, "triggers": list/str}}`
  - Output: `{"status": "success", "adventure_id": str}`
- `POST /api/action` (SSE Event Stream)
  - Input: `{"action_type": str, "text": str}`
  - Output stream data events: `{"type": "token"|"status"|"result"|"error", "content": str}`
