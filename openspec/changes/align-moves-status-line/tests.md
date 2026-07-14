## Automated Tests

- `python3 -m pytest tests/test_api_endpoints.py`: Verifies that endpoints (initialization, action streaming, states) work correctly with the new prompt configuration.
- `python3 -m pytest tests/test_memory_features.py`: Verifies that moves parser backward compatibility (testing parsing with and without the Moves field) remains fully functional.

## Manual Verification

- **Default System Prompt Content**:
  - **WHEN** initializing a new custom adventure (no preset selected)
  - **THEN** the initialized system prompt in `state.systemPrompt` contains:
    - `[Status: West of House | Score: 0 | Moves: 0]` (Example 1)
    - `[Status: West of House | Score: 0 | Moves: 1]` (Example 2)
    - `[Status: North of House | Score: 0 | Moves: 2]` (Example 3)
