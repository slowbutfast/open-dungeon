// Stale-status landmark recovery tests (narrator-style-fidelity, GH #38).
//
// The narrator chronically echoes a STALE `[Status: ...]` Location (or
// truncates the line), freezing the spatial map. `extractNarrationLandmark`
// recovers a proposed location from the narration's arrival landmarks so the
// map keeps growing. These cases are captured from the REAL prose of the live
// playtests that froze the map (see docs/handoffs/2026-08-05-spatial-map-handoff.md
// and the playtest results under game/playtest/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractNarrationLandmark } from '../../engine/narrationLandmarks.js';

test('recovers the destination from a stale-echo playtest turn (struck the old cart track)', () => {
    const prose = 'You trudge south across the sodden heath, boots squelching with every step. ' +
        'The mist curls around your ankles like hungry fingers. After a long, silent march, the ground ' +
        'hardens underfoot—you\'ve struck the old cart track, rutted and half-claimed by mud. ' +
        'The moor stretches on, grey and patient.';
    assert.equal(extractNarrationLandmark(prose), 'Old Cart Track');
});

test('recovers the destination from a path-verb landmark (a muddy footpath snakes east)', () => {
    const prose = 'A muddy footpath snakes east, clinging to the stream\'s edge before vanishing ' +
        'into a dense thicket of thorn trees. The air here smells of wet iron.';
    assert.equal(extractNarrationLandmark(prose), 'Muddy Footpath');
});

test('recovers the destination from the player action when prose does not name it', () => {
    const action = 'The footpath leads to a low turf-roofed bothy with smoke rising from its chimney.';
    assert.equal(extractNarrationLandmark(action), 'Low Turf-roofed Bothy');
});

test('a traversal names its destination, not the intermediate route', () => {
    const action = 'I walk north along the cart track to a rickety wooden bridge over a stream.';
    assert.equal(extractNarrationLandmark(action), 'Rickety Wooden Bridge');
});

test('arrival verb + place phrase (enter the vault)', () => {
    assert.equal(extractNarrationLandmark('You enter the vault, gold glinting in the torchlight.'), 'Vault');
});

test('arrival verb + article + adjective + noun (arrive at the old stone gate)', () => {
    assert.equal(extractNarrationLandmark('You arrive at the old stone gate as dusk falls.'), 'Old Stone Gate');
});

test('path leads into a dense thicket keeps the distinguishing adjective', () => {
    assert.equal(extractNarrationLandmark('The path leads into a dense thicket, brambles closing overhead.'), 'Dense Thicket');
});

test('a refused movement narrates no arrival (null)', () => {
    assert.equal(extractNarrationLandmark('You can\'t go that way. The brambles are impassable.'), null);
});

test('a scene description with no movement narrates no arrival (null)', () => {
    assert.equal(extractNarrationLandmark('The barman nods and polishes a glass. The tavern is quiet tonight.'), null);
});

test('stale prose that does not actually move the player narrates no arrival (null)', () => {
    assert.equal(extractNarrationLandmark('The pines rustle around you, their silence heavier than before.'), null);
});

test('empty narration yields no landmark (null)', () => {
    assert.equal(extractNarrationLandmark(''), null);
});

test('mechanical tokens are rejected (mirrors the forged-status guard)', () => {
    assert.equal(extractNarrationLandmark('You walk into the Admin Room.'), null);
});
