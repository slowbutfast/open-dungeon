// Pathfinding unit tests (spatial-map-visualization-pathfinding, tasks 1.1-1.3).
//
// Pins the contract of the pure routing module `engine/memory/pathfinding.js`
// (`findRoute(rooms, edges, fromId, toId)`) WITHOUT an LLM or a live store, and
// the thin `AdventureEngine.getPath(from, to)` proxy over it.
//
// The module does not exist yet (RED on HEAD): importing it fails, so every
// test in this file is failing until the Slice A implementation lands — the
// same TDD scaffold pattern as tests/unit/roomMap.test.mjs.
//
// Route payload contract (architecture D4):
//   found:      { found: true, from_room_id, to_room_id, step_count,
//                 steps: [{ from_room_id, direction, to_room_id, kind, inferred }] }
//   not found:  { found: false, from_room_id, to_room_id, step_count: 0,
//                 steps: [], reason: 'no_route' | 'different_region' }
//   unknown id: null (the surface reports the room as not found)
// The pure module returns ids only; the engine proxy resolves room names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createTempDir, cleanupDir } from './helpers.test-utils.mjs';
import { findRoute } from '../../engine/memory/pathfinding.js';

process.env.MOCK_LLM = '1';
const { AdventureEngine } = await import('../../engine/index.js');

// ─── fixtures ──────────────────────────────────────────────────────────────

function rooms(...ids) {
    return ids.map(id => ({ id, name: id.toUpperCase() }));
}

function edge(from, direction, to, kind = 'walk', inferred = 0) {
    return { from_room: from, direction, to_room: to, kind, inferred };
}

function directions(route) {
    return route.steps.map(s => s.direction);
}

// ─── Deterministic Route Planning (1.1) ────────────────────────────────────

test('findRoute: returns the shortest ordered route within a walk-connected region', () => {
    // a→b→c (2 hops) is shorter than a→d→e→c (3 hops).
    const rs = rooms('a', 'b', 'c', 'd', 'e');
    const es = [
        edge('a', 'north', 'b'),
        edge('b', 'east', 'c'),
        edge('a', 'west', 'd'),
        edge('d', 'north', 'e'),
        edge('e', 'east', 'c'),
    ];

    const route = findRoute(rs, es, 'a', 'c');

    assert.equal(route.found, true);
    assert.equal(route.from_room_id, 'a');
    assert.equal(route.to_room_id, 'c');
    assert.equal(route.step_count, 2);
    assert.deepEqual(directions(route), ['north', 'east']);
    assert.equal(route.steps[0].from_room_id, 'a');
    assert.equal(route.steps[0].to_room_id, 'b');
    assert.equal(route.steps[1].from_room_id, 'b');
    assert.equal(route.steps[1].to_room_id, 'c');
});

test('findRoute: traversal is directed — A→B does not imply B→A', () => {
    const rs = rooms('a', 'b');
    const es = [edge('a', 'north', 'b')];

    const forward = findRoute(rs, es, 'a', 'b');
    assert.equal(forward.found, true);
    assert.equal(forward.step_count, 1);

    const back = findRoute(rs, es, 'b', 'a');
    assert.equal(back.found, false);
    assert.equal(back.step_count, 0);
    assert.deepEqual(back.steps, []);
    assert.equal(back.reason, 'no_route');
});

test('findRoute: inferred reverse edges are routable and stamped inferred', () => {
    const rs = rooms('a', 'b');
    const es = [
        edge('a', 'north', 'b', 'walk', 0),
        edge('b', 'south', 'a', 'walk', 1),
    ];

    const route = findRoute(rs, es, 'b', 'a');

    assert.equal(route.found, true);
    assert.equal(route.step_count, 1);
    assert.equal(route.steps[0].direction, 'south');
    assert.equal(route.steps[0].inferred, 1);
});

test('findRoute: null-direction edges are routable with a fallback direction label', () => {
    const rs = rooms('a', 'b');
    const es = [edge('a', null, 'b')];

    const route = findRoute(rs, es, 'a', 'b');

    assert.equal(route.found, true);
    assert.equal(route.step_count, 1);
    assert.equal(route.steps[0].from_room_id, 'a');
    assert.equal(route.steps[0].to_room_id, 'b');
    // The spec requires a fallback label to surface; the exact label is an
    // implementation detail, so pin only that it is a non-empty string.
    const dir = route.steps[0].direction;
    assert.equal(typeof dir, 'string', 'a null-direction step must surface a fallback direction label');
    assert.ok(dir.length > 0, 'the fallback direction label must be non-empty');
});

test('findRoute: time edges are not routable', () => {
    const rs = rooms('a', 'b');
    const es = [edge('a', 'time', 'b', 'time')];

    const route = findRoute(rs, es, 'a', 'b');

    assert.equal(route.found, false);
    assert.equal(route.step_count, 0);
    assert.deepEqual(route.steps, []);
    // Time edges do not union regions, so the target is a separate component.
    assert.equal(route.reason, 'different_region');
});

test('findRoute: portal edges are not traversed in walk-only routing', () => {
    const rs = rooms('a', 'b');
    const es = [edge('a', 'archway', 'b', 'portal')];

    const route = findRoute(rs, es, 'a', 'b');

    assert.equal(route.found, false);
    assert.equal(route.reason, 'different_region');
});

test('findRoute: a cross-region target with no walk route reports different_region', () => {
    const rs = rooms('a', 'b', 'c');
    const es = [edge('a', 'north', 'b')]; // c is an isolated region

    const route = findRoute(rs, es, 'a', 'c');

    assert.equal(route.found, false);
    assert.equal(route.step_count, 0);
    assert.equal(route.reason, 'different_region');
});

test('findRoute: an unreachable target within the same region reports no_route', () => {
    const rs = rooms('a', 'b', 'c');
    // One walk-connected region a-b-c, but no recorded reverse edges.
    const es = [edge('a', 'north', 'b'), edge('b', 'east', 'c')];

    const route = findRoute(rs, es, 'c', 'a');

    assert.equal(route.found, false);
    assert.equal(route.reason, 'no_route');
});

test('findRoute: origin === target is a found zero-step route', () => {
    const rs = rooms('a', 'b');
    const es = [edge('a', 'north', 'b')];

    const route = findRoute(rs, es, 'a', 'a');

    assert.equal(route.found, true);
    assert.equal(route.from_room_id, 'a');
    assert.equal(route.to_room_id, 'a');
    assert.equal(route.step_count, 0);
    assert.deepEqual(route.steps, []);
});

test('findRoute: an unknown room id returns null', () => {
    const rs = rooms('a', 'b');
    const es = [edge('a', 'north', 'b')];

    assert.equal(findRoute(rs, es, 'a', 'no-such-room'), null);
    assert.equal(findRoute(rs, es, 'no-such-room', 'b'), null);
    assert.equal(findRoute(rs, es, 'no-such-room', 'no-such-room'), null);
});

test('findRoute: adjacency is deterministically ordered, so repeated routes are identical', () => {
    const rs = rooms('a', 'b', 'c', 'd');
    // Two equal-length a→c routes: via 'east' (b) and via 'south' (d).
    // Sorted by (direction ?? '', to_room), 'east' precedes 'south'.
    const es = [
        edge('a', 'south', 'd'),
        edge('d', 'north', 'c'),
        edge('a', 'east', 'b'),
        edge('b', 'east', 'c'),
    ];

    const first = findRoute(rs, es, 'a', 'c');
    assert.deepEqual(directions(first), ['east', 'east'], 'the lexicographically first direction wins the tie');

    for (let i = 0; i < 5; i += 1) {
        assert.deepEqual(findRoute(rs, es, 'a', 'c'), first, 'repeated routing is identical');
    }

    // Input row order must not affect the result: getEdges is an unsorted SELECT *.
    const reversed = findRoute(rs, [...es].reverse(), 'a', 'c');
    assert.deepEqual(reversed, first, 'input edge order must not change the route');
});

// ─── Route Result Payload (1.2) ────────────────────────────────────────────

test('payload: a found route carries the ordered step list and step count', () => {
    const rs = rooms('a', 'b');
    const es = [edge('a', 'north', 'b', 'walk', 0)];

    const route = findRoute(rs, es, 'a', 'b');

    assert.deepEqual(
        Object.keys(route).sort(),
        ['found', 'from_room_id', 'step_count', 'steps', 'to_room_id']
    );
    assert.equal(route.found, true);
    assert.equal(route.from_room_id, 'a');
    assert.equal(route.to_room_id, 'b');
    assert.equal(route.step_count, 1);
    assert.equal(route.steps.length, 1);
    assert.deepEqual(
        Object.keys(route.steps[0]).sort(),
        ['direction', 'from_room_id', 'inferred', 'kind', 'to_room_id']
    );
    assert.equal(route.steps[0].kind, 'walk');
    assert.equal(route.steps[0].inferred, 0);
});

test('payload: a not-found route carries an empty step list and a reason', () => {
    const rs = rooms('a', 'b');
    const es = [];

    const route = findRoute(rs, es, 'a', 'b');

    assert.equal(route.found, false);
    assert.equal(route.from_room_id, 'a');
    assert.equal(route.to_room_id, 'b');
    assert.equal(route.step_count, 0);
    assert.deepEqual(route.steps, []);
    assert.ok(
        ['no_route', 'different_region'].includes(route.reason),
        `reason must distinguish no_route from different_region, got ${route.reason}`
    );
});

// ─── Route API Surface: engine.getPath proxy (1.3) ─────────────────────────

test('engine.getPath: resolves step room names and returns null for unknown ids', async (t) => {
    const tempRoot = createTempDir('od-path-');
    const saveDir = path.join(tempRoot, 'saves');
    t.after(() => cleanupDir(tempRoot));

    const engine = new AdventureEngine(saveDir);
    await engine.newAdventure('Path Unit');
    const store = engine.memory.structuredStore;
    const adv = engine.adventureId;
    store.upsertRoom(adv, 'r-a', 'Forest Edge');
    store.upsertRoom(adv, 'r-b', 'North Clearing');
    store.recordEdge(adv, 'r-a', 'north', 'r-b', 'walk', 0);

    try {
        const route = await engine.getPath('r-a', 'r-b');
        assert.equal(route.found, true);
        assert.equal(route.from_room_id, 'r-a');
        assert.equal(route.to_room_id, 'r-b');
        assert.equal(route.step_count, 1);
        assert.equal(route.steps[0].from_room_name, 'Forest Edge');
        assert.equal(route.steps[0].to_room_name, 'North Clearing');
        assert.equal(route.steps[0].direction, 'north');
        assert.equal(route.steps[0].kind, 'walk');
        assert.equal(route.steps[0].inferred, 0);

        // Unknown ids → no route (the surface reports the room as not found).
        assert.equal(await engine.getPath('r-a', 'no-such-room'), null);
        assert.equal(await engine.getPath('no-such-room', 'r-b'), null);

        // Same room → zero-step found route.
        const self = await engine.getPath('r-a', 'r-a');
        assert.equal(self.found, true);
        assert.equal(self.step_count, 0);
        assert.deepEqual(self.steps, []);
    } finally {
        engine.memory.structuredStore.close();
    }
});
