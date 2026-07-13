## MODIFIED Requirements

### Requirement: Generate Response Stream
The game engine SHALL stream narration chunks from the LLM, format input actions, parse status lines to update location, score, and moves, and append the narration back to history.

#### Scenario: Processing player action
- **WHEN** user sends an action of type 'do', 'say', or 'story' with text
- **THEN** the action is formatted and appended to history, a stream of response chunks is retrieved from the LLM provider, status updates are parsed from the trailing status line containing Location, Score, and Moves, and the final narration is appended to history
