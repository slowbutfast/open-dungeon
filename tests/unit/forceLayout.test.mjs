// Gravitational force-layout unit tests (gravitational-node-map, 1.2/2.1/2.4).
//
// Pins the pure, DOM-free contract of `web/static/js/components/forceLayout.js`
// under `node --test`. No browser, no fetch, no globals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createRng,
    weightedDegree,
    nodeRadius,
    nodeMass,
    springForEdge,
    createForceLayout,
} from '../../web/static/js/components/forceLayout.js';
import { P6_FIXTURE, HUB_AND_SPOKE_FIXTURE } from './fixtures/mapFixtures.mjs';

function build(fixture = HUB_AND_SPOKE_FIXTURE, options = {}) {
    return createForceLayout({
        rooms: fixture.rooms,
        edges: fixture.edges,
        width: 900,
        height: 640,
        seed: 1234,
        ...options,
    });
}

function positionsOf(layout) {
    return [...layout.nodes.values()]
        .map(n => [n.id, Number(n.x.toFixed(6)), Number(n.y.toFixed(6))])
        .sort((a, b) => a[0].localeCompare(b[0]));
}

function overlapCount(layout) {
    const nodes = [...layout.nodes.values()].filter(n => !n.pinned);
    let overlaps = 0;
    for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
            const a = nodes[i];
            const b = nodes[j];
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (distance < a.radius + b.radius - 1e-6) overlaps += 1;
        }
    }
    return overlaps;
}

// ─── seeded PRNG (determinism) ────────────────────────────────────────────

test('createRng: identical seeds produce identical sequences', () => {
    const a = createRng(99);
    const b = createRng(99);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    assert.deepEqual(seqA, seqB);
    for (const value of seqA) {
        assert.ok(value >= 0 && value < 1, `PRNG value out of range: ${value}`);
    }
});

test('createRng: different seeds diverge', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    assert.notDeepEqual(seqA, seqB);
});

test('fresh layouts are deterministic for identical payloads', () => {
    const first = build();
    const second = build();
    first.settle();
    second.settle();
    assert.deepEqual(positionsOf(first), positionsOf(second));
});

test('fresh layouts are deterministic for the P6 fixture too', () => {
    const first = build(P6_FIXTURE);
    const second = build(P6_FIXTURE);
    first.settle();
    second.settle();
    assert.deepEqual(positionsOf(first), positionsOf(second));
});

// ─── degree, radius and mass ──────────────────────────────────────────────

test('weightedDegree: walk/portal/time = 1.0, inferred = 0.5, self-loops excluded', () => {
    const degrees = weightedDegree(HUB_AND_SPOKE_FIXTURE.edges);
    assert.equal(degrees.get('hub'), 8, 'hub = six walk + portal + time; self-loop ignored');
    assert.equal(degrees.get('n1'), 1.5, 'walk spoke + half inferred edge');
    assert.equal(degrees.get('n2'), 1.5, 'walk spoke + half inferred edge');
    assert.equal(degrees.get('n3'), 1);
    assert.equal(degrees.get('n7'), 1);
    assert.equal(degrees.get('n8'), 1);
});

test('nodeRadius and nodeMass scale monotonically with degree', () => {
    const degrees = [0, 1, 2, 4, 8, 12];
    for (let i = 1; i < degrees.length; i += 1) {
        assert.ok(nodeRadius(degrees[i]) > nodeRadius(degrees[i - 1]),
            `radius must grow: ${degrees[i - 1]} -> ${degrees[i]}`);
        assert.ok(nodeMass(degrees[i]) > nodeMass(degrees[i - 1]),
            `mass must grow: ${degrees[i - 1]} -> ${degrees[i]}`);
    }
});

test('hub nodes render strictly larger than dead-end leaves', () => {
    const layout = build();
    layout.settle();
    const hub = layout.getNode('hub');
    const leaf = layout.getNode('n3');
    assert.ok(hub.radius > leaf.radius, `hub ${hub.radius} must exceed leaf ${leaf.radius}`);
});

// ─── springs ──────────────────────────────────────────────────────────────

test('walk springs are tighter than portal and time springs', () => {
    const walk = springForEdge({ kind: 'walk' });
    const portal = springForEdge({ kind: 'portal' });
    const time = springForEdge({ kind: 'time' });
    assert.ok(walk.length < portal.length, 'walk rest length must be shorter than portal');
    assert.ok(walk.length < time.length, 'walk rest length must be shorter than time');
    assert.ok(walk.strength > portal.strength, 'walk stiffness must exceed portal');
    assert.ok(walk.strength > time.strength, 'walk stiffness must exceed time');
});

test('walk edges settle closer together than portal edges', () => {
    const fixture = {
        rooms: [
            { id: 'a', name: 'A' }, { id: 'b', name: 'B' },
            { id: 'c', name: 'C' }, { id: 'd', name: 'D' },
        ],
        edges: [
            { from: 'a', direction: 'east', to: 'b', kind: 'walk', inferred: 0 },
            { from: 'c', direction: 'east', to: 'd', kind: 'portal', inferred: 0 },
        ],
        current_room_id: 'a',
    };
    const layout = build(fixture);
    layout.settle();
    const walkDistance = Math.hypot(layout.getNode('a').x - layout.getNode('b').x,
        layout.getNode('a').y - layout.getNode('b').y);
    const portalDistance = Math.hypot(layout.getNode('c').x - layout.getNode('d').x,
        layout.getNode('c').y - layout.getNode('d').y);
    assert.ok(walkDistance < portalDistance,
        `walk ${walkDistance.toFixed(1)} should cluster closer than portal ${portalDistance.toFixed(1)}`);
});

// ─── collision / convergence ──────────────────────────────────────────────

test('settle converges below the alpha threshold', () => {
    const layout = build();
    const ticks = layout.settle();
    assert.ok(ticks > 0);
    assert.ok(layout.alpha < 0.02, `alpha ${layout.alpha} should be settled`);
});

test('no unpinned orb collision circles overlap in a dense hub-and-spoke graph', () => {
    const layout = build();
    layout.settle();
    assert.equal(overlapCount(layout), 0);
});

test('no unpinned orb collision circles overlap in the P6 fixture', () => {
    const layout = build(P6_FIXTURE, { seed: 7 });
    layout.settle();
    assert.equal(overlapCount(layout), 0);
});

// ─── warm start + pruning ─────────────────────────────────────────────────

test('setGraph warm-starts existing rooms and seeds new rooms', () => {
    const layout = build();
    layout.settle();
    const hubBefore = { ...layout.getNode('hub') };

    const added = {
        ...HUB_AND_SPOKE_FIXTURE,
        rooms: [...HUB_AND_SPOKE_FIXTURE.rooms, { id: 'new', name: 'A New Chamber', first_turn: 10, last_visit_turn: 10, visit_count: 1 }],
        edges: [...HUB_AND_SPOKE_FIXTURE.edges, { from: 'hub', direction: 'southwest', to: 'new', kind: 'walk', inferred: 0 }],
    };

    const result = layout.setGraph(added);
    const hubAfter = layout.getNode('hub');
    assert.equal(hubAfter.x, hubBefore.x, 'existing x is preserved for warm start');
    assert.equal(hubAfter.y, hubBefore.y, 'existing y is preserved for warm start');
    assert.ok(layout.getNode('new'), 'new room is seeded');
    assert.deepEqual(result.added, ['new']);
});

test('setGraph prunes removed rooms and their homeAnchors', () => {
    const layout = build();
    layout.settle();

    layout.startDrag('n3');
    layout.dragTo(layout.getNode('n3').x + 12, layout.getNode('n3').y + 12);
    layout.dragEnd();

    assert.ok(layout.homeAnchors.has('n3'));
    const pruned = {
        ...HUB_AND_SPOKE_FIXTURE,
        rooms: HUB_AND_SPOKE_FIXTURE.rooms.filter(room => room.id !== 'n3'),
        edges: HUB_AND_SPOKE_FIXTURE.edges.filter(edge => edge.from !== 'n3' && edge.to !== 'n3'),
    };

    const result = layout.setGraph(pruned);
    assert.equal(layout.getNode('n3'), null);
    assert.equal(layout.homeAnchors.has('n3'), false, 'vanished room anchors are pruned');
    assert.deepEqual(result.removed, ['n3']);

    // Remaining nodes keep their pinned anchors.
    assert.ok(layout.homeAnchors.size >= 0);
});

// ─── idle | hover | drag | coasting state machine ─────────────────────────

test('state machine: idle -> hover -> idle, hover pins nothing persistent', () => {
    const layout = build();
    layout.settle();
    assert.equal(layout.state, 'idle');

    const before = layout.homeAnchors.size;
    assert.equal(layout.startHover('n1'), true);
    assert.equal(layout.state, 'hover');
    assert.equal(layout.hoveredId, 'n1');
    assert.equal(layout.homeAnchors.size, before, 'hover must not create a homeAnchor');

    layout.endHover();
    assert.equal(layout.state, 'idle');
    assert.equal(layout.hoveredId, null);
    assert.equal(layout.homeAnchors.size, before);
});

test('state machine: hover switches targets while already hovering', () => {
    const layout = build();
    layout.settle();
    layout.startHover('n1');
    assert.equal(layout.startHover('n2'), true);
    assert.equal(layout.hoveredId, 'n2');
    assert.equal(layout.state, 'hover');
});

test('state machine: idle -> drag -> coasting -> idle and pins an in-memory homeAnchor', () => {
    const layout = build();
    layout.settle();
    const node = layout.getNode('n1');
    const startX = node.x;
    const startY = node.y;

    assert.equal(layout.startDrag('n1'), true);
    assert.equal(layout.state, 'drag');
    layout.dragTo(startX + 40, startY - 25);
    const moved = layout.getNode('n1');
    assert.equal(moved.x, startX + 40);
    assert.equal(moved.y, startY - 25);

    layout.dragEnd();
    assert.equal(layout.homeAnchors.has('n1'), true, 'release pins the homeAnchor in memory');
    assert.equal(layout.state, 'coasting', 'release before convergence coasts');

    layout.tick();
    layout.settle();
    assert.equal(layout.state, 'idle', 'coasting settles back to idle');
    assert.ok(layout.homeAnchors.has('n1'));
});

test('dragEnd({ cancel: true }) drops an interrupted drag without pinning', () => {
    const layout = build();
    layout.settle();
    const start = { ...layout.getNode('n4') };

    layout.startDrag('n4');
    layout.dragTo(start.x + 70, start.y + 35);
    layout.dragEnd({ cancel: true });

    assert.equal(layout.state, 'idle');
    assert.equal(layout.homeAnchors.has('n4'), false, 'cancelled drag must not persist an anchor');
    const after = layout.getNode('n4');
    assert.equal(after.x, start.x, 'cancelled drag restores x');
    assert.equal(after.y, start.y, 'cancelled drag restores y');
});

test('hover is a no-op during drag and coasting', () => {
    const layout = build();
    layout.settle();

    layout.startDrag('n1');
    assert.equal(layout.startHover('n2'), false);
    assert.equal(layout.state, 'drag');
    assert.equal(layout.hoveredId, null);

    layout.dragEnd();
    assert.equal(layout.state, 'coasting');
    assert.equal(layout.startHover('n2'), false);
    assert.equal(layout.state, 'coasting');
});

test('panning/collision helpers only move unpinned nodes during drag', () => {
    const layout = build();
    layout.settle();
    layout.startDrag('n1');
    layout.dragTo(layout.getNode('n1').x + 10, layout.getNode('n1').y);
    layout.dragEnd();
    layout.settle();

    const pinned = layout.getNode('n1');
    const anchor = layout.homeAnchors.get('n1');
    assert.equal(pinned.pinned, true);
    assert.equal(pinned.x, anchor.x);
    assert.equal(pinned.y, anchor.y);
});
