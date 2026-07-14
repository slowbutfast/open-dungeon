## Target Context Map

| File Path | Description | Expected Range |
|---|---|---|
| `tests/test_api_endpoints.py` | Add TDD test for default system prompt verification | Line 130-137 |
| `engine/index.js` | Update examples in `DEFAULT_SYSTEM_PROMPT` | Line 24-39 |

## 1. Test Scaffolding (TDD)

- [ ] 1.1 Add a test to `tests/test_api_endpoints.py` (e.g. `test_default_system_prompt_moves`) that initializes a custom adventure (preset -1 or default) and asserts that the returned prompt includes `Moves: 0`, `Moves: 1`, and `Moves: 2` in its examples.

## 2. Core Implementation

- [ ] 2.1 Update `DEFAULT_SYSTEM_PROMPT` in `engine/index.js` to add the moves field to the examples:
  - Example 1: `[Status: West of House | Score: 0 | Moves: 0]`
  - Example 2: `[Status: West of House | Score: 0 | Moves: 1]`
  - Example 3: `[Status: North of House | Score: 0 | Moves: 2]`
- [ ] 2.2 Run `python3 -m pytest tests/` to verify all tests pass (including the new test).
