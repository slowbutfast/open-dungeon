## MODIFIED Requirements

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

### Requirement: Keyword Trigger Scan
The system SHALL scan the player's recent action text against all loaded lore card trigger words to identify matching cards.

Trigger words SHALL be validated before a lore card is accepted, rejecting single common words and game-mechanical vocabulary (this layer is delivered by the `validate-memory-extraction` dependency; this change's escape hatch provides manual removal when something still gets through).

#### Scenario: Match keyword trigger
- **WHEN** recent action text context contains trigger words of a lore card (case-insensitive, whole-word matching)
- **THEN** the matching card is added to the active cards list for the current turn
