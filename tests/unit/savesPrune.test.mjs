// Restore-save manager unit tests (gravitational-node-map PATCH-04).
//
// Pure sort/prune/page helpers, `AdventureState.list()` timestamps, and
// `AdventureEngine.pruneAdventures()` against a real temp engine (JSON +
// SQLite rows + vector index).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AdventureState } from '../../engine/state.js';
import { AdventureEngine } from '../../engine/index.js';
import {
    sortSaves,
    selectPrunable,
    pageSlice,
} from '../../web/static/js/components/saveListModel.js';

function tempDir(prefix = 'od-saves-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeSave(dir, id, { title, moves, mtimeMs }) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify({
        adventure_id: id,
        title,
        location: 'Test Room',
        summary: `${title} summary`,
        moves,
        score: 0,
        history: [],
        archived_history: [],
    }, null, 2));
    if (mtimeMs != null) fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
    return file;
}

function purge(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test('sortSaves: recent, numeric-aware alpha, and moves orders', () => {
    const saves = [
        { id: 'a', title: 'Zebra 10', moves: 5, updated_at: 1000 },
        { id: 'b', title: 'alpha 2', moves: 20, updated_at: 3000 },
        { id: 'c', title: 'Alpha 11', moves: 1, updated_at: 2000 },
    ];
    assert.deepEqual(sortSaves(saves, 'recent').map(s => s.id), ['b', 'c', 'a']);
    assert.deepEqual(sortSaves(saves, 'alpha').map(s => s.title), ['alpha 2', 'Alpha 11', 'Zebra 10']);
    assert.deepEqual(sortSaves(saves, 'moves').map(s => s.id), ['b', 'a', 'c']);
});

test('sortSaves: missing fields are zero and ties are deterministic', () => {
    const saves = [
        { id: 'z', title: 'Same' },
        { id: 'a', title: 'Same' },
        { id: 'm', title: 'Same', moves: 2, updated_at: 50 },
    ];
    assert.deepEqual(sortSaves(saves, 'moves').map(s => s.id), ['m', 'a', 'z']);
    assert.deepEqual(sortSaves(saves, 'recent').map(s => s.id), ['m', 'a', 'z']);
    assert.deepEqual(sortSaves(saves, 'alpha').map(s => s.id), ['a', 'm', 'z']);
});

test('selectPrunable: strict threshold and active exclusion', () => {
    const saves = [
        { id: 'a', moves: 2 },
        { id: 'b', moves: 3 },
        { id: 'c', moves: 0 },
    ];
    assert.deepEqual(selectPrunable(saves, 3, 'c').map(s => s.id), ['a']);
    assert.deepEqual(selectPrunable(saves, 1, null).map(s => s.id), ['c']);
    assert.deepEqual(selectPrunable(saves, 3, 'b').map(s => s.id), ['a', 'c']);
});

test('pageSlice: returns the shown window', () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    assert.deepEqual(pageSlice(items, 50), items.slice(0, 50));
    assert.deepEqual(pageSlice(items, 100), items.slice(0, 100));
    assert.deepEqual(pageSlice(items, 0), []);
});

test('AdventureState.list: attaches updated_at and load does not change it', async () => {
    const root = tempDir();
    const dir = path.join(root, 'adventures');
    try {
        const file = writeSave(dir, 'one', {
            title: 'Timed Save', moves: 4, mtimeMs: Date.now() - 60_000,
        });
        const state = new AdventureState();
        const rows = await state.list(dir);
        assert.equal(rows.length, 1);
        assert.ok(Number.isFinite(rows[0].updated_at));
        const before = fs.statSync(file).mtimeMs;

        await state.load(dir, 'one', async () => null);
        const after = fs.statSync(file).mtimeMs;
        assert.equal(after, before, 'loading a save must not rewrite its mtime');
    } finally {
        purge(root);
    }
});

test('pruneAdventures: dry run, active exclusion, JSON + SQLite + index removal', async () => {
    const root = tempDir();
    const saveDir = path.join(root, 'adventures');
    const dataDir = path.join(root, 'data');
    try {
        writeSave(saveDir, 'low', { title: 'Low', moves: 1 });
        writeSave(saveDir, 'active', { title: 'Active', moves: 2 });
        writeSave(saveDir, 'keep', { title: 'Keep', moves: 20 });

        const engine = new AdventureEngine(saveDir);
        engine.state.adventureId = 'active';

        const store = engine.memory.structuredStore;
        store.upsertRoom('low', 'room-low', 'Low Room', null, 0);
        store.recordVisit('low', 'room-low', 1);
        store.db.prepare(
            `INSERT INTO exits (id, adventure_id, from_room, direction, to_room, kind, inferred, discovered_turn)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run('exit-low', 'low', 'room-low', 'north', 'room-next', 'walk', 0, 1);
        const indexDir = path.join(engine.memory.vectorStore.indexDir, 'low');
        fs.mkdirSync(indexDir, { recursive: true });
        fs.writeFileSync(path.join(indexDir, 'index.json'), '{}');

        const preview = await engine.pruneAdventures(3, { dryRun: true });
        assert.equal(preview.count, 1);
        assert.deepEqual(preview.ids, ['low']);
        assert.equal(preview.excludedActive, 'active');
        assert.ok(fs.existsSync(path.join(saveDir, 'low.json')), 'dry run must not delete');

        const result = await engine.pruneAdventures(3);
        assert.deepEqual(result.deletedIds, ['low']);
        assert.deepEqual(result.failedIds, []);
        assert.equal(result.keptCount, 2);

        assert.equal(fs.existsSync(path.join(saveDir, 'low.json')), false);
        assert.equal(store.getRooms('low').length, 0);
        assert.equal(store.getEdges('low').length, 0);
        const visits = store.db.prepare(
            'SELECT COUNT(*) AS n FROM room_visits WHERE adventure_id = ?'
        ).get('low').n;
        assert.equal(visits, 0);
        assert.equal(fs.existsSync(indexDir), false);

        assert.ok(fs.existsSync(path.join(saveDir, 'active.json')));
        assert.ok(fs.existsSync(path.join(saveDir, 'keep.json')));
        store.close();
        assert.ok(dataDir); // dataDir is derived from saveDir by the engine
    } finally {
        purge(root);
    }
});

test('pruneAdventures: invalid thresholds throw', async () => {
    const root = tempDir();
    try {
        const engine = new AdventureEngine(path.join(root, 'adventures'));
        for (const value of [0, -1, 1.5, 'nope']) {
            await assert.rejects(() => engine.pruneAdventures(value), /integer >= 1/);
        }
        engine.memory.structuredStore.close();
    } finally {
        purge(root);
    }
});

test('pruneAdventures: one failure does not abort the batch', async () => {
    const root = tempDir();
    const saveDir = path.join(root, 'adventures');
    try {
        writeSave(saveDir, 'bad', { title: 'Bad', moves: 1 });
        writeSave(saveDir, 'good', { title: 'Good', moves: 1 });
        const engine = new AdventureEngine(saveDir);
        engine.state.adventureId = null;
        const originalDelete = engine.deleteAdventure.bind(engine);
        engine.deleteAdventure = async id => {
            if (id === 'bad') throw new Error('forced failure');
            return originalDelete(id);
        };

        const result = await engine.pruneAdventures(5);
        assert.deepEqual(result.deletedIds, ['good']);
        assert.deepEqual(result.failedIds, ['bad']);
        assert.ok(fs.existsSync(path.join(saveDir, 'bad.json')));
        engine.memory.structuredStore.close();
    } finally {
        purge(root);
    }
});
