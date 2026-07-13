## ADDED Requirements

### Requirement: On-Demand Memory Sync
The game engine SHALL support on-demand force-flushing of buffered turns to extract events and inventory changes immediately whenever the client reads the memory state (such as active inventory, event log, or statistics) or queries the semantic memory search.

#### Scenario: Client requests inventory, memory state, or search
- **WHEN** the client queries the active inventory, events, statistics, or semantic search API endpoints
- **THEN** any pending turns in the memory manager's buffer are immediately force-flushed and extracted to the database, and the updated records/vector embeddings are returned
