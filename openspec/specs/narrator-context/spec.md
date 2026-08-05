# Narrator Context

## Purpose
The narrator's system message is composed from named context blocks, and this capability makes composition and sanitization derive from a single registry so every injected block is strip-eligible.

## Requirements
### Requirement: Declarative Context Block Registration
The engine SHALL define narrator context blocks in a single registry module where each block declares a header, an `enabled(state, turnContext)` predicate, and a `build(state, turnContext)` body builder.

#### Scenario: Every injected block is registered
- **WHEN** the narrator system message contains a block
- **THEN** that block's header and builder exist in the registry module

#### Scenario: A block declares its own gating
- **WHEN** a block's `enabled` predicate returns false for a turn
- **THEN** the block is excluded from the composed message for that turn

### Requirement: Composed Narrator Context
The engine SHALL build the narrator system message by iterating the registry and emitting each enabled block's header followed by its built body, with blocks separated by blank lines.

#### Scenario: Current status block renders byte-identically
- **WHEN** the narrator system message is composed
- **THEN** the `[CURRENT STATUS]` block renders the exact text `[CURRENT STATUS]\n- Location: <location>\n- Score: <score>\n- Moves: <moves>` matching the pre-change output

#### Scenario: All enabled blocks appear in order
- **WHEN** multiple blocks pass their `enabled` predicates
- **THEN** the composed message contains each of their headers and built bodies

### Requirement: Sanitization Derives from the Registry
The engine SHALL derive the block strip-set used by `sanitizeForHistory` from the registry headers, so any registered block is strip-eligible when echoed back by the narrator.

#### Scenario: Echoed block is stripped from history
- **WHEN** assistant text echoes the header and body of any registered block
- **THEN** the header line and its following bullet lines are removed before the text is committed to history, the save file, or the extraction queue

#### Scenario: Adding a block cannot create a stripping gap
- **WHEN** a new block is added to the registry
- **THEN** no separate sanitizer edit is required for its echoes to be stripped

### Requirement: Sanitization Scope Covers All Injected Blocks
The engine SHALL treat every injected context block as a potential echo and strip it, not only the `[CURRENT STATUS]` / `[CURRENT INVENTORY]` pair.

#### Scenario: Summary, lore, and memory block echoes are stripped
- **WHEN** assistant text echoes `[ADVENTURE SUMMARY]`, `[WORLD INFO & LORE]`, or `[RECALLED MEMORIES]` blocks
- **THEN** those echoes are removed from the committed narration

### Requirement: Unchanged Status-Line Contract
The registry and sanitizer SHALL NOT alter the status-line handling: the status-line shape regex, `STATUS_FORMAT`, the mock two-field line, and the frontend status literal stay byte-identical.

#### Scenario: Status line handling is unaffected
- **WHEN** assistant text contains a `[Status: ... | Score: ...]` line
- **THEN** it is stripped by the existing status-line shape regex, independent of the block registry
