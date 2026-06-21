# ai-lore-scanner Specification

## Purpose
Defines the automated lore cards extraction pipeline, querying the LLM to identify novel entities in history log turns and parsing/deduplicating the JSON result.
## Requirements
### Requirement: Automated Lore Extraction
The system SHALL support scanning recent adventure history turns using LLM prompts to automatically identify new characters, items, locations, or lore elements.

#### Scenario: Extracting entities from history
- **WHEN** user initiates a scan command and there is adventure history available
- **THEN** the system compiles recent turns and queries the LLM with a schema constraints prompt to identify candidate lore entities

### Requirement: JSON Response Parsing and Deduplication
The system SHALL parse the LLM's structured JSON output to extract entity properties, generate unique IDs, assign trigger words, filter out cards that match existing card names, and save the new cards.

#### Scenario: Successfully importing scanned cards
- **WHEN** the LLM returns a JSON array of identified entities
- **THEN** the system parses the JSON, matches name properties, rejects duplicates, creates unique IDs and triggers, appends them to the cards list, and saves the game state

