# spatial-pathfinding Specification

## Purpose
TBD - created by archiving change spatial-map-visualization-pathfinding. Update Purpose after archive.

## Requirements

### Requirement: Deterministic Route Planning
The engine SHALL provide deterministic routing between two rooms in the persisted spatial room graph: a breadth-first search over recorded edges that returns the ordered route and never fabricates connectivity. Routing SHALL traverse only edges actually recorded in the store.

`inferred=1` reverse edges SHALL be routable — they are recorded connectivity and the primary mechanism for returning to a previously visited room. Edges whose `direction` is null (directionless one-way walks) SHALL be routable and SHALL surface a fallback direction label. `kind='time'` edges SHALL NOT be routable. `kind='portal'` edges SHALL NOT be traversed in walk-only routing.

Because BFS over unweighted edges is shortest-hop by construction, the returned route SHALL be the shortest recorded route; no separate shortest-path ranking is required. Traversal SHALL be directed: a route from A to B SHALL NOT imply a route from B to A unless a reverse edge is recorded. Adjacency SHALL be deterministically ordered before the search so repeated routing over the same graph yields an identical route.

#### Scenario: Route within a walk-connected region
- **WHEN** the target room is reachable from the origin over recorded walk edges
- **THEN** the engine returns the shortest ordered route as steps naming the from room, direction, and to room, plus the step count

#### Scenario: Directed asymmetry
- **WHEN** the graph records a walk edge from A to B but no reverse edge from B to A
- **THEN** a route from A to B is found, and a route from B to A is not found

#### Scenario: Inferred reverse edges are routable
- **WHEN** the only edge connecting two rooms is an inferred reverse edge
- **THEN** routing traverses it and the returned step is marked inferred

#### Scenario: Directionless edges are routable
- **WHEN** the only recorded edge toward the target has a null direction
- **THEN** routing traverses it and the step surfaces a fallback direction label

#### Scenario: Time edges are not routable
- **WHEN** the only recorded edge toward the target is `kind='time'`
- **THEN** no route is returned

#### Scenario: Cross-region target with no portal
- **WHEN** the target lies in a different walk-connected region and no walk route exists
- **THEN** the result is a not-found route whose reason is `different_region`

#### Scenario: Unreachable target within the same region
- **WHEN** the target lies in the same walk-connected region but no directed route exists
- **THEN** the result is a not-found route whose reason is `no_route`

#### Scenario: Zero-step route
- **WHEN** the origin and target are the same room
- **THEN** the result is a found route with zero steps and a step count of 0

#### Scenario: Unknown room id
- **WHEN** either room id does not exist in the graph
- **THEN** the engine returns no route, and the surface reports the room as not found

#### Scenario: Deterministic ordering
- **WHEN** the same graph and endpoints are routed repeatedly
- **THEN** the returned route is identical each time

### Requirement: Route Result Payload
The route result SHALL have an identical shape at every layer (pure module, engine proxy, MCP tool, and HTTP endpoint).

A found route SHALL carry `found: true`, `from_room_id`, `to_room_id`, `step_count`, and `steps`, where each step carries `from_room_id`, `from_room_name`, `direction`, `to_room_id`, `to_room_name`, `kind`, and `inferred`.

A not-found route SHALL carry `found: false`, `from_room_id`, `to_room_id`, `step_count: 0`, `steps: []`, and a `reason` of `no_route` or `different_region`.

#### Scenario: Found route payload
- **WHEN** a route is found
- **THEN** the payload carries the step list with names, kinds, and inferred flags, plus the step count

#### Scenario: Not-found route payload
- **WHEN** no route is found
- **THEN** the payload carries `found: false`, an empty step list, and a reason distinguishing `no_route` from `different_region`

#### Scenario: Step names resolved at the surface
- **WHEN** the pure module returns ids only
- **THEN** the engine proxy and outer surfaces resolve each step's room names from the room registry

### Requirement: Route API Surface
The engine SHALL expose a thin `getPath(fromRoomId, toRoomId)` proxy over the pure routing module, returning no route for unknown ids. The web server SHALL expose `GET /api/path?to=<roomId>&from=<roomId>`; `from` SHALL default to the current room. The endpoint SHALL respond 404 when a named room does not exist.

#### Scenario: Route from the current room
- **WHEN** `GET /api/path?to=<roomId>` is called without `from`
- **THEN** the route is computed from the current room

#### Scenario: Route between explicit rooms
- **WHEN** `GET /api/path?to=<roomId>&from=<roomId>` is called
- **THEN** the route is computed between the named rooms

#### Scenario: Unknown target room
- **WHEN** `GET /api/path` names a room that does not exist
- **THEN** the endpoint responds 404
