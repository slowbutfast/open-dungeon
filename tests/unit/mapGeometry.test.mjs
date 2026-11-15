// Pure map-geometry unit tests (gravitational-node-map, 1.2/2.2/2.4).
//
// Pins the DOM-free contract of `web/static/js/components/mapGeometry.js`:
// compact naming, camera transforms, antiparallel curves, circle-border
// arrowhead trimming and `edgeKey` matching.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatCompactRoomName,
    worldToScreen,
    screenToWorld,
    zoomAtPoint,
    computeFitViewport,
    edgeCurve,
    trimmedEdgeEndpoints,
    trimToCircleBorder,
    edgeKey,
    edgeMatchesStep,
    selfLoopPath,
} from '../../web/static/js/components/mapGeometry.js';

// ─── compact two-tier naming ──────────────────────────────────────────────

test('formatCompactRoomName: short names pass through unchanged', () => {
    assert.equal(formatCompactRoomName('North Hall'), 'North Hall');
    assert.equal(formatCompactRoomName('Vault'), 'Vault');
});

test('formatCompactRoomName: strips a leading article when the name is too long', () => {
    assert.equal(formatCompactRoomName('The Vault of Echoes'), 'Vault of Echoes');
    assert.equal(formatCompactRoomName('A Gallery of Falling Light').length <= 16, true);
});

test('formatCompactRoomName: caps at 16 characters with an ellipsis', () => {
    const compact = formatCompactRoomName('The Grand Central Nexus');
    assert.ok(compact.length <= 16, `${compact} should be <= 16 chars`);
    assert.ok(compact.endsWith('…'), 'truncation uses an ellipsis');
});

test('formatCompactRoomName: handles empty and nullish input', () => {
    assert.equal(formatCompactRoomName(''), '');
    assert.equal(formatCompactRoomName(null), '');
    assert.equal(formatCompactRoomName(undefined), '');
});

// ─── camera transforms ────────────────────────────────────────────────────

test('worldToScreen and screenToWorld are inverses', () => {
    const camera = { x: 40, y: -12, zoom: 1.7 };
    const world = { x: 123.5, y: -87.25 };
    const screen = worldToScreen(world, camera);
    const roundTrip = screenToWorld(screen, camera);
    assert.ok(Math.abs(roundTrip.x - world.x) < 1e-9);
    assert.ok(Math.abs(roundTrip.y - world.y) < 1e-9);
});

test('worldToScreen applies zoom then translation', () => {
    const screen = worldToScreen({ x: 10, y: 20 }, { x: 5, y: 7, zoom: 2 });
    assert.deepEqual(screen, { x: 25, y: 47 });
});

test('zoomAtPoint keeps the world point under the cursor fixed', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const point = { x: 200, y: 140 };
    const before = screenToWorld(point, camera);
    const next = zoomAtPoint(camera, 2, point);
    const after = screenToWorld(point, next);
    assert.ok(Math.abs(after.x - before.x) < 1e-9);
    assert.ok(Math.abs(after.y - before.y) < 1e-9);
    assert.equal(next.zoom, 2);
});

test('zoomAtPoint clamps zoom to the supplied range', () => {
    const next = zoomAtPoint({ x: 0, y: 0, zoom: 1 }, 100, { x: 10, y: 10 }, { min: 0.2, max: 2.5 });
    assert.equal(next.zoom, 2.5);
    const down = zoomAtPoint({ x: 0, y: 0, zoom: 1 }, 0.001, { x: 10, y: 10 }, { min: 0.2, max: 2.5 });
    assert.equal(down.zoom, 0.2);
});

test('computeFitViewport frames the whole bounds inside the viewport', () => {
    const bounds = { minX: -100, minY: -50, maxX: 300, maxY: 250 };
    const viewport = { width: 400, height: 300 };
    const camera = computeFitViewport(bounds, viewport, { padding: 20 });

    const topLeft = worldToScreen({ x: bounds.minX, y: bounds.minY }, camera);
    const bottomRight = worldToScreen({ x: bounds.maxX, y: bounds.maxY }, camera);
    assert.ok(topLeft.x >= 19.5 && topLeft.y >= 19.5, `top-left ${JSON.stringify(topLeft)}`);
    assert.ok(bottomRight.x <= 400 - 19.5 && bottomRight.y <= 300 - 19.5,
        `bottom-right ${JSON.stringify(bottomRight)}`);

    // Centre of the bounds maps to the centre of the viewport.
    const centre = worldToScreen({
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
    }, camera);
    assert.ok(Math.abs(centre.x - 200) < 1e-6);
    assert.ok(Math.abs(centre.y - 150) < 1e-6);
});

// ─── antiparallel curves + self-loops ─────────────────────────────────────

test('antiparallel edges curve to opposite sides of the straight line', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const forward = edgeCurve(from, to, { bend: 1, curvature: 0.18 });
    const reverse = edgeCurve(to, from, { bend: 1, curvature: 0.18 });

    assert.ok(forward.control.y > 0, `forward control should bow downward, got ${forward.control.y}`);
    assert.ok(reverse.control.y < 0, `reverse control should bow upward, got ${reverse.control.y}`);
    assert.ok(Math.abs(forward.control.y + reverse.control.y) < 1e-9,
        'antiparallel control offsets are symmetric');
    assert.equal(forward.d, `M 0 0 Q ${forward.control.x} ${forward.control.y} 100 0`);
});

test('zero-bend edges render as straight segments', () => {
    const straight = edgeCurve({ x: 1, y: 2 }, { x: 9, y: 10 }, { bend: 0 });
    assert.equal(straight.d, 'M 1 2 L 9 10');
});

test('self-loop edges render an arc path that returns to the node', () => {
    const path = selfLoopPath({ x: 50, y: 50 }, 16);
    assert.ok(path.startsWith('M '), path);
    assert.ok(path.includes('A '), 'self-loop uses an SVG arc');
    const [startX, startY] = path.slice(2).split(' ').map(Number);
    assert.ok(startX < 50 && startY < 50, 'self-loop starts above-left of the node');
});

// ─── arrowhead border trimming ────────────────────────────────────────────

test('trimToCircleBorder stops exactly on the target radius plus gap', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const trimmed = trimToCircleBorder(from, to, 20, 2);
    assert.ok(Math.abs(trimmed.x - 78) < 1e-9, `expected 100 - 20 - 2, got ${trimmed.x}`);
    assert.ok(Math.abs(trimmed.y) < 1e-9);
});

test('trimmedEdgeEndpoints trims both ends to their respective node radii', () => {
    const from = { x: 0, y: 0, radius: 12 };
    const to = { x: 100, y: 0, radius: 24 };
    const trimmed = trimmedEdgeEndpoints(from, to, 2);
    assert.ok(Math.abs(trimmed.start.x - 14) < 1e-9, `start ${trimmed.start.x}`);
    assert.ok(Math.abs(trimmed.end.x - 74) < 1e-9, `end ${trimmed.end.x}`);
});

// ─── edge keys ────────────────────────────────────────────────────────────

test('edgeKey encodes from | direction | to and treats null as empty', () => {
    assert.equal(edgeKey('r1', 'east', 'r2'), 'r1|east|r2');
    assert.equal(edgeKey('r3', null, 'r4'), 'r3||r4');
    assert.equal(edgeKey('r3', undefined, 'r4'), 'r3||r4');
});

test('edgeMatchesStep matches on direction, including direction: null', () => {
    const north = { from: 'r1', direction: 'east', to: 'r2' };
    assert.equal(edgeMatchesStep(north, { from_room_id: 'r1', direction: 'east', to_room_id: 'r2' }), true);
    assert.equal(edgeMatchesStep(north, { from_room_id: 'r1', direction: 'west', to_room_id: 'r2' }), false);

    const onward = { from: 'r3', direction: null, to: 'r4' };
    assert.equal(edgeMatchesStep(onward, { from_room_id: 'r3', direction: null, to_room_id: 'r4' }), true);
    assert.equal(edgeMatchesStep(onward, { from_room_id: 'r3', direction: 'onward', to_room_id: 'r4' }), false);
});
