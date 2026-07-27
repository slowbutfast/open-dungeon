# game-engine Specification

## Purpose
Defines the core game engine logic, including state initialization, save/load persistence, action handling, undo/retry operations, and narration response generation.
## Requirements
### Requirement: Adventure Initialization
The game engine SHALL be able to initialize a new adventure with a title, a default system prompt, and empty state values.

#### Scenario: Start new adventure
- **WHEN** user chooses to initialize a new adventure with a given title
- **THEN** a unique adventure ID is generated, the game state is initialized, and the initial state is saved to a file

### Requirement: Game State Persistence
The game engine SHALL support saving the current state (including location, score, moves, system prompt, lore cards, history, and summary) to a JSON file, and loading a previously saved state using its adventure ID.

#### Scenario: Saving active game state
- **WHEN** the engine save function is called
- **THEN** the active engine properties are serialized and written to a JSON file in the designated save directory

#### Scenario: Loading game state
- **WHEN** the engine load function is called with a valid adventure ID
- **THEN** the state is read from the JSON file and all engine properties are updated to match the saved values

### Requirement: Undo Action
The game engine SHALL allow reverting the state by removing the last player turn and the corresponding Dungeon Master narration response from history, while rolling back SQLite inventory status changes made on or after the undone turn.

#### Scenario: Undo last action
- **WHEN** undo is called and there is at least one player turn and DM response in history
- **THEN** the last assistant turn and the last user turn are removed from active history, SQLite inventory changes on that turn are reverted, and the state is saved

### Requirement: Generate Response Stream
The game engine SHALL stream narration chunks from the LLM, format input actions, invoke deterministic pre-action inventory and barter validation, parse status lines to update location, score, and moves, and append narration back to history.

#### Scenario: Processing player action
- **WHEN** user sends an action of type 'do', 'say', or 'story' with text
- **THEN** the action is formatted and validated against the synchronous inventory and barter engines, a stream of response chunks is retrieved from the LLM provider, status updates are parsed from the trailing status line containing Location, Score, and Moves, and final narration is appended to history

#### Scenario: Pre-action barter intent detection
- **WHEN** user sends an action of type 'do' containing barter verbs (`trade`, `barter`, `exchange`)
- **THEN** the engine extracts the item name, validates ownership via SQLite `hasItem()`, and rejects locally with a user message if the item is not held

#### Scenario: Pre-action multi-match ambiguity
- **WHEN** user sends an action with a barter verb and an ambiguous item name matching multiple held items
- **THEN** the engine rejects locally with a disambiguation prompt listing the matching items, without invoking the LLM

