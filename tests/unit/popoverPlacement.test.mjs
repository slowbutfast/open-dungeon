// Pure popover-placement unit tests (gravitational-node-map, 1.2/2.3/2.4).
//
// Pins the DOM-free 8-candidate obstacle-aware scorer. Candidates are scored by
// viewport overflow + obstacle occlusion, with a stable preference order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    POPOVER_PLACEMENTS,
    chooseBestPopoverPosition,
} from '../../web/static/js/components/popoverPlacement.js';

const VIEWPORT = { width: 1000, height: 700 };

function place(overrides = {}) {
    return chooseBestPopoverPosition({
        anchor: { left: 400, top: 300, width: 80, height: 80 },
        size: { width: 240, height: 160 },
        viewport: VIEWPORT,
        obstacles: [],
        gap: 12,
        margin: 8,
        ...overrides,
    });
}

test('POPOVER_PLACEMENTS exposes the 8 candidates in order', () => {
    assert.deepEqual(POPOVER_PLACEMENTS, ['R', 'L', 'T', 'B', 'TR', 'BR', 'TL', 'BL']);
});

test('no obstacles: chooses the right-hand placement', () => {
    const result = place();
    assert.equal(result.placement, 'R');
    assert.equal(result.left, 400 + 80 + 12);
});

test('an obstacle on the right pushes the card to the left', () => {
    const result = place({
        obstacles: [{ left: 480, top: 240, width: 260, height: 220 }],
    });
    assert.equal(result.placement, 'L');
    assert.equal(result.left, 400 - 240 - 12);
});

test('score avoids covering the focal edge / neighbour obstacles', () => {
    const result = place({
        obstacles: [
            { left: 480, top: 280, width: 260, height: 140 }, // right
            { left: 150, top: 280, width: 260, height: 140 }, // left
        ],
    });
    assert.ok(['T', 'B', 'TR', 'BR', 'TL', 'BL'].includes(result.placement), result.placement);
});

test('clamps within the viewport when the anchor is near an edge', () => {
    const result = place({
        anchor: { left: 940, top: 30, width: 40, height: 40 },
    });
    assert.ok(result.left >= 8, `left ${result.left}`);
    assert.ok(result.top >= 8, `top ${result.top}`);
    assert.ok(result.left + 240 <= 1000 - 8 + 1e-9, `right ${result.left + 240}`);
    assert.ok(result.top + 160 <= 700 - 8 + 1e-9, `bottom ${result.top + 160}`);
});

test('all returned positions stay inside the viewport', () => {
    const anchors = [
        { left: 0, top: 0, width: 20, height: 20 },
        { left: 490, top: 340, width: 20, height: 20 },
        { left: 980, top: 680, width: 20, height: 20 },
        { left: 0, top: 680, width: 20, height: 20 },
    ];
    for (const anchor of anchors) {
        const result = place({ anchor });
        assert.ok(result.left >= 8 - 1e-9, `left ${result.left} for ${JSON.stringify(anchor)}`);
        assert.ok(result.top >= 8 - 1e-9, `top ${result.top} for ${JSON.stringify(anchor)}`);
        assert.ok(result.left + 240 <= 1000 - 8 + 1e-9, `right for ${JSON.stringify(anchor)}`);
        assert.ok(result.top + 160 <= 700 - 8 + 1e-9, `bottom for ${JSON.stringify(anchor)}`);
    }
});

test('topMargin keeps a clamped popover below the top status bar', () => {
    const result = chooseBestPopoverPosition({
        anchor: { left: 100, top: 40, width: 40, height: 40 },
        size: { width: 240, height: 160 },
        viewport: { width: 400, height: 320 },
        obstacles: [],
        gap: 12,
        margin: 8,
        topMargin: 64,
    });
    assert.ok(result.top >= 64, `top ${result.top} must clear the 64px top margin`);
});
