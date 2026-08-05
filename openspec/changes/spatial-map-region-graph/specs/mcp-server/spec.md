## ADDED Requirements

### Requirement: Spatial Map Tools
The MCP server SHALL expose tools for inspecting the spatial room graph: `dungeon_inspect_map` and `dungeon_inspect_room`.

#### Scenario: Inspect the map
- **WHEN** an AI agent calls `dungeon_inspect_map`
- **THEN** the system returns the adventure's rooms (id, canonical name, visit counts), edges (from, direction, to, kind, inferred flag), the current room id, and region groupings of walk-connected rooms

#### Scenario: Inspect a room
- **WHEN** an AI agent calls `dungeon_inspect_room` with a room id
- **THEN** the system returns the room's canonical name, description/lore link, outgoing edges with their kinds, incoming edges, and the last visit turn

#### Scenario: Inspection reflects fresh memory
- **WHEN** either map tool is called
- **THEN** it reads through the same read-through freshness path as the other memory tools, so results reflect committed turns
