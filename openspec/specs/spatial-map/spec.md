# Spatial Map

## Purpose
The engine owns a deterministic, persisted room graph per adventure. Every turn the narrator's proposed location is reconciled against it so explored areas stay stable across backtracking, save/load, and undo.

## Requirements
### Requirement: Persistent Room Graph
The engine SHALL maintain a deterministic, persisted room graph per adventure in SQLite: a `rooms` table (opaque id, canonical name, first/last visit turn, visit count), an `exits` table (`from_room`, `direction`, `to_room`, `kind`, `inferred` flag, `discovered_turn`), and a `room_visits` table recording each visit by turn.

#### Scenario: Rooms and edges persist across save/load
- **WHEN** an adventure is saved and reloaded
- **THEN** its rooms, edges, and visits are restored from the store, and `currentRoomId` resolves to the same room

#### Scenario: Rooms are keyed by opaque id
- **WHEN** a room is created
- **THEN** it receives an engine-assigned opaque id distinct from the display name, and the canonical name is stored separately

### Requirement: Turn-Commit Spatial Reconciliation
The engine SHALL reconcile the narrator's proposed status-line location on every completed turn instead of adopting it blindly. Reconciliation SHALL classify the transition, extract a direction from the player action, resolve the proposed name to a room node, grow or retract edges, and commit the canonical location with its room id.

The engine SHALL be authoritative over room identity: when the player re-traverses a confirmed (non-inferred) edge and the narrator proposes a name that contradicts the known target, the engine SHALL commit the known room's canonical name (first visit wins) rather than creating a duplicate.

#### Scenario: New room discovery
- **WHEN** the player takes a movement action with no matching known edge and the proposed location matches no known room
- **THEN** a new room is created, a walk edge is recorded from the previous room, and the canonical location + room id are committed

#### Scenario: Backtracking along a known traversed edge
- **WHEN** the player traverses an edge in the reverse direction of a previously walked edge with a reversible direction
- **THEN** the engine resolves deterministically to the known room without an LLM name proposal being treated as new

#### Scenario: Re-traversal with a drifting name
- **WHEN** the player re-enters a known room via a confirmed edge but the narrator proposes a different name
- **THEN** the engine commits the known room's canonical name and does not create a duplicate node

#### Scenario: Reconciliation never breaks the turn
- **WHEN** a spatial store write fails during reconciliation
- **THEN** the engine keeps the narrator's proposed location, logs the failure, and completes the turn normally

### Requirement: Reverse Inference for Reversible Directions
The engine SHALL add the implied reverse edge, marked `inferred=1`, when a traversed walk edge has a reversible direction (cardinal, up/down, in/out). Verb-phrases without an obvious inverse (slide, fall, teleport, squeeze) SHALL NOT receive a reverse edge.

#### Scenario: Reverse edge inferred on first traversal
- **WHEN** the player walks north from room A to room B
- **THEN** an inferred south edge from B to A is recorded so the first return trip resolves deterministically

#### Scenario: One-way traversal gets no reverse edge
- **WHEN** the player slides down a chute to a room below
- **THEN** no inferred reverse edge is recorded

### Requirement: Self-Healing Edges
The engine SHALL retract and replace edges that are contradicted by later traversal: a contradiction on a non-inferred edge canonicalizes to the known target; a contradiction on an `inferred` edge SHALL retract that inferred edge and grow the new edge and/or room.

#### Scenario: Inferred edge contradiction self-heals
- **WHEN** the player takes a direction whose only edge is inferred and the narrator lands them in a different, unmatched place
- **THEN** the inferred edge is removed and a new edge/room is created from the actual traversal

### Requirement: Portal and Time Edge Kinds
The engine SHALL classify non-walk transitions into `portal` (a labeled mechanism crossing a seam — archway, ship, gate) and `time` (temporal displacement). Neither SHALL receive reverse inference; a pure reposition with no mechanism SHALL record no edge at all. The engine SHALL never fabricate connectivity.

#### Scenario: Portal traversal records a labeled one-way edge
- **WHEN** the player steps through a labeled mechanism (e.g., "the glowing archway") to a new location
- **THEN** a `portal` edge with the mechanism label is recorded and no reverse edge is inferred

#### Scenario: Time jump records a state-mutating edge
- **WHEN** the player advances time (e.g., "a year passes") and the location changes
- **THEN** a `time` edge is recorded with no reverse inference, marking a world-state boundary

#### Scenario: Reposition without a mechanism records no edge
- **WHEN** the player wakes up or otherwise appears somewhere with no mechanism
- **THEN** the room is created/resolved but no edge is recorded from the previous room

### Requirement: Canonical Name Matching
The engine SHALL resolve proposed location names to rooms using exact canonical matching (normalized case/whitespace, stem-aware), reusing the same matching regime as item names. Name-based lookups SHALL resolve equivalent spellings to the same room.

#### Scenario: Equivalent spellings resolve to the same room
- **WHEN** a proposed location matches a known room under canonical matching
- **THEN** it resolves to that room rather than creating a duplicate

### Requirement: Undo-Consistent Spatial Rollback
Undo SHALL restore the player's room identity to the pre-turn room and SHALL remove rooms, edges, and visits discovered on the undone turn. Rollback SHALL follow the existing turn-index full-surface pattern with the `IS NOT NULL` guard for narration-created rows.

#### Scenario: Undo removes the discovered room
- **WHEN** the undone turn discovered a new room and/or edge
- **THEN** those rows are removed from the store and the player's room is restored to the previous room

#### Scenario: Undo of a pure movement restores the prior room
- **WHEN** the undone turn only moved between existing rooms
- **THEN** the visit is removed and `currentRoomId`/`location` revert to the pre-turn room
