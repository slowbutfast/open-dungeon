## MODIFIED Requirements

### Requirement: Adventure Initialization
The game engine SHALL be able to initialize a new adventure with a title, a default system prompt containing format instructions and matching examples for location, score, and moves, and empty state values.

#### Scenario: Start new adventure
- **WHEN** user chooses to initialize a new adventure with a given title
- **THEN** a unique adventure ID is generated, the game state is initialized with a default system prompt where narrator examples include Location, Score, and Moves count, and the initial state is saved to a file
