## ADDED Requirements

### Requirement: Map Panel
The frontend SHALL render the persisted room graph from `GET /api/map` in a map panel with two selectable render modes: a cartographic mode and a node-graph mode. The renderer implementation SHALL require no build step; the choice of a hand-rolled canvas/DOM renderer versus a vendored graph library is an implementation decision and is not constrained by this requirement.

The panel SHALL highlight the current room (from `current_room_id`) and SHALL reflect visited state from `last_visit_turn` / `visit_count`. In cartographic mode, walk edges SHALL be drawn as paths, portal and time edges as visually distinct arrows, and inferred edges dashed; disconnected regions (from `computeRegions`) SHALL cluster separately. In node-graph mode, nodes and edges SHALL be labelled with direction, kind, and inferred status.

The panel SHALL refresh from `GET /api/map` after each committed turn and SHALL be reachable from the gameplay screen on both desktop and mobile.

#### Scenario: Cartographic render
- **WHEN** the map panel is shown in cartographic mode
- **THEN** rooms cluster by walk-connected region, walk edges render as paths, portal/time edges render as distinct arrows, and inferred edges render dashed

#### Scenario: Node-graph render
- **WHEN** the map panel is shown in node-graph mode
- **THEN** each room is a node and each edge is labelled with its direction, kind, and inferred status, with the current room highlighted

#### Scenario: Mode toggle
- **WHEN** the player toggles the render mode
- **THEN** the panel re-renders in the other mode without losing the map data

#### Scenario: Current-room highlight and visited state
- **WHEN** the map is rendered
- **THEN** the current room is highlighted and previously visited rooms are visually distinguished

#### Scenario: Empty map
- **WHEN** the graph has no rooms yet
- **THEN** the panel renders an empty state rather than an error

#### Scenario: Refresh after a turn
- **WHEN** a turn commits and the location changes
- **THEN** the map panel reflects the new room and any newly recorded edges

#### Scenario: Mobile access
- **WHEN** the gameplay screen is viewed on a mobile viewport
- **THEN** the map panel is reachable from the mobile tab bar
