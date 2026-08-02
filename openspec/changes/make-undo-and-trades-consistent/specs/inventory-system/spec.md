## MODIFIED Requirements

### Requirement: Edge Case Protection and Undo Synchronization
The system SHALL support stackable item quantities, disambiguation prompts for equal-confidence matches, container scoping, post-stream acquisition regex scanning, and undo rollbacks.

Undo SHALL roll back inventory changes made on or after the undone turn as part of a transactional undo that also removes the turn's events and vector rows and rewinds the extraction watermark. The extraction path SHALL support expressing item removal (consumed/traded/dropped) so trades resolve both sides.

#### Scenario: Partial quantity decrement
- **WHEN** a player uses or trades a quantity less than the total stack count
- **THEN** the `quantity` column is decrements while preserving `'held'` status

#### Scenario: Undo inventory rollback
- **WHEN** the engine `undo()` function is invoked
- **THEN** inventory status changes and items acquired on or after the undone turn are reverted in SQLite

#### Scenario: Extraction removes traded items
- **WHEN** the extractor classifies a trade where the player gave away an item
- **THEN** the given-away item's inventory status is updated (e.g., `traded`/removed) as part of the extraction, alongside the acquired item
