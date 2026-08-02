## MODIFIED Requirements

### Requirement: Generate Response Stream
The game engine SHALL stream narration chunks from the LLM, format input actions, invoke deterministic pre-action inventory and barter validation, parse status lines to update location, score, and moves, and append narration back to history.

The memory-extraction path (invoked after turns) SHALL validate the event extractor's output against a schema before any row is written to the structured store. Malformed events, inventory changes, or lore facts SHALL be rejected or quarantined, not persisted as ground truth.

#### Scenario: Processing player action
- **WHEN** user sends an action of type 'do', 'say', or 'story' with text
- **THEN** the action is formatted and validated against the synchronous inventory and barter engines, a stream of response chunks is retrieved from the LLM provider, status updates are parsed from the last status line anywhere in the response, and final narration is appended to history

#### Scenario: Pre-action barter intent detection
- **WHEN** user sends an action of type 'do' containing barter verbs (`trade`, `barter`, `exchange`)
- **THEN** the engine extracts the item name, validates ownership via SQLite `hasItem()`, and rejects locally with a user message if the item is not held

#### Scenario: Pre-action multi-match ambiguity
- **WHEN** user sends an action with a barter verb and an ambiguous item name matching multiple held items
- **THEN** the engine rejects locally with a disambiguation prompt listing the matching items, without invoking the LLM

#### Scenario: Invalid extractor output is rejected
- **WHEN** the event extractor returns a row that fails schema validation (missing fields, invalid type, invalid trigger words)
- **THEN** the row is not written to SQLite, the vector index, or `state.cards`, and extraction continues with the valid rows
