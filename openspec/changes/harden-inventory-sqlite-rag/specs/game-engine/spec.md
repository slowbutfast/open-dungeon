## MODIFIED Requirements

### Requirement: Generate Response Stream
The game engine SHALL stream narration chunks from the LLM, format input actions, invoke deterministic pre-action inventory validation, parse status lines to update location, score, and moves, and append the narration back to history.

#### Scenario: Processing player action
- **WHEN** user sends an action of type 'do', 'say', or 'story' with text
- **THEN** the action is formatted and validated against the synchronous inventory engine, a stream of response chunks is retrieved from the LLM provider, status updates are parsed from the trailing status line containing Location, Score, and Moves, and the final narration is appended to history

### Requirement: Undo Action
The game engine SHALL allow reverting the state by removing the last player turn and the corresponding Dungeon Master narration response from history, while rolling back SQLite inventory status changes made on or after the undone turn.

#### Scenario: Undo last action
- **WHEN** undo is called and there is at least one player turn and DM response in history
- **THEN** the last assistant turn and the last user turn are removed from active history, SQLite inventory changes on that turn are reverted, and the state is saved
