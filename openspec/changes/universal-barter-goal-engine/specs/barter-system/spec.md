## ADDED Requirements

### Requirement: Universal Barter Trade Execution
The system SHALL validate item ownership deterministically in SQLite before executing item-for-item barter transactions and injecting system event prompt instructions.

#### Scenario: Valid barter transaction execution
- **WHEN** a player initiates a barter trade and holds the required item in SQLite inventory
- **THEN** an atomic SQLite transaction updates the required item to `'traded'` and inserts the offered item as `'held'`, injecting `[SYSTEM EVENT]` into the prompt context before streaming narration

#### Scenario: Unowned item trade rejection
- **WHEN** a player attempts to trade an item that is missing from SQLite inventory
- **THEN** the system rejects the trade locally with a $0 LLM cost user message

### Requirement: NPC Quest Goal State Machine
The system SHALL maintain deterministic quest goal states (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `FAILED`) and grant reward items upon objective completion.

#### Scenario: Completing quest goal objective
- **WHEN** a player completes a required goal objective or returns a quest item to an NPC
- **THEN** the quest goal state transitions to `COMPLETED` and the reward item is inserted as `'held'` in SQLite

### Requirement: Interactive Barter UI and Action Chips
The frontend SHALL parse NPC and item entities from DM narration responses to render interactive action chips and a side-by-side Barter UI Modal.

#### Scenario: Rendering barter action chips
- **WHEN** an NPC or trader is detected in the narration output
- **THEN** interactive action chips (`💬 Talk`, `🔄 Barter`) are rendered below the narrative stream

#### Scenario: Opening Barter UI Modal
- **WHEN** a user clicks the `🔄 Barter` action chip
- **THEN** a retro Barter UI Modal opens displaying player inventory side-by-side with trader offers
