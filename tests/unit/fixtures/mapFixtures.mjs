// Shared JS fixtures for the gravitational node-map unit seam.
//
// Mirrors the `/api/map` payload shape used by the existing Python E2E fixture
// (tests/e2e/test_map_render.py) and adds a denser hub-and-spoke graph that
// exercises degree-scaling, springs and collision resolution.

// The P6 fixture: 4 rooms in 3 regions with a confirmed walk edge, an inferred
// reverse, a portal and a time edge; the current room is in region 3.
export const P6_FIXTURE = {
    rooms: [
        { id: 'r1', name: 'North Hall', first_turn: 1, last_visit_turn: 5, visit_count: 1 },
        { id: 'r2', name: 'Gallery', first_turn: 2, last_visit_turn: 4, visit_count: 1 },
        { id: 'r3', name: 'Vault of Echoes', first_turn: 3, last_visit_turn: 3, visit_count: 1 },
        { id: 'r4', name: 'Dawn Camp', first_turn: 4, last_visit_turn: 5, visit_count: 1 },
    ],
    edges: [
        { from: 'r1', direction: 'east', to: 'r2', kind: 'walk', inferred: 0 },
        { from: 'r2', direction: 'west', to: 'r1', kind: 'walk', inferred: 1 },
        { from: 'r2', direction: 'archway', to: 'r3', kind: 'portal', inferred: 0 },
        { from: 'r3', direction: null, to: 'r4', kind: 'time', inferred: 0 },
    ],
    regions: [{ room_ids: ['r1', 'r2'] }, { room_ids: ['r3'] }, { room_ids: ['r4'] }],
    current_room_id: 'r4',
};

// A dense hub-and-spoke graph: one hub with six walk spokes, a portal, a time
// edge, one inferred edge (weight 0.5) and a self-loop that must be excluded
// from degree. The hub's weighted degree is 6 + 1 + 1 = 8; leaves are 1 (with
// n1/n2 each gaining 0.5 from the inferred edge).
export const HUB_AND_SPOKE_FIXTURE = {
    rooms: [
        { id: 'hub', name: 'The Grand Central Nexus', first_turn: 1, last_visit_turn: 9, visit_count: 9 },
        { id: 'n1', name: 'North Hall', first_turn: 2, last_visit_turn: 3, visit_count: 1 },
        { id: 'n2', name: 'A Gallery of Falling Light', first_turn: 3, last_visit_turn: 4, visit_count: 1 },
        { id: 'n3', name: 'Eastern Workshop', first_turn: 4, last_visit_turn: 5, visit_count: 1 },
        { id: 'n4', name: 'The Sunken Stair', first_turn: 5, last_visit_turn: 6, visit_count: 1 },
        { id: 'n5', name: 'Western Watch', first_turn: 6, last_visit_turn: 7, visit_count: 1 },
        { id: 'n6', name: 'A Quiet Alcove', first_turn: 7, last_visit_turn: 8, visit_count: 1 },
        { id: 'n7', name: 'The Mirror Vault', first_turn: 8, last_visit_turn: 9, visit_count: 1 },
        { id: 'n8', name: 'The Hourglass Gate', first_turn: 9, last_visit_turn: 9, visit_count: 1 },
    ],
    edges: [
        { from: 'hub', direction: 'north', to: 'n1', kind: 'walk', inferred: 0 },
        { from: 'hub', direction: 'east', to: 'n2', kind: 'walk', inferred: 0 },
        { from: 'hub', direction: 'south', to: 'n3', kind: 'walk', inferred: 0 },
        { from: 'hub', direction: 'west', to: 'n4', kind: 'walk', inferred: 0 },
        { from: 'hub', direction: 'up', to: 'n5', kind: 'walk', inferred: 0 },
        { from: 'hub', direction: 'down', to: 'n6', kind: 'walk', inferred: 0 },
        { from: 'hub', direction: 'archway', to: 'n7', kind: 'portal', inferred: 0 },
        { from: 'hub', direction: null, to: 'n8', kind: 'time', inferred: 0 },
        // Inferred reverse edge between two leaves — half weight each.
        { from: 'n1', direction: 'back', to: 'n2', kind: 'walk', inferred: 1 },
        // Self-loop at the hub — must never contribute to degree.
        { from: 'hub', direction: 'in', to: 'hub', kind: 'walk', inferred: 0 },
    ],
    regions: [{ room_ids: ['hub', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'] }, { room_ids: ['n7'] }, { room_ids: ['n8'] }],
    current_room_id: 'hub',
};

export function fixtureRoomIds(fixture) {
    return fixture.rooms.map(room => room.id);
}
