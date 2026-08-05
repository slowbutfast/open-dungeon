// RoomMap pure-reconciliation unit tests (spatial-map-region-graph, tasks 1.1-1.4).
//
// These pin the contract of `engine/memory/roomMap.js` — the pure module that
// classifies transitions, parses directions, and runs the D3 decision table
// WITHOUT an LLM or a live store. The module does not exist yet (RED on HEAD):
// importing it fails, so every test in this file is failing until group 3 lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyTransition,
    directionFromAction,
    normalizeRoomName,
    roomNamesMatch,
    isReversibleDirection,
    reverseDirection,
    reconcile,
    computeRegions,
} from '../../engine/memory/roomMap.js';

// ─── transition classification (1.1) ───────────────────────────────────────

test('classifyTransition: directional movement verbs are walk', () => {
    for (const action of ['go north', 'walk west', 'head east', 'run south', 'climb up the ladder']) {
        assert.equal(classifyTransition(action), 'walk', `${action} should be walk`);
    }
});

test('classifyTransition: one-way movement verbs are still walk', () => {
    // slide/fall/teleport are movement, just not reversible.
    for (const action of ['slide down the chute', 'fall into the pit', 'teleport to the palace']) {
        assert.equal(classifyTransition(action), 'walk', `${action} should be walk`);
    }
});

test('classifyTransition: labeled mechanisms are portal', () => {
    for (const action of ['step through the glowing archway', 'board the ship', 'pass through the gate', 'step through the portal']) {
        assert.equal(classifyTransition(action), 'portal', `${action} should be portal`);
    }
});

test('classifyTransition: duration/temporal literals are time', () => {
    for (const action of ['a year passes', 'wait', 'sleep until dawn', 'three days pass']) {
        assert.equal(classifyTransition(action), 'time', `${action} should be time`);
    }
});

test('classifyTransition: no movement signal is unknown', () => {
    for (const action of ['look around', 'take the sword', 'examine the room', 'wake up in a cell']) {
        assert.equal(classifyTransition(action), 'unknown', `${action} should be unknown`);
    }
});

// ─── direction parsing (1.1) ───────────────────────────────────────────────

test('directionFromAction: cardinal directions map to a label', () => {
    assert.equal(directionFromAction('go north'), 'north');
    assert.equal(directionFromAction('go n'), 'north');
    assert.equal(directionFromAction('head east'), 'east');
    assert.equal(directionFromAction('walk west'), 'west');
    assert.equal(directionFromAction('run south'), 'south');
});

test('directionFromAction: up/down/in/out and verb-phrases map to a label', () => {
    assert.equal(directionFromAction('climb up the ladder'), 'up');
    assert.equal(directionFromAction('descend the stairs'), 'down');
    assert.equal(directionFromAction('go inside'), 'in');
    assert.equal(directionFromAction('step outside'), 'out');
});

test('directionFromAction: unreversible verbs return no direction for reverse inference', () => {
    assert.equal(directionFromAction('slide down the chute'), null);
    assert.equal(directionFromAction('fall into the pit'), null);
    assert.equal(directionFromAction('teleport to the palace'), null);
});

test('directionFromAction: portal mechanisms return the mechanism label', () => {
    assert.equal(directionFromAction('step through the glowing archway'), 'archway');
    assert.equal(directionFromAction('board the ship'), 'ship');
    assert.equal(directionFromAction('pass through the gate'), 'gate');
});

test('directionFromAction: no signal returns null', () => {
    assert.equal(directionFromAction('look around'), null);
    assert.equal(directionFromAction('take the sword'), null);
});

// ─── reversibility lexicon (3.1) ───────────────────────────────────────────

test('reversibility lexicon: cardinal and up/down/in/out are reversible', () => {
    assert.equal(isReversibleDirection('north'), true);
    assert.equal(reverseDirection('north'), 'south');
    assert.equal(isReversibleDirection('east'), true);
    assert.equal(reverseDirection('east'), 'west');
    assert.equal(isReversibleDirection('up'), true);
    assert.equal(reverseDirection('up'), 'down');
    assert.equal(isReversibleDirection('in'), true);
    assert.equal(reverseDirection('in'), 'out');
});

test('reversibility lexicon: mechanism labels are one-way', () => {
    assert.equal(isReversibleDirection('archway'), false);
    assert.equal(reverseDirection('archway'), null);
    assert.equal(isReversibleDirection('ship'), false);
});

// ─── canonical room name matching (1.3) ────────────────────────────────────

test('roomNamesMatch resolves case/whitespace/article variants to the same room', () => {
    assert.equal(roomNamesMatch('The  Forgotten  Temple', 'forgotten temple'), true);
    assert.equal(roomNamesMatch('Cavern of Echoes', 'the cavern of echoes!'), true);
});

test('roomNamesMatch resolves stem variants to the same room', () => {
    assert.equal(roomNamesMatch('Northern Caves', 'northern cave'), true);
    assert.equal(roomNamesMatch('the deep pits', 'Deep Pit'), true);
});

test('roomNamesMatch: genuine -os plurals collapse onto their singular (8.3)', () => {
    assert.equal(roomNamesMatch('Whispering Grotto', 'Whispering Grottos'), true);
    assert.equal(roomNamesMatch('Sunken Grotto', 'Sunken Grottos'), true);
    assert.equal(roomNamesMatch('Whispering Grottos', 'Whispering Grotto'), true);
    assert.equal(roomNamesMatch('The Volcano', 'The Volcanos'), true);
});

test('roomNamesMatch: sibilant singulars never get their s stripped (8.3)', () => {
    // glass/campus/status/iris end in ss/us/is — stripping their trailing s
    // would mint bogus roots and could collapse distinct rooms.
    assert.equal(roomNamesMatch('The Glass Spire', 'The Glas Spire'), false);
    assert.equal(roomNamesMatch('Campus Ruins', 'Campu Ruins'), false);
    assert.equal(roomNamesMatch('Moss Cave', 'Mos Cave'), false);
    assert.equal(roomNamesMatch('Status Hall', 'Statu Hall'), false);
    // And two different sibilant singulars stay distinct.
    assert.equal(roomNamesMatch('Glass Spire', 'Moss Cave'), false);
});

test('roomNamesMatch rejects genuinely different names', () => {
    assert.equal(roomNamesMatch('The Deep Pit', 'The Spire'), false);
    assert.equal(roomNamesMatch('', 'Anything'), false);
});

test('normalizeRoomName collapses surface noise', () => {
    assert.equal(normalizeRoomName('  The  Forgotten   Temple! '), 'forgotten temple');
});

// ─── reconciliation decision table (1.2) ───────────────────────────────────

// In-memory fake for the store-lookups ctx that reconcile consumes. Tracks
// rooms and edges; resolve() finds a known room by canonical match or creates
// one (first visit creates), exactly like the real store context.
function makeCtx(overrides = {}) {
    const rooms = new Map();
    const edges = [];
    let nextRoomId = 0;
    let nextEdgeId = 0;

    const ctx = {
        rooms,
        edges,
        visits: [],
        logs: [],
        resolve(name) {
            for (const r of rooms.values()) {
                if (roomNamesMatch(r.name, name)) return r;
            }
            const room = { id: 'room-' + (++nextRoomId), name };
            rooms.set(room.id, room);
            return room;
        },
        getRoom(roomId) {
            return rooms.get(roomId) || null;
        },
        getEdge(fromRoomId, direction) {
            return edges.find(e => e.from_room === fromRoomId && e.direction === direction) || null;
        },
        recordEdge(fromRoomId, direction, toRoomId, kind = 'walk', inferred = 0) {
            const edge = {
                id: `edge-${++nextEdgeId}`,
                from_room: fromRoomId,
                direction,
                to_room: toRoomId,
                kind,
                inferred,
            };
            edges.push(edge);
            return edge;
        },
        retractEdge(fromRoomId, direction) {
            const idx = edges.findIndex(e => e.from_room === fromRoomId && e.direction === direction);
            if (idx !== -1) edges.splice(idx, 1);
        },
        recordVisit(roomId) {
            ctx.visits.push(roomId);
        },
        log(msg) {
            ctx.logs.push(msg);
        },
        ...overrides,
    };
    return ctx;
}

// Seed: A = "Forest Edge", B = "North Clearing", with a CONFIRMED edge A
// north→B (walk, inferred=0) and its inferred reverse B south→A.
function seedConfirmedEdge(ctx) {
    const a = ctx.resolve('Forest Edge');
    const b = ctx.resolve('North Clearing');
    ctx.recordEdge(a.id, 'north', b.id, 'walk', 0);
    ctx.recordEdge(b.id, 'south', a.id, 'walk', 1);
    return { a, b };
}

test('reconcile: new room discovery grows a walk edge and infers the reverse', () => {
    const ctx = makeCtx();
    const a = ctx.resolve('Forest Edge');

    const result = reconcile(a.id, 'go north', 'North Clearing', ctx);

    assert.equal(result.roomId, 'room-2', 'the new room is the resolved target');
    assert.equal(result.location, 'North Clearing');
    const forward = ctx.getEdge(a.id, 'north');
    assert.ok(forward, 'forward walk edge exists');
    assert.equal(forward.to_room, 'room-2');
    assert.equal(forward.kind, 'walk');
    assert.equal(forward.inferred, 0);
    const reverse = ctx.getEdge('room-2', 'south');
    assert.ok(reverse, 'inferred reverse edge exists');
    assert.equal(reverse.to_room, a.id);
    assert.equal(reverse.inferred, 1, 'reverse edge is marked inferred');
    assert.ok(ctx.visits.includes('room-2'), 'a visit is recorded');
});

test('reconcile: re-traversal along a confirmed edge adopts the known room (first visit wins)', () => {
    const ctx = makeCtx();
    const { a, b } = seedConfirmedEdge(ctx);

    const result = reconcile(a.id, 'go north', 'North Clearing', ctx);

    assert.equal(result.roomId, b.id, 'resolves to the known room B');
    assert.equal(ctx.rooms.size, 2, 'no duplicate node created');
});

test('reconcile: re-traversal with a drifting name canonicalizes to the known room', () => {
    const ctx = makeCtx();
    const { a, b } = seedConfirmedEdge(ctx);

    const result = reconcile(a.id, 'go north', 'The Northern Meadows', ctx);

    assert.equal(result.roomId, b.id, 'first visit wins: adopt B even on a drifted name');
    assert.equal(result.location, 'North Clearing', 'the canonical stored name is committed');
    assert.equal(ctx.rooms.size, 2, 'no duplicate node for the paraphrased name');
});

test('reconcile: an inferred-edge contradiction self-heals (retract + grow)', () => {
    const ctx = makeCtx();
    const { a, b } = seedConfirmedEdge(ctx);
    // b.id === 'room-2' (North Clearing). The inferred edge b south→a exists.

    const result = reconcile(b.id, 'go south', 'The Sunken Vault', ctx);

    assert.equal(result.roomId, 'room-3', 'the new place is a fresh node');
    assert.equal(result.location, 'The Sunken Vault');
    const retracted = ctx.getEdge(b.id, 'south');
    assert.ok(retracted, 'a new b south edge exists');
    assert.equal(retracted.to_room, 'room-3', 'the retracted edge now points at the new room');
    assert.equal(retracted.inferred, 0, 'the replacement edge is confirmed');
    assert.equal(ctx.getEdge('room-3', 'north').inferred, 1, 'the new edge infers a reverse');
    assert.equal(ctx.rooms.size, 3, 'the self-heal grew a new room');
});

test('reconcile: a directional proposal resolving to the current room never fabricates a self-loop (8.4)', () => {
    const ctx = makeCtx();
    const { a, b } = seedConfirmedEdge(ctx);
    // Player is at B (North Clearing). The inferred edge B south→A exists,
    // but the narrator proposes B's own name ("go south" landed nowhere new).

    const result = reconcile(b.id, 'go south', 'North Clearing', ctx);

    assert.equal(result.roomId, b.id, 'stays on the current room');
    assert.equal(result.location, 'North Clearing');
    const loop = ctx.edges.find(e => e.from_room === b.id && e.to_room === b.id);
    assert.equal(loop, undefined, 'no room--dir-->room self-loop is recorded');
    assert.equal(ctx.getEdge(b.id, 'south').inferred, 1, 'the contradicted inferred edge is left intact');
    assert.equal(ctx.rooms.size, 2, 'no duplicate node is created');
    assert.ok(ctx.visits.includes(b.id), 'the visit to the current room is recorded');
});

test('reconcile: the general walk-growth branch also skips a self-loop when a proposal resolves to the current room', () => {
    const ctx = makeCtx();
    const a = ctx.resolve('Forest Edge');
    // No edge exists; the directional action proposes the CURRENT room's name.
    const result = reconcile(a.id, 'go north', 'Forest Edge', ctx);

    assert.equal(result.roomId, a.id, 'stays on the current room');
    assert.equal(ctx.edges.length, 0, 'no walk edge (self-loop) is fabricated');
    assert.ok(ctx.visits.includes(a.id), 'a visit is still recorded');
});

test('reconcile: portal traversal records a labeled one-way edge with no reverse', () => {
    const ctx = makeCtx();
    const a = ctx.resolve('Forest Edge');

    const result = reconcile(a.id, 'step through the glowing archway', 'Temple of Dawn', ctx);

    assert.equal(result.roomId, 'room-2');
    const edge = ctx.getEdge(a.id, 'archway');
    assert.ok(edge, 'portal edge recorded with the mechanism label as direction');
    assert.equal(edge.kind, 'portal');
    assert.equal(edge.inferred, 0);
    const outgoingFromTarget = ctx.edges.filter(e => e.from_room === 'room-2');
    assert.equal(outgoingFromTarget.length, 0, 'no reverse edge is inferred for a portal');
});

test('reconcile: time jump records a state-mutating edge with no reverse', () => {
    const ctx = makeCtx();
    const a = ctx.resolve('Forest Edge');

    const result = reconcile(a.id, 'a year passes', 'Ruin of the Old Capital', ctx);

    assert.equal(result.roomId, 'room-2');
    const edge = ctx.getEdge(a.id, 'time');
    assert.ok(edge, 'time edge recorded');
    assert.equal(edge.kind, 'time');
    assert.equal(edge.inferred, 0);
    assert.equal(ctx.edges.filter(e => e.from_room === 'room-2').length, 0, 'no reverse for a time edge');
});

test('reconcile: unknown reposition resolves the room with no edge at all', () => {
    const ctx = makeCtx();
    const a = ctx.resolve('Forest Edge');

    const result = reconcile(a.id, 'wake up', 'Damp Cell', ctx);

    assert.equal(result.roomId, 'room-2');
    assert.equal(result.location, 'Damp Cell');
    assert.equal(ctx.edges.length, 0, 'no edge is ever fabricated');
    assert.ok(ctx.visits.includes('room-2'));
});

test('reconcile: one-way verb (slide) records the forward edge but no reverse', () => {
    const ctx = makeCtx();
    const a = ctx.resolve('Forest Edge');

    const result = reconcile(a.id, 'slide down the chute', 'Lower Depths', ctx);

    assert.equal(result.roomId, 'room-2');
    const forward = ctx.edges.find(e => e.from_room === a.id);
    assert.ok(forward, 'forward one-way edge recorded');
    assert.equal(forward.inferred, 0);
    assert.equal(ctx.edges.filter(e => e.from_room === 'room-2').length, 0, 'no inferred reverse edge for a one-way traversal');
});

test('reconcile: no edge but a name matching a known room adds a walk edge to it', () => {
    const ctx = makeCtx();
    const a = ctx.resolve('Forest Edge');
    const known = ctx.resolve('North Clearing'); // exists, but no edge yet

    const result = reconcile(a.id, 'go north', 'North Clearing', ctx);

    assert.equal(result.roomId, known.id, 'resolves to the known room, no duplicate');
    assert.equal(ctx.rooms.size, 2);
    const edge = ctx.getEdge(a.id, 'north');
    assert.equal(edge.to_room, known.id, 'walk edge added to the known room');
    assert.equal(ctx.getEdge(known.id, 'south').inferred, 1, 'reverse inferred on the new edge');
});

test('reconcile: first turn with no previous room establishes the node with no edge', () => {
    const ctx = makeCtx();

    const result = reconcile(null, 'look around', 'Cantina', ctx);

    assert.equal(result.roomId, 'room-1');
    assert.equal(result.location, 'Cantina');
    assert.equal(ctx.edges.length, 0, 'no edge from nothing');
    assert.deepEqual(ctx.visits, ['room-1']);
});

test('reconcile: staying in the same place records a visit but no edge', () => {
    const ctx = makeCtx();
    const a = ctx.resolve('Forest Edge');

    const result = reconcile(a.id, 'look around', 'Forest Edge', ctx);

    assert.equal(result.roomId, a.id);
    assert.equal(ctx.edges.length, 0, 'no edge when the location did not change');
    assert.ok(ctx.visits.includes(a.id));
});

// ─── graceful degradation (1.4) ────────────────────────────────────────────

test('reconcile: never throws when the store write fails — degrades to the proposed location', () => {
    const ctx = makeCtx({
        resolve() {
            throw new Error('disk full');
        },
        recordEdge() {
            throw new Error('disk full');
        },
    });

    // Must NOT throw (the turn must complete).
    const result = reconcile('room-1', 'go north', 'North Clearing', ctx);

    assert.equal(result.location, 'North Clearing', 'keeps the narrator proposed location');
    assert.equal(result.roomId, 'room-1', 'keeps the previous room id on failure');
    assert.ok(ctx.logs.length > 0, 'the failure is logged');
});

test('reconcile: a mid-write failure on the edge growth degrades without throwing but still advances the room (8.1)', () => {
    const ctx = makeCtx();
    const a = ctx.resolve('Forest Edge');
    // resolve works, but the edge write fails (the store died mid-turn).
    ctx.recordEdge = () => { throw new Error('database closed'); };

    const result = reconcile(a.id, 'go north', 'North Clearing', ctx);

    assert.equal(result.location, 'North Clearing');
    // 8.1: the degrade path must not desync location/currentRoomId — even
    // though the edge write failed, the destination node still resolves and
    // the visit records, so the room identity advances to the committed
    // location instead of dangling on the previous room.
    assert.notEqual(result.roomId, a.id, 'the room id advances to the destination');
    assert.ok(ctx.rooms.has(result.roomId), 'the destination node was resolved');
    assert.ok(ctx.visits.includes(result.roomId), 'the destination visit is recorded');
    assert.ok(ctx.logs.length > 0, 'the failure is logged');
});

// ─── region grouping (walk-connected components) ───────────────────────────

test('computeRegions groups walk-connected rooms and splits portal/time crossings', () => {
    const rooms = [
        { id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }, { id: 'r5' },
    ];
    const edges = [
        // r1 - r2 - r3 walk-connected (one region)
        { from_room: 'r1', to_room: 'r2', kind: 'walk' },
        { from_room: 'r2', to_room: 'r3', kind: 'walk' },
        { from_room: 'r3', to_room: 'r2', kind: 'walk', inferred: 1 },
        // r4 is reached only through a portal — separate region
        { from_room: 'r3', to_room: 'r4', kind: 'portal' },
        // r5 is isolated
    ];

    const regions = computeRegions(rooms, edges);

    const regionSets = regions.map(r => r.room_ids.sort().join(',')).sort();
    assert.deepEqual(regionSets, ['r1,r2,r3', 'r4', 'r5']);
});
