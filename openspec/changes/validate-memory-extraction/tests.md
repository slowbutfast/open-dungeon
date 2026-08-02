## Automated Tests

- **New — extractor validation tests** (new `tests/test_extractor_validation.py` or extend `tests/test_mcp_memory.py`): feed `eventExtractor.parseExtractedJson`/`_extractAndStore`-equivalent malformed outputs (missing fields, invalid type, invalid triggers) and assert they are rejected/skipped and not written to SQLite.
- **New — trigger filter tests**: assert lore facts with common-word triggers (`trade`, `score`, `north`, `door`) or mechanical vocabulary are rejected; assert a card with a valid multi-word trigger survives.
- **New — quantity parsing tests**: `"2 Coppers"` → stored `item_name` without the count and `quantity = 2`; `"Silver Ring"` unchanged.
- **New — name canonicalization tests**: `Rusty Gear` vs `Rusted Gear` resolve to the same canonical item on both write and read; `executeBarter`-style name lookups match.
- **New — summarization voice test**: the summary prompt output is second person (assert prompt text and, where feasible, a mock run).
- **Existing guard**: `python3 -m pytest tests/test_mcp_*.py -v` stays green (lore/inventory/events tools still return valid data).

## Manual Verification

- **Lore trigger sanity**:
  - **WHEN** playing several turns that extract lore cards, then calling `dungeon_inspect_lore`
  - **THEN** no card has a single common-word or mechanical trigger (e.g., no trigger of exactly `trade`, `score`, `north`)
- **Inventory name resolution**:
  - **WHEN** a trade references an item by a slightly different name than stored
  - **THEN** the trade resolves against the canonical item rather than failing with "no such item"
- **Summary voice**:
  - **WHEN** a session passes the summarization threshold and `dungeon_inspect_state` shows the summary
  - **THEN** the summary uses second person, not "the protagonist"
