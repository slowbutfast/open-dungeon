## Automated Tests

- `python3 -m pytest tests/test_barter_engine.py -v`: Verifies barter contract creation, deterministic trade validation, atomic item swaps, and quest goal state machine transitions.
- `python3 -m pytest tests/test_api_endpoints.py -v`: Verifies `/api/trade` and `/api/goals` endpoint responses, local rejection for unowned items, and `[SYSTEM EVENT]` prompt injection.
- `python3 -m pytest tests/e2e/test_barter_ui.py -v`: Playwright browser test verifying interactive action chips (`💬 Talk`, `🔄 Barter`), Barter UI Modal rendering, and one-click trading.

## Manual Verification

- **Interactive Barter Action Chips**:
  - **WHEN** DM narration mentions an NPC or trader
  - **THEN** interactive action chips (`💬 Talk`, `🔄 Barter`) are rendered below the narrative stream
- **Barter UI Modal Trading**:
  - **WHEN** user clicks the `🔄 Barter` action chip
  - **THEN** retro Barter UI Modal displays player inventory side-by-side with trader offers, enabling one-click trade execution
