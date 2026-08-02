## MODIFIED Requirements

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
