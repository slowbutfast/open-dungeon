# game-engine Specification Delta

## MODIFIED Requirements

### Requirement: Game State Persistence
The game engine SHALL support saving the current state (including location, score, moves, system prompt, lore cards, history, and summary) to a JSON file, and loading a previously saved state using its adventure ID.

The designated save directory SHALL be scoped to the authenticated user ID (or a default tenant in unauthenticated local mode) to prevent cross-user state collisions in multi-tenant or serverless hosting environments.

Score SHALL be persisted and restored exactly (round-trip), so a scored progression survives save/load.

#### Scenario: Saving active game state
- **WHEN** the engine save function is called
- **THEN** the active engine properties are serialized and written to a JSON file in the designated per-user save directory, including the current `score`

#### Scenario: Loading game state
- **WHEN** the engine load function is called with a valid adventure ID
- **THEN** the state is read from the JSON file in the user's isolated save directory and all engine properties are updated to match the saved values, including the saved `score`

#### Scenario: Score round-trips through save/load
- **WHEN** a session with a non-zero score is saved and then loaded
- **THEN** the restored `score` equals the saved value

## ADDED Requirements

### Requirement: Elimination of Module Import-Time Side Effects
The engine and web routing subsystems SHALL NOT perform synchronous disk writes, directory creations (`mkdirSync`), SQLite database initializations, or engine instantiations at module evaluation/import time. `web/engineInstance.js` SHALL be removed, and engine instances SHALL be instantiated lazily and scoped per request.

#### Scenario: Safe module import in read-only environment
- **WHEN** all application and route modules are imported in a read-only container root (`/var/task`)
- **THEN** no EROFS errors are thrown and no files or directories are created on disk during import

### Requirement: Per-Request KV State and SQLite Synchronization
When executing in the Vercel serverless environment (`process.env.VERCEL === '1'`), the `sessionManager` SHALL synchronize the active user's `AdventureState` and `StructuredStore` SQLite database with Vercel KV across every request:
1. Rehydrating `engine.state` from `user:state:<subId>` and mounting the SQLite database from `user:db:<subId>` into `/tmp/open-dungeon/${subId}/memory.db` at request start.
2. Committing the serialized `engine.state` JSON and `StructuredStore.db.serialize()` buffer back to KV at the conclusion of the turn.

#### Scenario: Seamless cross-container turn execution
- **WHEN** turn $N$ executes on Container A and turn $N+1$ executes on a newly cold-started Container B
- **THEN** Container B rehydrates the exact adventure state, inventory, and room graph from KV, preserving full adventure continuity without state loss

#### Scenario: Single persistence commit per request
- **WHEN** an HTTP request completes and both `finish` and `close` events are emitted by the response
- **THEN** `sessionManager.persist()` is invoked exactly once for that request

#### Scenario: Clean rehydration on warm container with prior WAL
- **WHEN** `sessionManager` rehydrates `memory.db` from `user:db:<subId>` onto a filesystem that still contains residual `memory.db-wal` or `memory.db-shm` companion files
- **THEN** the stale WAL/SHM companions are purged before the engine mounts SQLite, so the mounted snapshot is never overlaid by a prior connection's journal

### Requirement: Idempotent Response Persistence
The serverless session middleware SHALL ensure that a request's final state is committed to KV at most once. Because Node emits both `finish` and `close` for a completed response, the `finish` and `close` listeners SHALL share a single-invocation guard so duplicate KV writes cannot occur.

#### Scenario: Duplicate terminal events do not double-commit
- **WHEN** both the response `finish` and `close` events fire for the same request
- **THEN** the persistence commit executes only on the first event and the second is a no-op
