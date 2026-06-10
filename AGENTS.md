# Agent Conventions

## Architecture Documentation

Each major component has a co-located architecture doc:

| Component | Location |
|-----------|----------|
| Game Engine | `engine/ARCHITECTURE.md` |
| Web Frontend | `web/FRONTEND_ARCHITECTURE.md` |
| Test Suite | `tests/ARCHITECTURE.md` |

## Stack

- **Backend**: Node.js/Express (`web/server.js` + `engine/`)
- **Frontend**: Vanilla JS, no build step — native ESM modules loaded via `<script type="module">`
- **Python client proxy**: `game/adventure_engine.py` — legacy compatibility layer for the Python CLI

## Run Commands

| Task | Command |
|------|---------|
| Start server | `node web/server.js` |
| Run tests | `python -m pytest tests/ -v` |
| E2E tests (Playwright) | Configured in `tests/e2e/` |