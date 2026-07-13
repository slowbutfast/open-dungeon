## Automated Tests

- `python -m pytest tests/test_memory_features.py`: Verifies that the memory features, batch extraction, and RAG search continue to work perfectly and that all items (e.g. rusty sword, iron key, cantina events) are correctly extracted and matched.

## Manual Verification

- **Starting Inventory Synchronization**:
  - **WHEN** a new adventure session is initialized via the wizard (e.g., Lord of the Rings universe with Valen the Warrior class).
  - **THEN** the gameplay console sidebar's "Inventory" tab immediately displays the character's starting equipment (e.g. "steel sword (x1)" and "shield (x1)") right as the starting scene loads.
- **Strict Item Possession Enforcement**:
  - **WHEN** a player types a command trying to use an item they do not possess (e.g., "use plasma rifle" when inventory is empty).
  - **THEN** the narrator output refuses the action, stating they do not have the item, and the moves count increments correctly on the status bar.
- **Moves Count Parsing Verification**:
  - **WHEN** the model returns a trailing status line of `[Status: Entrance | Score: 0 | Moves: 2]`.
  - **THEN** the status bar in the UI displays location as "Entrance", score as "0", and moves as "2", verifying the parser reads the moves directly from the LLM output.
