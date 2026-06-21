## MODIFIED Requirements

### Requirement: Lore Card Management
The system SHALL support adding lore cards manually with a name, type, description, and list of triggers, and deleting existing lore cards by ID.

#### Scenario: Add a manual card
- **WHEN** user inputs details to create a lore card
- **THEN** a new card dictionary is appended to the game state cards list with a unique ID and enabled status

#### Scenario: Delete a lore card
- **WHEN** user requests deletion of a card by its unique ID
- **THEN** the card is removed from the active cards list and changes are saved

### Requirement: Keyword Trigger Scan
The system SHALL scan the player's recent action text against all loaded lore card trigger words to identify matching cards.

#### Scenario: Match keyword trigger
- **WHEN** recent action text context contains trigger words of a lore card (case-insensitive, whole-word matching)
- **THEN** the matching card is added to the active cards list for the current turn

### Requirement: Prompt Context Injection
The system SHALL compile the system prompt by dynamically appending the active status, active inventory, summary, and matched lore cards into the LLM system message.

#### Scenario: Build system message with lore
- **WHEN** system message is constructed for a turn and active cards are matched
- **THEN** the details (name, type, description) of the matching cards are appended to a World Info & Lore section of the system prompt
