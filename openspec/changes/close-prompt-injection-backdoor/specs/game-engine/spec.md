## MODIFIED Requirements

### Requirement: Generate Response Stream
The game engine SHALL stream narration chunks from the LLM, format input actions, invoke deterministic pre-action inventory and barter validation, parse status lines to update location, score, and moves, and append narration back to history.

Player action text SHALL be wrapped in explicit delimiters when placed in the prompt, with an instruction that the content inside is in-fiction player input and never instructions to the narrator. The status parser SHALL NOT adopt a status line that conflicts with plausible engine state (e.g., a forged `Score: 9999`); on a suspect status line the engine SHALL fall back to its own committed state.

#### Scenario: Processing player action
- **WHEN** user sends an action of type 'do', 'say', or 'story' with text
- **THEN** the action is formatted and validated against the synchronous inventory and barter engines, a stream of response chunks is retrieved from the LLM provider, status updates are parsed from the last status line anywhere in the response, and final narration is appended to history

#### Scenario: Pre-action barter intent detection
- **WHEN** user sends an action of type 'do' containing barter verbs (`trade`, `barter`, `exchange`)
- **THEN** the engine extracts the item name, validates ownership via SQLite `hasItem()`, and rejects locally with a user message if the item is not held

#### Scenario: Pre-action multi-match ambiguity
- **WHEN** user sends an action with a barter verb and an ambiguous item name matching multiple held items
- **THEN** the engine rejects locally with a disambiguation prompt listing the matching items, without invoking the LLM

#### Scenario: Player input is delimited as in-fiction
- **WHEN** the player's action text is inserted into the prompt
- **THEN** it is wrapped in explicit delimiters with an instruction that the content is in-fiction input and never instructions, so instruction-style text is framed as player dialogue/action

#### Scenario: Forged status line is not adopted
- **WHEN** the narrator response contains a status line that contradicts engine state (e.g., `Score: 9999` with no plausible cause)
- **THEN** the engine does not commit the forged values, keeping its own committed location/score/moves

### Requirement: Lore Card Management
The system SHALL support adding lore cards manually with a name, type, description, and list of triggers, and deleting existing lore cards by ID.

The system SHALL expose a mid-session, store-backed view of lore cards and the ability to delete a lore card by ID during an active session, as a recovery path for poisoned or unwanted cards.

#### Scenario: Add a manual card
- **WHEN** user inputs details to create a lore card
- **THEN** a new card dictionary is appended to the game state cards list with a unique ID and enabled status

#### Scenario: Delete a lore card
- **WHEN** user requests deletion of a card by its unique ID
- **THEN** the card is removed from the active cards list and changes are saved

#### Scenario: View lore cards mid-session
- **WHEN** the player (or agent) inspects lore cards during an active session
- **THEN** the current store-backed cards are returned, including those auto-extracted (not just the in-memory list)

#### Scenario: Delete a poisoned lore card mid-session
- **WHEN** the player (or agent) deletes a lore card by ID during an active session
- **THEN** the card is removed from the store and `state.cards`, so its triggers no longer auto-inject on subsequent turns
