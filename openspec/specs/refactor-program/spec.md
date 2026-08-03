# refactor-program Specification

## Purpose
Defines how architecture-deepening refactors must land in this repo: the eight guardrails (TDD-first delivery, byte-for-byte wire-contract preservation, mock/real parity, unit seam, one behavior per change, environment isolation, tiered verification, deletion test on new abstractions) plus the Strong-set ordering. A coordination/meta capability — it governs how the codebase is refactored, not how the game behaves at runtime. Created by archiving the `architecture-deepening-sequence` change (2026-08-03).
## Requirements
### Requirement: TDD-First Delivery
Every promoted candidate SHALL land its failing tests before any implementation code is modified, and the first task group in the candidate's `tasks.md` SHALL be "Test Scaffolding (TDD)".

#### Scenario: Candidate lands TDD-first
- **WHEN** a candidate is promoted to a `tdd-rnd` change
- **THEN** its failing tests are written and observed to fail before implementation, and pass after it

### Requirement: Wire-Contract Preservation
A refactor SHALL preserve the locked wire contracts byte-for-byte unless the change is explicitly a separate breaking change: SSE event shapes `{type: chunk|done|status|system|error|cost}` with raw `"data: {...}"` framing, MCP tool names and argument schemas, the status-line format, and the `make-undo-and-trades-consistent` / `harden-context-history-integrity` contracts (tool names, watermark semantics, single-owner moves).

#### Scenario: SSE framing survives a refactor
- **WHEN** a refactor touches the narration stream forwarding
- **THEN** the raw `"data: {...}"` framing and event `type` values asserted by `test_api_endpoints.py` are unchanged

#### Scenario: MCP surface survives a refactor
- **WHEN** a refactor touches `mcp/tools/*.js`
- **THEN** tool names, argument schemas, and the tool list (18 tools) are unchanged

#### Scenario: Undo/status contracts are not re-litigated
- **WHEN** a refactor touches undo, the status line, or the moves counter
- **THEN** the locked semantics (watermark rewind, single-owner moves, engine-owned score/location-with-forged-status-guard) are preserved

### Requirement: Mock/Real Parity
When a refactor touches prompts, mock dispatch, or call shapes, mock and real SHALL stay on the same code path, and mock dispatch SHALL be keyed by intent rather than prompt substring.

#### Scenario: Prompt change does not silently change mock behavior
- **WHEN** a refactor changes a prompt or a call shape
- **THEN** the mock responds by the call's intent, mock-mode tests are re-verified, and a live check (`test_live_llm.py`, requires `OPENROUTER_API_KEY`) is run when a key is available

### Requirement: Unit Seam
`StructuredStore`, `VectorStore`, `BarterEngine`, `MemoryManager`, and the turn-commit path SHALL have module-level tests via a `node:test` harness (no new dependencies) with a `:memory:`/file-backed store, stood up before #26/#27/#28 land.

#### Scenario: Blind spot is covered at module level
- **WHEN** a candidate refactors one of the listed modules
- **THEN** its internals are tested directly (not only through the HTTP/MCP wire)

### Requirement: One Behavior Per Change
No refactor-plus-behavior-fix SHALL land in a single commit; each candidate SHALL be one openspec change folder and one issue.

#### Scenario: Refactor stays behavior-neutral
- **WHEN** a refactor and a behavior fix touch the same code
- **THEN** they land as separate commits/changes, so a regression bisects cleanly

### Requirement: Environment Isolation Preserved
Refactors SHALL NOT change `SAVE_DIR` derivation, the port-conflict guard, or `tests/conftest.py`, and SHALL NOT overwrite uncommitted working-tree edits.

#### Scenario: Test sandboxing survives a refactor
- **WHEN** a refactor touches test setup or save paths
- **THEN** `SAVE_DIR` derivation, the port-conflict guard, and `conftest.py` are unchanged and no uncommitted WIP is overwritten

### Requirement: Tiered Verification
Every promoted candidate SHALL be verified in tier order: `npm run test:fast` → integration tier → `npm run test:all` → `npm run test:e2e`; a regression SHALL be fixed at the tier that caught it.

#### Scenario: Tier order is followed
- **WHEN** a candidate's implementation is complete
- **THEN** the tiers run in order and any regression is fixed in the tier that caught it before proceeding

### Requirement: Deletion Test on Own Work
A refactor-introduced module SHALL concentrate complexity; a pure pass-through is not deepening.

#### Scenario: New module earns its existence
- **WHEN** a refactor introduces a module/abstraction
- **THEN** deleting it must leave complexity unlocated (reads/callers break), not merely move it

### Requirement: Strong-Set Ordering
The scheduled candidates SHALL land in the order #26 (memory freshness), #32 (status-line residue), #27 (schema boundary + full-surface rollback), #28 (LLM adapter). #29 (facade), #30 (transport collapse), and #31 (frontend state) SHALL remain deferred, not scheduled.

#### Scenario: Strong candidates land in dependency order
- **WHEN** the program executes
- **THEN** #26 lands before #27 (shared files), #32's `STATUS_FORMAT` constant lands before #28, and #28 lands only after the unit seam exists

#### Scenario: Deferred candidates stay out of the critical path
- **WHEN** no defect or feature touches a deferred candidate's seam
- **THEN** it is not scheduled ahead of the Strong set

