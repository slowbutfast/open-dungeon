# barter-system Specification

## Purpose
Defines the universal, theme-agnostic barter trade system and NPC quest goal state machine, enabling item-for-item swaps and deterministic quest completion across any game setting without hardcoded currencies.
## Requirements
### Requirement: Universal Barter Trade Execution
The system SHALL validate item ownership deterministically in SQLite before executing item-for-item barter transactions and injecting system event prompt instructions.

#### Scenario: Valid barter transaction execution
- **WHEN** a player initiates a barter trade and holds the required item in SQLite inventory
- **THEN** an atomic SQLite transaction updates the required item to `'traded'` and inserts the offered item as `'held'`, injecting `[SYSTEM EVENT]` into the prompt context before streaming narration

#### Scenario: Unowned item trade rejection
- **WHEN** a player attempts to trade an item that is missing from SQLite inventory
- **THEN** the system rejects the trade locally with a $0 LLM cost user message

#### Scenario: Multi-match item ambiguity detection
- **WHEN** a player initiates a trade with an ambiguous item name (e.g., "ring") and holds multiple matching items (e.g., "Silver Ring" and "Gold Ring")
- **THEN** the system rejects the trade locally with a disambiguation prompt listing the matching items, without invoking the LLM

### Requirement: NPC Quest Goal State Machine
The system SHALL maintain deterministic quest goal states (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `FAILED`) and grant reward items upon objective completion.

#### Scenario: Completing quest goal objective
- **WHEN** a player completes a required goal objective or returns a quest item to an NPC
- **THEN** the quest goal state transitions to `COMPLETED` and the reward item is inserted as `'held'` in SQLite

#### Scenario: Accepting a quest goal
- **WHEN** a player accepts a quest goal that is in `NOT_STARTED` state
- **THEN** the quest goal state transitions to `IN_PROGRESS`

#### Scenario: Failing a quest goal
- **WHEN** a quest goal in `NOT_STARTED` or `IN_PROGRESS` state is marked as failed
- **THEN** the quest goal state transitions to `FAILED` and is excluded from active goals listing

### Requirement: Interactive Barter UI and Action Chips
The frontend SHALL parse NPC and item entities from DM narration responses to render interactive action chips and a side-by-side Barter UI Modal.

#### Scenario: Rendering barter action chips
- **WHEN** an NPC or trader is detected in the narration output
- **THEN** interactive action chips (`💬 Talk`, `🔄 Barter`, `📜 Goals`) are rendered below the narrative stream

#### Scenario: Detecting NPCs from lore cards
- **WHEN** the narration output contains the name of a character or NPC from the active lore cards
- **THEN** action chips are rendered for that named entity in addition to keyword-based detection

#### Scenario: Opening Barter UI Modal
- **WHEN** a user clicks the `🔄 Barter` action chip
- **THEN** a retro Barter UI Modal opens displaying player inventory side-by-side with trader offers

