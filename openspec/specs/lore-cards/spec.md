# lore-cards Specification

## Purpose
Defines the lore cards data structure, triggers scan mechanism, and context injection rules to supplement the LLM's prompt with character, location, or item details dynamically.
## Requirements
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

Trigger words SHALL be validated before a lore card is accepted: single common words (below a length threshold), tokens that are game-mechanical vocabulary (`score`, `inventory`, `status`, `admin`, `system`, `prompt`), and other invalid tokens SHALL be rejected rather than stored. The system SHALL NOT auto-inject a card whose trigger list is empty or invalid.

#### Scenario: Match keyword trigger
- **WHEN** recent action text context contains trigger words of a lore card (case-insensitive, whole-word matching)
- **THEN** the matching card is added to the active cards list for the current turn

#### Scenario: Common-word trigger is rejected at extraction
- **WHEN** the extractor produces a lore card with a single common-word trigger (e.g., `trade`, `score`, `north`, `door`)
- **THEN** the card is rejected or its trigger is quarantined, and it is not stored in a state where it will auto-fire on nearly every turn

#### Scenario: Mechanical-vocabulary trigger is rejected
- **WHEN** the extractor produces a lore card whose trigger matches game-mechanical vocabulary (e.g., `score`, `inventory`, `system prompt`, `admin`)
- **THEN** the card is not stored with those triggers and cannot re-inject on those words

### Requirement: Prompt Context Injection
The system SHALL compile the system prompt by dynamically appending the active status, active inventory, summary, and matched lore cards into the LLM system message.

#### Scenario: Build system message with lore
- **WHEN** system message is constructed for a turn and active cards are matched
- **THEN** the details (name, type, description) of the matching cards are appended to a World Info & Lore section of the system prompt

### Requirement: Lore Card Validation
The system SHALL validate lore cards produced by the event extractor against a schema before persisting them to the `lore` table, rejecting or quarantining malformed rows (missing name, invalid type, empty or invalid trigger words) rather than writing them through as ground truth.

#### Scenario: Malformed lore card is rejected
- **WHEN** the extractor returns a lore fact missing required fields or with invalid trigger words
- **THEN** the row is not written to the `lore` table, and the invalid card is not synced into `state.cards`

