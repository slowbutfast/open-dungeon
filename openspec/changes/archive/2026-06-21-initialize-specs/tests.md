## Automated Tests

Automated regression testing is configured for both the backend/CLI integrations and the visual web frontend.

- `python3 -m unittest discover -s tests`: Runs the Python unittest suite verifying:
  - API endpoint response and streaming under mock LLM configurations (`test_api_endpoints.py`).
  - Memory extraction pipelines including inventory, events, and stats (`test_memory_features.py`).
  - Terminal CLI components, menus, input handlers, and history (`test_cli_behavior.py`).
  - Simulated complete playtest runs (`simulate_playtest.py`).
- `pytest tests/e2e/`: Runs browser-based end-to-end tests using Playwright/pytest to verify frontend interface interactions, hotkeys, screen transitions, preset configurations, and save-slots lifecycle.

## Manual Verification

### Game Initialization & Loop
- **WHEN** running `python3 game/aidungeon_cli.py` with LM Studio active
- **THEN** it validates connection to the server, displays the Infocom header, shows options to begin a new adventure or restore a save, and renders the status bar.

### CLI Command Processing
- **WHEN** user starts a new adventure and enters game command `/help`
- **THEN** the help manual page is displayed in the terminal.
- **WHEN** user enters action commands (e.g. `look at room` or `/do open mailbox`)
- **THEN** the system streams LLM typewriter narration, updates location/score/moves on the top status bar, and appends actions/narration to the terminal.

### Diagnostic Tools Execution
- **WHEN** running `python3 diagnostics/diagnose_network.py`
- **THEN** it pings LM Studio host IP, checks port reachability, and returns diagnostics status.
- **WHEN** running `python3 diagnostics/list_models.py`
- **THEN** it contacts the server models endpoint and lists loaded models successfully.
