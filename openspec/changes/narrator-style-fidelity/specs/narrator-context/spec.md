## MODIFIED Requirements

### Requirement: Composed Narrator Context
The engine SHALL build the narrator system message by iterating the registry and emitting each enabled block's header followed by its built body, with blocks separated by blank lines.

The registry SHALL include a `[NARRATOR STYLE]` block that pins the session's adopted narrator style once it is set, so later turns keep the tone consistent. Like every registered block, its header is automatically strip-eligible by the sanitizer.

#### Scenario: Current status block renders byte-identically
- **WHEN** the narrator system message is composed
- **THEN** the `[CURRENT STATUS]` block renders the exact text `[CURRENT STATUS]\n- Location: <location>\n- Score: <score>\n- Moves: <moves>` matching the pre-change output

#### Scenario: All enabled blocks appear in order
- **WHEN** multiple blocks pass their `enabled` predicates
- **THEN** the composed message contains each of their headers and built bodies

#### Scenario: Narrator style block is injected once pinned
- **WHEN** a narrator style has been adopted for the session
- **THEN** the `[NARRATOR STYLE]` block is included in the composed system message, and an echoed copy is stripped by the registry-derived sanitizer
