// Session manager cold-start/rehydration unit tests
// (vercel-deployment-and-auth, task 1.6).
//
// Uses the real `AdventureState` and a real file-backed `StructuredStore` but a
// minimal engine shim, so the SQLite snapshot round-trip is genuine without an
// LLM client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { SessionManager } from '../../engine/sessionManager.js';
import { KvStore } from '../../web/kvStore.js';
import { AdventureState } from '../../engine/state.js';
import { StructuredStore } from '../../engine/memory/structuredStore.js';

function tempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'od-session-'));
}

function makeEngineShim(dir) {
    // `dir` is the engine saveDir (<userDir>/adventures); the memory data dir
    // derives as its sibling, matching engine/index.js.
    const state = new AdventureState();
    const store = new StructuredStore(path.join(dir, '..', 'data'));
    return {
        state,
        saveDir: dir,
        memory: { structuredStore: store },
        save: async () => {}
    };
}

test('constructing a SessionManager instantiates no engine (no import-time work)', () => {
    let calls = 0;
    const manager = new SessionManager({
        serverless: true,
        kv: new KvStore(),
        tmpRoot: tempRoot(),
        engineFactory: (dir) => { calls++; return makeEngineShim(dir); }
    });
    assert.equal(calls, 0, 'engine construction must be lazy');
    assert.equal(typeof manager.getEngine, 'function');
});

test('getEngine lazily instantiates exactly one engine per sub', async () => {
    let calls = 0;
    const manager = new SessionManager({
        serverless: false,
        tmpRoot: tempRoot(),
        engineFactory: (dir) => { calls++; return makeEngineShim(dir); }
    });
    const a1 = await manager.getEngine('u_a');
    const a2 = await manager.getEngine('u_a');
    assert.equal(calls, 1, 'cached engine is reused within a process');
    assert.equal(a1, a2);
});

test('state JSON and SQLite snapshot round-trip across a cold manager', async () => {
    const kv = new KvStore();
    const sharedTmp = tempRoot();

    // Warm instance: write adventure state + an inventory row, then persist.
    const warm = new SessionManager({
        serverless: true, kv, tmpRoot: sharedTmp,
        engineFactory: makeEngineShim
    });
    const engineA = await warm.getEngine('u_roundtrip');
    engineA.state.adventureId = 'adv-1';
    engineA.state.title = 'The Deep Vault';
    engineA.state.location = 'Vault Door';
    engineA.state.score = 7;
    engineA.state.moves = 4;
    engineA.memory.structuredStore.initAdventure('adv-1');
    engineA.memory.structuredStore.upsertInventoryItem('adv-1', {
        item_name: 'Brass Key', item_type: 'misc', quantity: 1, status: 'held'
    });
    await warm.persist('u_roundtrip', engineA);

    // Cold instance: a fresh manager sharing only the KV store (a new Lambda
    // container) must rehydrate the exact adventure and SQLite rows.
    const cold = new SessionManager({
        serverless: true, kv, tmpRoot: sharedTmp,
        engineFactory: makeEngineShim
    });
    const engineB = await cold.getEngine('u_roundtrip');
    assert.equal(engineB.state.adventureId, 'adv-1');
    assert.equal(engineB.state.title, 'The Deep Vault');
    assert.equal(engineB.state.score, 7);
    assert.equal(engineB.state.moves, 4);
    assert.ok(engineB.memory.structuredStore.hasItem('adv-1', 'Brass Key'), 'inventory row survived the snapshot');
});

test('distinct subs get isolated state and databases', async () => {
    const kv = new KvStore();
    const tmp = tempRoot();
    const manager = new SessionManager({
        serverless: true, kv, tmpRoot: tmp,
        engineFactory: makeEngineShim
    });

    const alice = await manager.getEngine('u_alice');
    alice.state.adventureId = 'adv-alice';
    alice.state.title = 'Alice Quest';
    alice.memory.structuredStore.initAdventure('adv-alice');
    alice.memory.structuredStore.upsertInventoryItem('adv-alice', {
        item_name: 'Lantern', item_type: 'misc', quantity: 1, status: 'held'
    });
    await manager.persist('u_alice', alice);

    const bob = await manager.getEngine('u_bob');
    assert.equal(bob.state.adventureId, null, 'Bob must not inherit Alice adventure');
    assert.equal(bob.state.title, 'New Adventure');
    assert.equal(bob.memory.structuredStore.hasItem('adv-alice', 'Lantern'), null);

    // Different on-disk roots too.
    assert.notEqual(manager.userDir('u_alice'), manager.userDir('u_bob'));
});
