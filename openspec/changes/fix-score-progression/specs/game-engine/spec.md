## MODIFIED Requirements

### Requirement: Generate Response Stream
The game engine SHALL stream narration chunks from the LLM, format input actions, invoke deterministic pre-action inventory and barter validation, parse status lines to update location, score, and moves, and append narration back to history.

The game engine SHALL advance `score` deterministically as the adventure progresses, independent of whether the narrator happens to emit a new Score value on the status line. Score SHALL be computed by an engine-side rule (over extracted milestone events) and committed through the same shared status-line path used for location and moves, so a missed status line cannot silently freeze score.

#### Scenario: Processing player action
- **WHEN** user sends an action of type 'do', 'say', or 'story' with text
- **THEN** the action is formatted and validated against the synchronous inventory and barter engines, a stream of response chunks is retrieved from the LLM provider, status updates are parsed from the last status line anywhere in the response, and final narration is appended to history

#### Scenario: Pre-action barter intent detection
- **WHEN** user sends an action of type 'do' containing barter verbs (`trade`, `barter`, `exchange`)
- **THEN** the engine extracts the item name, validates ownership via SQLite `hasItem()`, and rejects locally with a user message if the item is not held

#### Scenario: Pre-action multi-match ambiguity
- **WHEN** user sends an action with a barter verb and an ambiguous item name matching multiple held items
- **THEN** the engine rejects locally with a disambiguation prompt listing the matching items, without invoking the LLM

#### Scenario: Score advances on a quest milestone
- **WHEN** a playtest session completes a quest objective (e.g., delivering a quest datachip, purging a criminal record)
- **THEN** the engine's score increases deterministically and `dungeon_inspect_state` reflects the new score, independent of the narrator's status-line wording

#### Scenario: Score does not stay frozen across a full arc
- **WHEN** a multi-act adventure runs to completion
- **THEN** `score` reflects accumulated milestones (non-zero), rather than remaining at the initial value for the entire session

### Requirement: Game State Persistence
The game engine SHALL support saving the current state (including location, score, moves, system prompt, lore cards, history, and summary) to a JSON file, and loading a previously saved state using its adventure ID.

Score SHALL be persisted and restored exactly (round-trip), so a scored progression survives save/load.

#### Scenario: Saving active game state
- **WHEN** the engine save function is called
- **THEN** the active engine properties are serialized and written to a JSON file in the designated save directory, including the current `score`

#### Scenario: Loading game state
- **WHEN** the engine load function is called with a valid adventure ID
- **THEN** the state is read from the JSON file and all engine properties are updated to match the saved values, including the saved `score`

#### Scenario: Score round-trips through save/load
- **WHEN** a session with a non-zero score is saved and then loaded
- **THEN** the restored `score` equals the saved value
