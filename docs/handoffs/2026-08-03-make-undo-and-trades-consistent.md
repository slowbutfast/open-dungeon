# Handoff — make-undo-and-trades-consistent residual fix (task group 7)

**For the next agent.** This handoff covers the repo state as of 2026-08-03 and
your concrete task: implement the residual undo-after-trade fix (task group 7 of
`openspec/changes/make-undo-and-trades-consistent/`).

## Repo state

- Branch `master`, origin synced. Base commit for your work: `4462eb4`
  (everything through the playtest-findings fold is on the remote).
- Working tree is clean EXCEPT `.opencode/opencode.jsonc` — that is **pre-existing
  uncommitted WIP** (MCP env-block hardening). Do NOT commit it, revert it, or
  reformat it.
- Playtest scaffolding lives in `tests/adventures_pt_shared/` (gitignored via
  `tests/adventures_*/`): `_pt_runner.py` (isolated MCP driver) and
  `scenarios/undo_rollback.jsonl` (your verification scenario). Keep it; extend
  it if useful.

## Recent history (this session, newest first)

| Commit | What |
|---|---|
| `4462eb4` | docs(openspec): fold playtest findings into make-undo-and-trades-consistent |
| `df6ca17` | chore(openspec): archive 4 completed deepening candidates + 3 research-only deferrals |
| `c43e94f` | docs(openspec): archive architecture-deepening-sequence program; promote refactor-program capability |
| `a8994bc` | refactor(engine): single LLM adapter, intent-keyed mock (#28) |
| `39ce17a` | feat(engine): single schema owner, canonical matching, full-surface rollback (#27) |
| `2961a84` | feat(engine): single STATUS_FORMAT for all producers/consumers (#32) |
| `1f1c7bf` | feat(engine): memory read-through freshness (#26) |
| `d53ebe6` | test(engine): node:test unit seam for memory internals |
| `19cbb24` | docs(openspec): architecture deepening sequence program |
| `ef483da` | feat(engine): close prompt-injection backdoor (#15) |

## Active openspec changes (everything else is archived)

- `make-undo-and-trades-consistent` — in-progress, 19/24 tasks; **group 7 is
  your task**.
- `playtest-diagnostics-hygiene` — 0/16, not started (next batch candidate).
- `fix-mobile-view-responsiveness` — 39/40, one manual-device task left.
- `integrate-online-database` — research-only, gated on the deferred #29 facade.

## Your task — task group 7: Inventory Status-Mutation Rollback

### The defect (two undo failures, one root cause)

`rollbackTurn` in `engine/memory/structuredStore.js` deletes inventory rows by
`acquired_turn >= N` only, and never reverts status mutations made on the undone
turn to pre-existing rows. Confirmed by the 2026-08-03 parallel playtest sweep:

1. **#22** — a row re-acquired on the undone turn keeps its ORIGINAL
   `acquired_turn` (`upsertInventoryItem`'s `ON CONFLICT` path never refreshes
   it), so the delete misses it and the item is still `held` after undo.
2. **Trade-undo limbo (new)** — undoing a trade deletes the newly-acquired row
   but leaves the sold item's `status = 'traded'` (a status mutation made on the
   undone turn to a pre-existing row). `dungeon_inspect_inventory` returns `[]`,
   so the player permanently loses the item instead of getting it back.

A fix that only refreshes `acquired_turn` fixes #22 but NOT the limbo. Both need
one mechanism (spec D5).

### The fix (D5, in `openspec/changes/make-undo-and-trades-consistent/architecture.md`)

- Track per-row status changes per turn: add a `status_turn` column to
  `inventory` (guarded `ALTER TABLE` migration for existing DBs, mirroring the
  #27 migration in `structuredStore._initSchema`), written by
  `upsertInventoryItem` whenever it mutates an existing row's status
  (`traded`/`dropped`/`used`/`equipped`/`held`).
- `rollbackTurn` SHALL (i) delete rows whose (re-)acquisition happened on the
  undone turn regardless of the row's original `acquired_turn`, and (ii) restore
  to `held` any pre-existing row whose status was mutated on the undone turn.
- `NULL status_turn` (legacy rows) means "never mutated by a turn" — leave them
  alone.
- Do NOT change watermark/vector/score/offers/goals rollback. The #27
  full-surface rollback is already green — do not regress it.

### Spec (what "done" means)

`openspec/changes/make-undo-and-trades-consistent/specs/game-engine/spec.md`,
"Requirement: Undo Action" — four scenarios, two of which pin the failures:
"Undo of a narrated trade restores the sold item" and "Undo of a re-acquired
item removes it".

### TDD (write failing tests FIRST)

1. Unit seam (`tests/unit/structuredStore.test.mjs` or a new file): (a)
   trade-undo restore — `rollbackTurn` after a trade leaves the sold item
   `held` and removes the acquired row; (b) re-acquire — a row re-acquired on
   the undone turn is removed even though its original `acquired_turn`
   predates it. Confirm they FAIL (`npm run test:unit`) before implementing.
2. Fix the dead test `tests/test_barter_engine.py::test_undo_after_trade_restores_inventory`
   (it does trade + undo with NO assertions) and add MCP-surface equivalents in
   `tests/test_undo_consistency.py`.

### Implement, then verify

All `MOCK_LLM=1`. NEVER run `test_live_llm.py` / `test_openrouter_models.py` /
`npm run test:all` — `.env` contains a real `OPENROUTER_API_KEY`; do not trigger
it.

1. `npm run test:unit` — all green incl. the two new tests.
2. `npm run test:fast`
3. `python3 -m pytest -m integration --ignore=tests/test_live_llm.py --ignore=tests/test_openrouter_models.py --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py -q`
4. `python3 -m pytest tests/ -q --ignore=tests/test_cli_behavior.py --ignore=tests/test_pty_integration.py --ignore=tests/simulate_playtest.py --ignore=tests/test_live_llm.py --ignore=tests/test_openrouter_models.py --deselect=tests/test_mcp_protocol.py::TestMcpProtocolCompliance::test_tool_invoke_with_missing_required_param`
5. Playtest the fix:
   ```
   python3 tests/adventures_pt_shared/_pt_runner.py \
     --save-dir tests/adventures_pt_shared/agent_undo/saves \
     --scenario tests/adventures_pt_shared/scenarios/undo_rollback.jsonl
   ```
   Both `inventory_after_undo_trade` (Leaflet held, Gem gone) and
   `inventory_after_22_undo` (Leaflet NOT held) must flip to PASS.

### Constraints

- Never write to `game/adventures/` or `game/data/`. Do NOT touch
  `tests/conftest.py`, the port-conflict guard, `SAVE_DIR` derivation, or
  `.opencode/opencode.jsonc`. Do NOT touch the deprecated CLI test files.
- Preserve all wire contracts: SSE event shapes, 18 MCP tools, the status line,
  undo/watermark/moves semantics. Do NOT change extractor or scoring behavior.
- One behavior per change — scope is inventory rollback only.
- E2E runs rewrite `tests/e2e/screenshots/*.png` — discard with
  `git checkout -- tests/e2e/screenshots/`; never commit screenshot changes.
- Update `openspec/changes/make-undo-and-trades-consistent/tasks.md` (group 7 →
  `[x]` as you go) and `engine/ARCHITECTURE.md` per AGENTS.md.

### When done (do NOT commit)

Report: files changed, TDD red→green evidence, tier numbers, the playtest
scenario result (limbo + #22 both PASS), confirmation the #27 full-surface
rollback tests still pass, and confirmation no live test ran and no production
data was touched.
