## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing harness tests for the four-step injection reproduction (persistence, lore-card creation, re-arm) against crafted mock LLM responses
- [x] 1.2 Write failing test: dumped system prompt is not persisted to history (relies on #11 dep)
- [x] 1.3 Write failing test: injected content does not become a lore card (relies on #14 dep)
- [x] 1.4 Write failing test: forged status line (`Score: 9999` / `Admin Room`) is not committed to state or save file
- [x] 1.5 Write failing tests: `dungeon_delete_lore_card` removes card from store + `state.cards`, stops re-injection

## 2. Delimiter Framing (layer 3)

- [x] 2.1 Wrap player action text in explicit in-fiction delimiters in the prompt construction
- [x] 2.2 Add system-instruction that delimited content is in-fiction input, never instructions

## 3. Forged-Status Guard

- [x] 3.1 Add a sanity check on parsed status values against engine state; reject implausible jumps (e.g., Score: 9999), falling back to engine-committed values

## 4. Lore Escape Hatch (layer 4)

- [x] 4.1 Add `dungeon_delete_lore_card` MCP tool (delete by ID from `lore` store + `state.cards`)
- [x] 4.2 Ensure `dungeon_inspect_lore` remains store-backed (already done via #18)
- [x] 4.3 (Optional) Minimal frontend surface for viewing/deleting cards mid-session — the existing `/api/lore` delete path now routes through `engine.deleteCard`, sharing the store-backed recovery path

## 5. Verification & Coordination

- [x] 5.1 Run the injection reproduction harness (`python3 -m pytest tests/test_injection_defense.py -v`) and confirm all four steps are blocked
- [x] 5.2 Run `python3 -m pytest tests/test_mcp_*.py -v` and the non-integration suite; confirm green
- [x] 5.3 Verify dependencies landed: confirm `harden-context-history-integrity` (#11) and `validate-memory-extraction` (#14) are implemented or are in-flight before treating this change as complete
- [ ] 5.4 Live spot-check (optional, cost-aware): re-run the #15 payload on a real model session and confirm no persistence/lore-card/re-arm/score-9999
- [x] 5.5 Re-read #15's dependencies: this change is blocked by #11 and #14; do not implement 5.1's harness assertions as passing until those dependencies land
