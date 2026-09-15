## ADDED Requirements

### Requirement: Spatial Pathfinding Tools
The MCP server SHALL expose `dungeon_path_to(to, from?)`, which returns the deterministic route from the current room (or an explicit origin) to a target room in the spatial room graph.

#### Scenario: Route to a room
- **WHEN** an AI agent calls `dungeon_path_to` with a target room id
- **THEN** the system returns the ordered route steps, the step count, and the found flag, or a not-found result carrying a reason

#### Scenario: Default origin
- **WHEN** `from` is omitted
- **THEN** the route is computed from the current room

#### Scenario: Unknown room
- **WHEN** the target (or an explicit origin) room id does not exist
- **THEN** the tool returns an error naming the unknown room

#### Scenario: Inspection reflects fresh memory
- **WHEN** the tool is called
- **THEN** it reads through the same read-through freshness path as the other spatial tools, so results reflect committed turns
