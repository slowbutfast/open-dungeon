# Architecture Deepening Sequence — architecture

## Context

The repo has grown seven architecture-deepening candidates (#26–#32) from a
review of the landed memory/LLM/status work. Each is researched (its folder has a
verified-facts table and a deletion-test signal) but none is planned or triaged.
The live state that motivates the Strong set:

- **#26**: `dungeon_send_action` force-flushes to report a score that
  `web/routes/game.js` `/api/state` reports stale — two transports, divergent
  guarantees for the same value. The flush ritual is caller-owned and drifting.
- **#27**: `rollbackTurn` covers events + inventory only, so the
  `make-undo-and-trades-consistent` contract is incomplete (lore/offers/goals
  survive an undo); two `BarterEngine` instances are constructed per engine.
- **#28**: six `chat.completions.create` sites, and mock dispatch keyed off prompt
  substrings — a prompt edit silently changes test behavior.
- **#32**: producers/consumers outside `llm.js` still emit/strip the two-field
  status line; the contract string is duplicated in six places.

Defer candidates (#29/#30/#31) are dev-facing seams with no live gameplay defect.

## Goals / Non-Goals

**Goals:**
- Triage the seven candidates into a Strong set (scheduled) and a Defer set (not).
- Fix a dependency/scale-driven refactor order: #26 → #32 → #27 → #28.
- Encode the eight guardrails so every promoted candidate lands the same way.
- Stand up the module-level unit seam before the Strong candidates that need it.

**Non-Goals:**
- Not implementing the candidates in this change (each promotes to its own change).
- Not re-litigating the locked undo/status wire contracts (guardrail #2).
- Not adding dependencies, not touching `SAVE_DIR` derivation / the port-conflict
  guard / `conftest.py` (guardrail #6).
- Not changing `AGENTS.md` (would alter global agent behavior).

## Decisions

**D1 — Strong set = #26, #32, #27, #28; Defer set = #29, #30, #31.**
The Strong set is chosen on two tests: (a) a verified live defect or an incomplete
locked contract, and (b) code the wire tests cannot see today. #26 has the live
cross-transport score wound; #27 leaves the undo contract incomplete; #32 finishes
already-landed work cheaply; #28 is the highest-leverage structural play. #29/#30/#31
are mechanical/dev-facing with no correctness hole. *Alternative rejected:* promoting
all seven — the user's direction is to keep only the strongest for now.

**D2 — Order is #26 → #32 → #27 → #28.**
#26 first (smallest, contained, pure correctness, live wound). #32 alongside #26
(cheap mop-up; its `STATUS_FORMAT` constant is a stated prerequisite for #28). #27
next — it completes the undo contract but touches the same files #26 deepened, so
it must land after. #28 last — highest leverage, largest blast radius, changes
prompts and mock dispatch (guardrail #3 hazard), and needs the unit seam in place.
*Alternative rejected:* #28 first (would land the risky play on unstable seams).

**D3 — Unit seam first (guardrail #4).**
A `node:test` harness (no new deps) with a `:memory:`/file-backed store covering
`StructuredStore`, `VectorStore`, `BarterEngine`, `MemoryManager`, and the turn-commit
path stands up before #26/#27/#28. *Alternative rejected:* a new test framework —
adds a dependency and a build step.

**D4 — Locked contracts preserved byte-for-byte (guardrail #2).**
SSE shapes `{type: chunk|done|status|system|error|cost}` (raw `"data: {...}"`
framing is asserted by `test_api_endpoints.py`), MCP tool names + arg schemas, the
status-line format, and the undo/watermark/single-owner-moves semantics are fixed.
*Alternative rejected:* folding a breaking change into a refactor (violates guardrail #5).

**D5 — Defer #29/#30/#31, but note their hooks.**
#30 subsumes the flush-twin collapse and the SSE forwarder dedup — cleanest after
#26. #29's constructor-DI overlaps #27's single-`BarterEngine` wiring. #31 is fully
independent frontend work. They stay available to promote anytime, but nothing
blocks on them.

## Dependency map

```mermaid
flowchart LR
    Seam[Unit seam (guardrail #4, node:test)] --> A26[#26 memory freshness]
    Seam --> A27[#27 schema boundary + rollback]
    Seam --> A28[#28 LLM adapter]
    A26 --> A27["#27 (same files: memoryManager/structuredStore)"]
    A32["#32 status-line residue (STATUS_FORMAT)"] --> A28["#28 (contract-string prerequisite)"]
    A26 --> A30["#30 transport (flush twins) — deferred"]
    A27 --> A29["#29 facade (BarterEngine wiring) — deferred"]
    A29 --> DB["#1 online database (later, outside this program)"]
```

## Risks / Trade-offs

- **[D2 ordering depends on file stability]** → #26 lands before #27 because both
  touch `memoryManager.js`/`structuredStore.js`; landing them in reverse would create
  merge churn. Enforced by the tasks.md order.
- **[#28 is the mock-parity hazard (guardrail #3)]** → Gated on the unit seam and
  on #26/#27 being stable; mock re-keying is re-verified against the mock-mode
  suite, with `test_live_llm.py` as a manual live check.
- **[Deferring #29/#30/#31 hides no correctness debt today]** → If a new defect
  appears in those seams, promote early; the defer is "not scheduled", not "rejected".
- **[A coordination change can drift out of date]** → `tasks.md` is the program
  tracker; the change stays un-archived until the Strong set + unit seam land.

## Migration Plan

1. Land this change (the program definition).
2. Land the unit seam (tasks 1.x) as the first real deliverable.
3. Promote and land #26, then #32, then #27, then #28 — each as its own `tdd-rnd`
   change with its own TDD-first scaffolding, per guardrail #5.
4. Keep #29/#30/#31 as open, unscheduled candidates; promote on demand.
5. Archive this change when the unit seam + Strong set have all landed.

## Open Questions

- **#28 helper vs class**: thin `llmCall(kind, messages, opts)` or a full
  `LLMAdapter` with an intent registry — both defended in its research; decided in
  #28's design phase, after the unit seam exists.
- **Whether #29/#30/#31 will ever be promoted.** Deferred indefinitely; revisit
  when a defect or a new feature touches their seams.
