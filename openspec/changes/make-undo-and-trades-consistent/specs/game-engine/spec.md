## MODIFIED Requirements

### Requirement: Undo Action
The game engine SHALL allow reverting the state by removing the last player turn and the corresponding Dungeon Master narration response from history, while rolling back SQLite inventory status changes made on or after the undone turn.

Undo SHALL operate as a transaction across history, the structured store (events, inventory, lore), the vector index, and the extraction watermark. On undo, the store rows and vector embeddings for the reverted turn SHALL be removed, `last_extracted_turn_index` SHALL be rewound to match the new history length, and `moves` SHALL be decremented to the pre-undo value.

#### Scenario: Undo last action
- **WHEN** undo is called and there is at least one player turn and DM response in history
- **THEN** the last assistant turn and the last user turn are removed from active history, SQLite inventory changes on that turn are reverted, the event/vector rows for that turn are removed, the extraction watermark is rewound to the new history end, `moves` is decremented, and the state is saved

#### Scenario: Undo does not leave orphaned memory
- **WHEN** undo is called after a turn that produced extractable events or inventory changes
- **THEN** `dungeon_inspect_events` no longer returns events for the reverted turn, `dungeon_inspect_inventory` no longer reflects items acquired on that turn, and `dungeon_inspect_stats.last_extracted_turn_index` does not exceed the history length

### Requirement: Generate Response Stream
The game engine SHALL stream narration chunks from the LLM, format input actions, invoke deterministic pre-action inventory and barter validation, parse status lines to update location, score, and moves, and append narration back to history.

Narrated trades SHALL resolve through the barter engine's `executeBarter` path (validating possession and performing the atomic swap) rather than only the add-only extraction path, so a sold item is no longer retained as held.

#### Scenario: Processing player action
- **WHEN** user sends an action of type 'do', 'say', or 'story' with text
- **THEN** the action is formatted and validated against the synchronous inventory and barter engines, a stream of response chunks is retrieved from the LLM provider, status updates are parsed from the last status line anywhere in the response, and final narration is appended to history

#### Scenario: Pre-action barter intent detection
- **WHEN** user sends an action of type 'do' containing barter verbs (`trade`, `barter`, `exchange`)
- **THEN** the engine extracts the item name, validates ownership via SQLite `hasItem()`, and rejects locally with a user message if the item is not held

#### Scenario: Pre-action multi-match ambiguity
- **WHEN** user sends an action with a barter verb and an ambiguous item name matching multiple held items
- **THEN** the engine rejects locally with a disambiguation prompt listing the matching items, without invoking the LLM

#### Scenario: Narrated trade releases the sold item
- **WHEN** a trade is narrated end to end (player offers item X, receives item Y from an NPC)
- **THEN** the sold item X is no longer held (resolved through `executeBarter`'s atomic swap), item Y is held, and re-trading X fails possession checks rather than duplicating it

## ADDED Requirements

### Requirement: Offer and Goal Creation from Narration
The system SHALL create `barter_offers` and `quest_goals` rows from narrated gameplay so the existing offers/goals tool surface operates during normal play, not only via HTTP endpoints.

#### Scenario: Narrated trade offer is registered
- **WHEN** an NPC offers to trade during narration (e.g., "bring me X and I'll give you Y")
- **THEN** a `barter_offers` row is created for that trader/required/offered item, and `dungeon_inspect_offers` / `dungeon_execute_trade` can act on it

#### Scenario: Narrated quest goal is created
- **WHEN** an NPC states a goal during narration (e.g., "find my daughter's locket")
- **THEN** a `quest_goals` row is created in `IN_PROGRESS`, and `dungeon_inspect_goals` / `dungeon_complete_goal` can act on it

### Requirement: Item Removal Semantics in Extraction
The extraction path SHALL support expressing that an item left inventory (consumed, traded, dropped), so a `trade` event resolves both the acquisition and the removal sides.

#### Scenario: Extraction resolves both sides of a trade
- **WHEN** the extractor classifies a trade where the player gave away item X and received item Y
- **THEN** the resulting inventory state has X removed (not held) and Y held, deterministically (not dependent on the model's incidental wording)
