# inventory-system Specification

## Purpose
TBD - created by archiving change harden-inventory-sqlite-rag. Update Purpose after archive.
## Requirements
### Requirement: Synchronous SQLite Inventory Storage
The system SHALL provide synchronous CRUD operations on the SQLite `inventory` table, indexing items by `adventure_id`, `status`, and case-insensitive `item_name`.

Items written from the event extractor SHALL have leading quantities parsed out of `item_name` into the `quantity` column, and item names SHALL be canonicalized on write so equivalent names compare equal on read.

#### Scenario: Synchronous inventory item addition
- **WHEN** an item is acquired or inserted into SQLite
- **THEN** it is immediately recorded with `status = 'held'` and indexed for sub-millisecond lookup

#### Scenario: Atomic item status swap on trade
- **WHEN** a player executes a valid trade or barter transaction
- **THEN** the existing required item status is updated to `'traded'` and the new item is inserted as `'held'` within a single atomic SQLite transaction

#### Scenario: Quantity is not double-encoded
- **WHEN** the extractor returns an item whose name contains a leading numeral (e.g., `"2 Coppers"`)
- **THEN** the numeral is parsed into the `quantity` column and the stored `item_name` does not include it as a count

#### Scenario: Equivalent item names resolve to the same row
- **WHEN** narration names an item with a variant of the stored name (case, article, or minor stem difference, e.g., `Rusty Gear` vs `Rusted Gear`)
- **THEN** name-based lookups (e.g., `executeBarter`) resolve to the canonical stored item rather than missing

### Requirement: 3-Tiered Hybrid Item Matching
The system SHALL resolve player item queries through a 3-tiered matching pipeline consisting of Text Normalization (Tier 1), Token Overlap/Levenshtein Distance (Tier 2), and Vectra RAG Vector Cosine Distance (Tier 3).

#### Scenario: Resolving exact or partial item match
- **WHEN** a player specifies an item with variations in articles or capitalization (e.g., "the silver ring")
- **THEN** Tier 1 normalization and Tier 2 token overlap resolve the query to "Silver Ring" in under 1ms

#### Scenario: Resolving complex item synonyms via RAG vector search
- **WHEN** a player specifies a descriptive synonym (e.g., "shiny finger band")
- **THEN** Tier 3 calculates cosine similarity against held item embeddings in Vectra and resolves the query to "Silver Ring"

### Requirement: Pre-Action Deterministic Item Gating
The system SHALL validate that the player holds the required item with `status = 'held'` in SQLite before executing an item trade or use action.

#### Scenario: Rejecting trade when item is not possessed
- **WHEN** a player attempts to trade an item that is missing from inventory or not in `'held'` status
- **THEN** the action is rejected locally with a $0 LLM cost user message

### Requirement: Edge Case Protection and Undo Synchronization
The system SHALL support stackable item quantities, disambiguation prompts for equal-confidence matches, container scoping, post-stream acquisition regex scanning, and undo rollbacks.

#### Scenario: Partial quantity decrement
- **WHEN** a player uses or trades a quantity less than the total stack count
- **THEN** the `quantity` column is decrements while preserving `'held'` status

#### Scenario: Undo inventory rollback
- **WHEN** the engine `undo()` function is invoked
- **THEN** inventory status changes and items acquired on or after the undone turn are reverted in SQLite

