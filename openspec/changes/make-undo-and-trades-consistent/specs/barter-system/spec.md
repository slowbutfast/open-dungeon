## MODIFIED Requirements

### Requirement: Universal Barter Trade Execution
The system SHALL validate item ownership deterministically in SQLite before executing item-for-item barter transactions and injecting system event prompt instructions.

The barter execution path SHALL be reachable from narrated gameplay (not only from HTTP endpoints or the MCP `dungeon_execute_trade` tool). When a trade is narrated, the system SHALL route it through `executeBarter` so possession is validated and the atomic swap releases the sold item.

#### Scenario: Valid barter transaction execution
- **WHEN** a player initiates a barter trade and holds the required item in SQLite inventory
- **THEN** an atomic SQLite transaction updates the required item to `'traded'` and inserts the offered item as `'held'`, injecting `[SYSTEM EVENT]` into the prompt context before streaming narration

#### Scenario: Unowned item trade rejection
- **WHEN** a player attempts to trade an item that is missing from SQLite inventory
- **THEN** the system rejects the trade locally with a $0 LLM cost user message

#### Scenario: Multi-match item ambiguity detection
- **WHEN** a player initiates a trade with an ambiguous item name (e.g., "ring") and holds multiple matching items (e.g., "Silver Ring" and "Gold Ring")
- **THEN** the system rejects the trade locally with a disambiguation prompt listing the matching items, without invoking the LLM

#### Scenario: Narrated trade resolves through executeBarter
- **WHEN** a trade is narrated end to end in gameplay
- **THEN** the trade is executed via `executeBarter` (possession validated, atomic swap performed) and the sold item is not retained as held

### Requirement: NPC Quest Goal State Machine
The system SHALL maintain deterministic quest goal states (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `FAILED`) and grant reward items upon objective completion.

The system SHALL create quest goals from narrated gameplay (an NPC stating an objective) so goals are populated during normal play.

#### Scenario: Completing quest goal objective
- **WHEN** a player completes a required goal objective or returns a quest item to an NPC
- **THEN** the quest goal state transitions to `COMPLETED` and the reward item is inserted as `'held'` in SQLite

#### Scenario: Accepting a quest goal
- **WHEN** a player accepts a quest goal that is in `NOT_STARTED` state
- **THEN** the quest goal state transitions to `IN_PROGRESS`

#### Scenario: Failing a quest goal
- **WHEN** a quest goal in `NOT_STARTED` or `IN_PROGRESS` state is marked as failed
- **THEN** the quest goal state transitions to `FAILED` and is excluded from active goals listing

#### Scenario: Quest goal created from narration
- **WHEN** an NPC states a goal during narration (e.g., "find my daughter's locket")
- **THEN** a `quest_goals` row is created in `IN_PROGRESS` for that NPC and objective

## ADDED Requirements

### Requirement: Barter Offer Registration from Narration
The system SHALL create `barter_offers` rows when an NPC offers a trade during narration, so offers are populated during normal play and the `dungeon_inspect_offers` / `dungeon_execute_trade` surface has data to act on.

#### Scenario: Offer registered from a narrated trade offer
- **WHEN** an NPC offers to trade during narration (e.g., "bring me X and I'll give you Y")
- **THEN** a `barter_offers` row is created for that trader/required/offered item and appears in `dungeon_inspect_offers`
