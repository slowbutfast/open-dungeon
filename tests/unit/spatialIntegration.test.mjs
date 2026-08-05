// Mock-narration spatial integration (spatial-map-region-graph, tasks 7.3-7.4).
//
// Drives the REAL engine turn-commit path with a scripted mock narrator
// (MOCK_LLM=1, the narration intent swapped for a scripted stream) and asserts
// the persisted room graph forms exactly as reconciliation dictates:
//
//   west → north → east → south
//   W -north-> N -east-> E -south-> N  (confirmed edges)
//   N -south-> W, E -west-> N, N -north-> E (inferred reverse edges)
//
// Plus a save/load round-trip and an old-save (no current_room_id) load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createTempDir, cleanupDir } from './helpers.test-utils.mjs';

process.env.MOCK_LLM = '1';
const { AdventureEngine } = await import('../../engine/index.js');

async function runTurn(engine, actionType, text) {
    const stream = engine.generateResponseStream(actionType, text);
    let done = '';
    for await (const ev of stream) {
        if (ev.type === 'done') done = ev.content || '';
        if (ev.type === 'error') throw new Error(`turn error: ${ev.content}`);
    }
    return done;
}

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

const GRAPH_SEQUENCE = [
    'You step into the Western Clearing.\n[Status: Western Clearing | Score: 0 | Moves: 1]',
    'You find the Northern Trail.\n[Status: Northern Trail | Score: 0 | Moves: 2]',
    'You reach the Eastern Ridge.\n[Status: Eastern Ridge | Score: 0 | Moves: 3]',
    'You return to the Northern Trail.\n[Status: Northern Trail | Score: 0 | Moves: 4]',
    'You walk south back to the Western Clearing.\n[Status: Western Clearing | Score: 0 | Moves: 5]',
];

test('mock integration: west→north→east→south forms the expected room graph with a deterministic return', async (t) => {
    const tempRoot = createTempDir('od-int-');
    const saveDir = path.join(tempRoot, 'saves');
    t.after(() => cleanupDir(tempRoot));

    const engine = new AdventureEngine(saveDir);
    await engine.newAdventure('Mock Integration');
    const restore = installScriptedNarrator(engine, GRAPH_SEQUENCE);

    try {
        await runTurn(engine, 'do', 'go west');
        await runTurn(engine, 'do', 'go north');
        await runTurn(engine, 'do', 'go east');
        await runTurn(engine, 'do', 'go south');

        const store = engine.memory.structuredStore;
        const adv = engine.adventureId;

        const rooms = store.getRooms(adv);
        assert.equal(rooms.length, 3, 'three distinct rooms, no duplicate nodes');
        assert.deepEqual(
            rooms.map(r => r.name).sort(),
            ['Eastern Ridge', 'Northern Trail', 'Western Clearing']
        );
        assert.equal(engine.location, 'Northern Trail');

        const w = store.findRoomByName(adv, 'Western Clearing');
        const n = store.findRoomByName(adv, 'Northern Trail');
        const e = store.findRoomByName(adv, 'Eastern Ridge');

        // Confirmed edges + inferred reverses.
        assert.equal(store.getEdge(adv, w.id, 'north').to_room, n.id, 'W -north-> N confirmed');
        assert.equal(store.getEdge(adv, w.id, 'north').inferred, 0);
        assert.equal(store.getEdge(adv, n.id, 'south').to_room, w.id, 'N -south-> W inferred');
        assert.equal(store.getEdge(adv, n.id, 'south').inferred, 1);
        assert.equal(store.getEdge(adv, n.id, 'east').to_room, e.id, 'N -east-> E confirmed');
        assert.equal(store.getEdge(adv, e.id, 'west').to_room, n.id, 'E -west-> N inferred');
        assert.equal(store.getEdge(adv, e.id, 'west').inferred, 1);
        assert.equal(store.getEdge(adv, e.id, 'south').to_room, n.id, 'E -south-> N return leg resolved to the known room');
        assert.equal(store.getEdge(adv, n.id, 'north').inferred, 1, 'N -north-> E inferred');
        assert.equal(engine.state.currentRoomId, n.id);

        // Deterministic return via the inferred reverse edge: south from N.
        await runTurn(engine, 'do', 'go south');
        assert.equal(engine.location, 'Western Clearing');
        assert.equal(engine.state.currentRoomId, w.id, 'return path resolves via the inferred edge');
        assert.equal(store.getRooms(adv).length, 3, 'still no duplicate rooms after the return');
    } finally {
        restore();
        engine.memory.structuredStore.close();
    }
});

test('mock integration: a directionless walk ("walk on") records the forward edge and advances currentRoomId (8.1)', async (t) => {
    const tempRoot = createTempDir('od-int-oneway-');
    const saveDir = path.join(tempRoot, 'saves');
    t.after(() => cleanupDir(tempRoot));

    const engine = new AdventureEngine(saveDir);
    await engine.newAdventure('One-Way Walk');
    const restore = installScriptedNarrator(engine, [
        'You step into the Western Clearing.\n[Status: Western Clearing | Score: 0 | Moves: 1]',
        'You walk on along the ridge into the Northern Trail.\n[Status: Northern Trail | Score: 0 | Moves: 2]',
    ]);

    try {
        // Turn 1: a named-direction walk establishes the starting room.
        await runTurn(engine, 'do', 'go west');
        assert.equal(engine.location, 'Western Clearing');
        assert.ok(engine.state.currentRoomId, 'currentRoomId established on turn 1');

        // Turn 2: a DIRECTIONLESS walk ("walk on" carries no direction signal).
        await runTurn(engine, 'do', 'walk on');
        assert.equal(engine.location, 'Northern Trail');

        const store = engine.memory.structuredStore;
        const adv = engine.adventureId;
        const west = store.findRoomByName(adv, 'Western Clearing');
        const north = store.findRoomByName(adv, 'Northern Trail');

        // 8.1 regression: the null-direction forward edge exists now. Before
        // the fix it threw `NOT NULL constraint failed: exits.direction`, the
        // throw was swallowed, and no edge/visit was recorded.
        const forward = store.getEdge(adv, west.id, null);
        assert.ok(forward, 'the null-direction forward edge is recorded');
        assert.equal(forward.to_room, north.id);
        assert.equal(forward.kind, 'walk');
        assert.equal(forward.inferred, 0);

        // No reverse edge is inferred for the directionless one-way traversal.
        assert.equal(store.getIncomingExits(adv, west.id).filter(e => e.from_room === north.id).length, 0,
            'no reverse edge from the destination');

        // currentRoomId advanced to the destination — never left stale on the
        // previous room while the location committed (D4 location/room sync).
        assert.equal(engine.state.currentRoomId, north.id, 'currentRoomId advanced to the destination');
        assert.equal(engine.location, 'Northern Trail');

        // And the same room is reachable again through reconciliation.
        const map = await engine.getMap();
        assert.equal(map.current_room_id, north.id, 'the map agrees with the committed room');
    } finally {
        restore();
        engine.memory.structuredStore.close();
    }
});

test('mock integration: a scripted narrator advancing its status line grows the map past 3 rooms (narrator-fidelity mandate guard)', async (t) => {
    const tempRoot = createTempDir('od-int-fidelity-');
    const saveDir = path.join(tempRoot, 'saves');
    t.after(() => cleanupDir(tempRoot));

    const engine = new AdventureEngine(saveDir);
    await engine.newAdventure('Wanderer');

    // The prompt-contract fix (narrator-style-fidelity): the composed system
    // message for a turn must carry the status mandate and the style
    // directive. This is the guard that the integration's premise — a
    // compliant narrator advances its Location — rests on; if the mandate
    // ever regresses out of the default prompt, this fails.
    const systemMsg = engine.llm.buildSystemMessage(engine.state, [], [], []);
    assert.ok(systemMsg.content.includes('Location field MUST name the new place'),
        'composed system message must carry the status mandate');
    assert.ok(systemMsg.content.includes("Adopt the tone implied by the player's opening"),
        'composed system message must carry the style directive');

    const restore = installScriptedNarrator(engine, [
        'You enter the Misty Grotto.\n[Status: Misty Grotto | Score: 0 | Moves: 1]',
        'You reach the Sunless Bog.\n[Status: Sunless Bog | Score: 0 | Moves: 2]',
        'You climb to the Cinder Shelf.\n[Status: Cinder Shelf | Score: 0 | Moves: 3]',
        'You descend into the Bone Orchard.\n[Status: Bone Orchard | Score: 0 | Moves: 4]',
    ]);

    try {
        for (const action of ['go west', 'go north', 'go east', 'go down']) {
            await runTurn(engine, 'do', action);
        }
        const map = await engine.getMap();
        assert.ok(map.rooms.length >= 4, `map must grow past 3 rooms when the narrator moves the player, got ${map.rooms.length}`);
        // The adopted style is captured into state on the first turn and held
        // for the session (never re-detected).
        assert.ok(engine.state.narratorStyle, 'narrator style captured into state');
        const pinned = engine.state.narratorStyle;
        await runTurn(engine, 'do', 'look around');
        assert.equal(engine.state.narratorStyle, pinned, 'style stays pinned across turns');
    } finally {
        restore();
        engine.memory.structuredStore.close();
    }
});

test('save/load round-trip: the graph and current room survive a restart', async (t) => {    const tempRoot = createTempDir('od-int-save-');
    const saveDir = path.join(tempRoot, 'saves');
    t.after(() => cleanupDir(tempRoot));

    const engine = new AdventureEngine(saveDir);
    await engine.newAdventure('Save Round Trip');
    const restore = installScriptedNarrator(engine, GRAPH_SEQUENCE);

    let adventureId;
    try {
        await runTurn(engine, 'do', 'go west');
        await runTurn(engine, 'do', 'go north');
        await runTurn(engine, 'do', 'go east');
        assert.equal(engine.location, 'Eastern Ridge');
        adventureId = engine.adventureId;
        await engine.save();
        const currentRoomId = engine.state.currentRoomId;
        assert.ok(currentRoomId);
        engine.memory.structuredStore.close();
    } finally {
        restore();
    }

    // "Restart": a fresh engine over the same save dir + data store.
    const engine2 = new AdventureEngine(saveDir);
    try {
        await engine2.load(adventureId);
        const store2 = engine2.memory.structuredStore;
        assert.ok(engine2.state.currentRoomId, 'currentRoomId survives save/load');
        // The map is restored from the store and the current room resolves to
        // the same node.
        const rooms = store2.getRooms(adventureId);
        assert.equal(rooms.length, 3, 'rooms persist across save/load');
        const map = await engine2.getMap();
        assert.equal(map.current_room_id, engine2.state.currentRoomId, 'map current room matches state');
        const current = store2.getRoom(adventureId, engine2.state.currentRoomId);
        assert.equal(current.name, 'Eastern Ridge', 'current room is the room at save time');
    } finally {
        engine2.memory.structuredStore.close();
    }
});

test('old-save load: a save without current_room_id establishes the room from location', async (t) => {
    const tempRoot = createTempDir('od-int-old-');
    const saveDir = path.join(tempRoot, 'saves');
    t.after(() => cleanupDir(tempRoot));
    fs.mkdirSync(saveDir, { recursive: true });

    // Pre-spatial-map save: no current_room_id field.
    fs.writeFileSync(path.join(saveDir, 'adv-legacy.json'), JSON.stringify({
        adventure_id: 'adv-legacy',
        title: 'Legacy Save',
        location: 'The Old Tavern',
        score: 4,
        moves: 9,
        history: [],
        archived_history: []
    }, null, 4), 'utf-8');

    const engine = new AdventureEngine(saveDir);
    try {
        await engine.load('adv-legacy');
        assert.equal(engine.location, 'The Old Tavern');

        // Task 4.4: loading with a null currentRoomId establishes the current
        // room from the persisted location, so the map is coherent immediately.
        const store = engine.memory.structuredStore;
        const tavern = store.findRoomByName(engine.adventureId, 'The Old Tavern');
        assert.ok(tavern, 'the loaded location became a room node on load');
        assert.equal(engine.state.currentRoomId, tavern.id, 'currentRoomId established from location on load');

        // The first turn after load reconciles from the established location:
        // moving from The Old Tavern grows an edge rather than a fresh start.
        const restore = installScriptedNarrator(engine, [
            'You step into the Cellar.\n[Status: The Cellar | Score: 0 | Moves: 10]',
        ]);
        try {
            await runTurn(engine, 'do', 'go down');
        } finally {
            restore();
        }

        assert.equal(engine.location, 'The Cellar');
        const down = store.getEdge(engine.adventureId, tavern.id, 'down');
        assert.equal(down.to_room, store.findRoomByName(engine.adventureId, 'The Cellar').id);
    } finally {
        engine.memory.structuredStore.close();
    }
});
