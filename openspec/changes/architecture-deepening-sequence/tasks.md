# Architecture Deepening Sequence — tasks

Program tracker for the #26–#32 deepening program. Task group 1 is the shared
first deliverable (the unit seam); groups 3–6 promote the Strong candidates in
dependency order (#26 → #32 → #27 → #28); group 7 holds the deferred set.

## 1. Test Scaffolding (TDD) — unit seam (guardrail #4)

- [x] 1.1 Add a `node:test` harness (no new deps) with a `:memory:`/file-backed
      store; wire an npm script (e.g. `npm run test:unit`) without touching
      `SAVE_DIR` derivation, the port-conflict guard, or `tests/conftest.py`
- [x] 1.2 Write failing tests for `StructuredStore` internals: canonical matching
      (`hasItem`/`executeTrade` via `itemNames`), and the rollback surface —
      `rollbackTurn` must cover lore/offers/goals, not just events/inventory
- [x] 1.3 Write failing tests for `MemoryManager` read-through freshness:
      a read reflects every buffered turn without a caller-owned flush
- [x] 1.4 Write failing tests for the turn-commit path at module level: forged-status
      guard (`isSuspiciousStatus`), sanitize, and single-owner moves
- [x] 1.5 Write failing tests for a single `BarterEngine` instance per engine and
      one matching regime for "do I hold this item?"

## 2. Program Definition (this change)

- [x] 2.1 Aggregate the seven candidates (#26–#32) and link each research folder
- [x] 2.2 Classify candidates: Strong (#26, #32, #27, #28) vs Defer (#29, #30, #31)
- [x] 2.3 Establish the refactor order by scale/risk/dependency (#26 → #32 → #27 → #28)
- [x] 2.4 Encode the eight guardrails as program requirements
      (`specs/refactor-program/spec.md`)

## 3. Promote #26 — memory freshness (first)

- [x] 3.1 Open `memory-freshness-read-through` as its own `tdd-rnd` change
      (research → proposal → specs) referencing this program's guardrails
- [x] 3.2 TDD-first: failing read-through freshness tests (unit seam 1.3 +
      cross-transport score-agreement test)
- [x] 3.3 Implement the read-through flush inside `MemoryManager`'s read path;
      unify the two `forceFlushBeforeRead` twins; decide the in-narration RAG
      recall skip (flush or document the skip explicitly)
- [x] 3.4 Verify tiers + deletion test (guardrails #7/#8)

## 4. Promote #32 — status-line residue (alongside #26)

- [x] 4.1 TDD-first: source-text contract tests asserting every producer
      (mock, fallback opening scene, presets, `DEFAULT_SYSTEM_PROMPT`, frontend
      default) references one shared `STATUS_FORMAT`
- [x] 4.2 Emit/strip the canonical three-field line everywhere
      (`mockOpenAI.js`, `web/routes/game.js` fallback, `renderers.js` strip)
- [x] 4.3 Introduce the shared `STATUS_FORMAT` constant (prerequisite for #28);
      the vestigial MCP re-parse is retained (#26's turn-returns-metrics has not
      landed)
- [x] 4.4 Verify tiers + mock/real parity (guardrails #7/#3)

## 5. Promote #27 — schema boundary + full-surface rollback (next)

- [x] 5.1 TDD-first: failing rollback tests for lore/offers/goals (unit seam 1.2)
      and a single-matching-regime test (`completeGoal` "the Gem" vs held "Gem")
- [x] 5.2 Move `barter_offers`/`quest_goals` schema ownership into `StructuredStore`;
      make `BarterEngine` a thin state machine over it; add `turn_index` to the
      rollback surface
- [x] 5.3 Collapse the double-`BarterEngine` construction (coordinate with #29 later)
- [x] 5.4 Verify tiers + deletion test (guardrails #7/#8)

## 6. Promote #28 — LLM adapter (last of the Strongs)

- [ ] 6.1 TDD-first: failing intent-keyed mock tests + a single
      `llmCall(kind, messages, opts)` helper test (unit seam in place)
- [ ] 6.2 Re-key mock behavior by intent (not prompt substring); re-verify the
      mock-mode suite; run `test_live_llm.py` when a key is available
- [ ] 6.3 Consolidate the six `chat.completions.create` sites (+ embeddings +
      tracker wrap + `formatUserInput` duplication)
- [ ] 6.4 Verify tiers + mock/real parity (guardrails #7/#3)

## 7. Deferred (do not prioritize — not scheduled)

Deferred, not dropped: promote early only if a new defect or feature touches their
seams. See `research.md` for each candidate's verified facts.

- [ ] 7.1 #29 seal the engine facade — mechanical; constructor-DI overlaps #27's
      wiring; unblocks the later online-database work (#1)
- [ ] 7.2 #30 collapse the transport layer — cleanest after #26 (subsumes the
      flush-twin collapse + SSE forwarder dedup + the consume-or-drop SSE decision)
- [ ] 7.3 #31 frontend state unification — independent frontend work; delete the
      zombie store or finish the migration; collapse the dual render path
