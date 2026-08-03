## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing tests: malformed extractor output is rejected and not written to SQLite
- [x] 1.2 Write failing tests: common-word / mechanical-vocabulary triggers are rejected; valid multi-word triggers survive
- [x] 1.3 Write failing tests: leading quantity parsed out of `item_name` into `quantity`
- [x] 1.4 Write failing tests: equivalent item names (Rusty/Rusted, case, articles) resolve to the same canonical item on write and read
- [x] 1.5 Write failing test: summarization prompt holds second person

## 2. Extractor Validation

- [x] 2.1 Implement `validateExtractorOutput(output)` in `engine/memory/eventExtractor.js` (schema check on events/inventory_changes/lore_facts)
- [x] 2.2 Wire validation into `memoryManager._extractAndStore` before `insertEvent`/`upsertInventoryItem`/`upsertLore`; skip + log invalid rows

## 3. Trigger Filtering

- [x] 3.1 Add trigger-token rules (length floor, common-word reject, mechanical-vocabulary stop-list)
- [x] 3.2 Apply trigger filtering before `upsertLore`; drop cards whose trigger list is entirely invalid

## 4. Quantity Parsing & Name Canonicalization

- [x] 4.1 Implement `normalizeInventoryChange` (parse leading numeral into quantity; canonicalize name)
- [x] 4.2 Add a canonical name matching helper and use it in `barterEngine` name lookups
- [x] 4.3 Normalize on both write and read so legacy rows resolve

## 5. Summarization Voice

- [x] 5.1 Rewrite the summarization prompt in `engine/context.js` to require second person
- [x] 5.2 Verify summary output voice in tests

## 6. Verification & Coordination

- [x] 6.1 Run `python3 -m pytest tests/test_mcp_*.py -v` and confirm green
- [x] 6.2 Run the non-integration suite and confirm green
- [~] 6.3 Live playtest: lore triggers sane, trades resolve by canonical name, summary second person (mock-verified: trigger filtering, canonical trade resolution, and summary sanitization all asserted; live-LLM playtest not run — environment is MOCK_LLM=1 only)
- [x] 6.4 Coordinate with `make-undo-and-trades-consistent` (#13/#16) on shared name normalization; with `close-prompt-injection-backdoor` (#15) on trigger filtering as the injection defense
