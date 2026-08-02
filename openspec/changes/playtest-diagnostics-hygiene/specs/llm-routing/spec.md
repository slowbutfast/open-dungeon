## ADDED Requirements

### Requirement: Per-Session LLM Call Tracking
The system SHALL track LLM calls (narration, extraction, summarization, embedding) in a way that is scoped to the current adventure session, so debug/diagnostics views reflect only the current session rather than accumulating across every adventure a process touches.

#### Scenario: New session resets tracking scope
- **WHEN** a new adventure is initialized or an existing one is loaded
- **THEN** the LLM-call tracker scopes its state to that adventure, and previous adventures' calls do not leak into the current session's debug output

### Requirement: Complete Cost Accounting
The system SHALL record token usage for all LLM call types — not only narration — so the reported session cost reflects actual spend.

#### Scenario: Extraction and summarization usage is recorded
- **WHEN** an extraction, summarization, or embedding call completes
- **THEN** its token usage is captured and included in the session cost (or the report is explicitly labeled to indicate which call types are excluded)
