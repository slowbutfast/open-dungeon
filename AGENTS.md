# Agent Conventions

## Architecture Documentation

Each major component has a co-located architecture doc. Make sure you update
the respective doc after making any changes to a module:

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
| Run tests | `python -m pytest tests/ -v` (CLI tests deprecated — see `tests/ARCHITECTURE.md`) |
| E2E tests (Playwright) | Configured in `tests/e2e/` |

## Deprecations

The legacy Python CLI proxy (`game/adventure_engine.py`) and its test suite
(`test_cli_behavior.py`, `test_pty_integration.py`, `simulate_playtest.py`)
are **deprecated**. Tests may fail — do not block work on them.