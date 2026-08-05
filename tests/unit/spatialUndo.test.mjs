// Spatial undo + old-save unit tests (spatial-map-region-graph, task 1.6).
//
// Two contracts, both RED on HEAD:
//
//  1. OLD-SAVE COMPATIBILITY (D4): AdventureState.load tolerates a save JSON
//     without `current_room_id`, leaving the field null and keeping `location`.
//     Today the field does not exist at all on the class (undefined), so the
//     null assertion fails.
//
//  2. UNDO RESTORES THE PRE-TURN ROOM (D5): engine.undo restores
//     currentRoomId/location to the room the player was in before the undone
//     turn, and rollback removes rooms/edges/visits discovered on that turn.
//     Today undo never touches location and currentRoomId does not exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { AdventureState } from '../../engine/state.js';
import { createTempDir, cleanupDir } from './helpers.test-utils.mjs';

process.env.MOCK_LLM = '1';
const { AdventureEngine } = await import('../../engine/index.js');

const writeJson = (filePath, data) => fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');

async function runTurn(engine, actionType, text) {
    const stream = engine.generateResponseStream(actionType, text);
    let done = '';
    for await (const ev of stream) {
        if (ev.type === 'done') done = ev.content || '';
        if (ev.type === 'error') throw new Error(`turn error: ${ev.content}`);
    }
    return done;
}

// Replace the mock narrator's streaming narration with a scripted sequence so
// each turn proposes the location the test wants. Non-narration intents
// (extraction, embeddings, ...) fall through to the original mock.
function installScriptedNarrator(engine, narrations) {
    const client = engine.llm.client;
    const originalCreate = client.chat.completions.create.bind(client.chat.completions);
    let idx = 0;
    client.chat.completions.create = async (options) => {
        if (options.stream && options.intent === 'narration') {
            const text = narrations[Math.min(idx, narrations.length - 1)];
            idx += 1;
            return (async function* () {
                yield { choices: [{ delta: { content: text } }] };
            })();
        }
        return originalCreate(options);
    };
    return () => { client.chat.completions.create = originalCreate; };
}

// ─── old-save compatibility (no currentRoomId) ─────────────────────────────

test('old-save: loading a save without current_room_id sets it to null and keeps location', async (t) => {
    const dataDir = createTempDir('od-oldsave-');
    const saveDir = path.join(dataDir, 'saves');
    fs.mkdirSync(saveDir, { recursive: true });
    t.after(() => cleanupDir(dataDir));

    // A pre-spatial-map save: no current_room_id field at all.
    writeJson(path.join(saveDir, 'adv-old.json'), {
        adventure_id: 'adv-old',
        title: 'Old Save',
        location: 'The Old Tavern',
        score: 12,
        moves: 7,
        history: [],
        archived_history: []
    });

    const state = new AdventureState();
    await state.load(saveDir, 'adv-old', async () => 'mock-gemma');

    assert.equal(state.currentRoomId, null, 'missing current_room_id loads as null');
    assert.equal(state.location, 'The Old Tavern', 'location is preserved for old saves');
    assert.equal(state.moves, 7);
});

test('save/load round-trips currentRoomId alongside location', async (t) => {
    const dataDir = createTempDir('od-rt-');
    const saveDir = path.join(dataDir, 'saves');
    fs.mkdirSync(saveDir, { recursive: true });
    t.after(() => cleanupDir(dataDir));

    const state = new AdventureState();
    state.adventureId = 'adv-rt';
    state.title = 'Round Trip';
    state.currentRoomId = 'room-42';
    state.location = 'North Clearing';
    await state.save(saveDir);

    const loaded = new AdventureState();
    await loaded.load(saveDir, 'adv-rt', async () => 'mock-gemma');

    assert.equal(loaded.currentRoomId, 'room-42');
    assert.equal(loaded.location, 'North Clearing');
});

// ─── undo restores the pre-turn room (D5) ──────────────────────────────────

test('UNDO RESTORES ROOM (RED on HEAD): undo of a discovery turn reverts room and removes its rows', async (t) => {
    const tempRoot = createTempDir('od-undo-spatial-');
    const saveDir = path.join(tempRoot, 'saves');
    t.after(() => cleanupDir(tempRoot));

    const engine = new AdventureEngine(saveDir);
    await engine.newAdventure('Spatial Undo Test');
    const restore = installScriptedNarrator(engine, [
        'You step into the North Clearing.\n[Status: North Clearing | Score: 0 | Moves: 1]',
        'You reach the Sunlit Grove.\n[Status: Sunlit Grove | Score: 0 | Moves: 2]',
    ]);

    try {
        // Turn 1: discover North Clearing.
        await runTurn(engine, 'do', 'go north');
        assert.equal(engine.location, 'North Clearing');
        assert.ok(engine.state.currentRoomId, 'currentRoomId established on the first turn');
        const firstRoomId = engine.state.currentRoomId;
        const firstRoom = engine.memory.structuredStore.getRoom(engine.adventureId, firstRoomId);
        assert.equal(firstRoom.name, 'North Clearing');

        // Turn 2: discover Sunlit Grove.
        await runTurn(engine, 'do', 'go east');
        assert.equal(engine.location, 'Sunlit Grove');
        assert.notEqual(engine.state.currentRoomId, firstRoomId);
        const groveRoom = engine.memory.structuredStore.findRoomByName(engine.adventureId, 'Sunlit Grove');
        assert.ok(groveRoom, 'the discovered grove exists in the store');
        assert.equal(engine.moves, 2);

        // Undo turn 2.
        await engine.undo();

        assert.equal(engine.moves, 1);
        assert.equal(engine.location, 'North Clearing', 'location reverts to the pre-turn room');
        assert.equal(engine.state.currentRoomId, firstRoomId, 'currentRoomId reverts to the pre-turn room');
        assert.equal(
            engine.memory.structuredStore.getRoom(engine.adventureId, groveRoom.id),
            null,
            'the room discovered on the undone turn is removed from the store'
        );
        const edge = engine.memory.structuredStore.getEdge(engine.adventureId, firstRoomId, 'east');
        assert.equal(edge, null, 'the edge discovered on the undone turn is removed');
    } finally {
        restore();
        engine.memory.structuredStore.close();
    }
});

test('UNDO RESTORES ROOM (RED on HEAD): undo of a pure movement restores the prior room and removes the visit', async (t) => {
    const tempRoot = createTempDir('od-undo-move-');
    const saveDir = path.join(tempRoot, 'saves');
    t.after(() => cleanupDir(tempRoot));

    const engine = new AdventureEngine(saveDir);
    await engine.newAdventure('Spatial Move Undo');
    const restore = installScriptedNarrator(engine, [
        'You step into the North Clearing.\n[Status: North Clearing | Score: 0 | Moves: 1]',
        'You reach the Sunlit Grove.\n[Status: Sunlit Grove | Score: 0 | Moves: 2]',
        'You walk back into the North Clearing.\n[Status: North Clearing | Score: 0 | Moves: 3]',
    ]);

    try {
        // Turn 1: North Clearing. Turn 2: Sunlit Grove (existing room now).
        await runTurn(engine, 'do', 'go north');
        const northRoomId = engine.state.currentRoomId;
        await runTurn(engine, 'do', 'go east');
        const groveRoom = engine.memory.structuredStore.findRoomByName(engine.adventureId, 'Sunlit Grove');
        assert.ok(groveRoom);

        // Turn 3: pure movement back to North Clearing (reverse-inferred edge).
        await runTurn(engine, 'do', 'go west');
        assert.equal(engine.location, 'North Clearing');
        assert.equal(engine.state.currentRoomId, northRoomId);
        assert.equal(engine.moves, 3);

        // Undo turn 3 — pure movement between existing rooms.
        await engine.undo();

        assert.equal(engine.moves, 2);
        assert.equal(engine.state.currentRoomId, groveRoom.id, 'prior room restored');
        assert.equal(engine.location, 'Sunlit Grove', 'location restored to the room at turn 2');
        // No rooms/edges removed (both existed before turn 3); only the visit rolled back.
        assert.ok(engine.memory.structuredStore.getRoom(engine.adventureId, northRoomId));
        assert.ok(engine.memory.structuredStore.getRoom(engine.adventureId, groveRoom.id));
        const visits = engine.memory.structuredStore.db.prepare(
            'SELECT * FROM room_visits WHERE adventure_id = ? ORDER BY turn'
        ).all(engine.adventureId);
        assert.equal(visits.length, 2, 'the turn-3 visit was removed, earlier visits survive');
        assert.equal(visits[visits.length - 1].turn, 2);
    } finally {
        restore();
        engine.memory.structuredStore.close();
    }
});
