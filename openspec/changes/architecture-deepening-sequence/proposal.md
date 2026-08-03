# Architecture Deepening Sequence — proposal

## Why

Seven architecture-deepening candidates (#26–#32) were researched and landed as
research-only artifacts (`d27c42f`), but there is no coordinated plan: no agreed
order, no shared guardrails, and no triage on which are worth implementing at
all. Without it, the cheap correctness wins (score/undo freshness) sit behind the
expensive structural play (LLM adapter), and weak refactors (#29/#30/#31) could
get promoted first on availability rather than value. This change wires the
candidates together, triages them, and fixes the order.

## What Changes

This is a **coordination change** — it makes no gameplay or system code changes.
It aggregates the seven deepening candidates into a single refactoring program:

- **Wire and link.** Aggregates #26–#32, each linked to its research folder,
  with the verified facts and deletion-test signals carried over.
- **Triage.** Classifies candidates into a **Strong set** — #26 (memory
  freshness), #32 (status-line residue), #27 (schema boundary + full-surface
  rollback), #28 (LLM adapter) — and a **Defer set** — #29 (facade), #30
  (transport collapse), #31 (frontend state). Only the Strong set is scheduled.
- **Order by scale.** Refactor order is dependency- and risk-driven, not tracker
  order: **#26 → #32 → #27 → #28**. Rationale: smallest, pure-correctness first;
  cheapest mop-up alongside; the undo-completing schema change next (same files
  #26 touched); the highest-leverage, largest-blast-radius LLM adapter last.
- **Encode the guardrails.** The eight refactor guardrails (TDD-first, byte-for-byte
  wire contracts, mock/real parity, unit seam, one behavior per change, env
  isolation, tiered verification, deletion test) become program requirements in
  `specs/refactor-program/spec.md`.
- **Stand up the unit seam first.** The program's first deliverable is the
  `node:test` module-level harness (guardrail #4) that the Strong candidates'
  blind spots (`StructuredStore`, `VectorStore`, `BarterEngine`, `MemoryManager`,
  turn-commit path) need before #26/#27/#28 land.

## Capabilities

### New Capabilities
- `refactor-program`: the meta-capability encoding how refactors must land
  (guardrails) and the Strong-set ordering.

### Modified Capabilities
<!-- None — this change alters no runtime system behavior. -->

## Impact

- **No runtime code, no dependencies, no spec-level behavior changes.**
- `openspec/changes/<candidate>/` research folders become the per-candidate
  sources; this change links them instead of duplicating them.
- **Future batches**: each Strong candidate is promoted to its own `tdd-rnd`
  change (one change + one issue per guardrail #5) with its own TDD-first test
  scaffolding. The unit seam in `tasks.md` section 1 is the shared prerequisite.
- **Tests**: `node:test` unit harness (new) + the existing tiered suite
  (`test:fast` → integration → `test:all` → `test:e2e`), per guardrail #7.
- **Locked contracts are not re-litigated**: SSE shapes, MCP tool names/schemas,
  the status-line format, and the undo/watermark/moves semantics stay byte-for-byte
  (guardrail #2).
