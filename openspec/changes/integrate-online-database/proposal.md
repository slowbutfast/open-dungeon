## Why

To support deployment of Open Dungeon on cloud platforms with ephemeral containers, game state and semantic memory must be persisted in a centralized online database. Additionally, this establishes the data foundation needed to support future multi-user features.

## What Changes

- Introduce a swap-able storage adapter interface to decouple game state from specific storage engines.
- Add support for PostgreSQL (with `pgvector`) as an online database option.
- Retain the current local filesystem and SQLite/Vectra setup as the default adapter for offline play and automated testing.
- Enable dynamic configuration of the storage driver via environment variables (`DATABASE_URL`).

## Capabilities

### New Capabilities
- `online-persistence`: Integrates PostgreSQL and pgvector for online state, structured memory, and semantic embedding storage.

### Modified Capabilities

## Impact

- **Backend (`engine/` & `web/server.js`)**: Decouples `AdventureState` from raw disk `fs` functions, and `MemoryManager` from direct `better-sqlite3` and `vectra` libraries.
- **Dependencies**: Add PostgreSQL client (`pg`) package to dependencies.
- **Testing**: End-to-end and integration tests will run using the local storage adapter to maintain zero-overhead test execution.
