## Automated Tests

- **New — score rule unit tests** (`tests/test_scoring.py` or similar): given typed extractor events (`discovery`/`quest`/`combat`/`trade`), `scoreRule` returns the expected accumulated score; repeated/duplicate milestones do not double-count.
- **New — score advances across an arc** (integration): a multi-turn mock-LLM session covering a quest milestone ends with `dungeon_inspect_state.score > 0`, regardless of the mock narrator's status-line wording.
- **New — score save/load round-trip**: a session with a non-zero score saved and reloaded restores the same score (`dungeon_load_save` then `dungeon_inspect_state`).
- **New — score not frozen**: regression asserting a 10+ turn mock session ends with non-zero score (guards the original #19 failure).
- **Existing guard**: `python3 -m pytest tests/test_mcp_*.py -v` and the non-integration suite stay green.

## Manual Verification

- **Score progression**:
  - **WHEN** playing a multi-act session that completes a quest (e.g., the Datachip Run arc), then checking `dungeon_inspect_state`
  - **THEN** `score` is non-zero and reflects the completed milestone(s)
- **Score persistence**:
  - **WHEN** saving a session with a non-zero score and reloading it
  - **THEN** the restored score matches the saved value
