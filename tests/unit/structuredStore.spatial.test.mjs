// StructuredStore spatial-table unit tests (spatial-map-region-graph, task 1.5).
//
// Pins the room-graph surface the store must own (D1 schema-owner pattern):
// rooms / exits / room_visits tables, the access methods, the per-direction
// UNIQUE constraint, and rollbackTurn coverage of all three tables. These are
// the TDD floor for group 2 — RED on HEAD (the tables do not exist yet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'path';
import { StructuredStore } from '../../engine/memory/structuredStore.js';
import { createTempDir, cleanupDir } from './helpers.test-utils.mjs';

function makeStore() {
    const dataDir = createTempDir('od-spatial-');
    const store = new StructuredStore(dataDir);
    store.initAdventure('adv1');
    return { store, dataDir };
}

const columns = (store, table) =>
    new Set(store.db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));

// Creates a pre-8.1 memory.db exactly as it existed before the nullable-direction
// fix: `exits.direction TEXT NOT NULL`, plus one pre-existing edge row. Mirrors
// the legacy-schema setup in migration.test.mjs — the store's _initSchema must
// rebuild this table so directionless walks work (8.6).
function createStaleExitsStore(dataDir) {
    const db = new Database(path.join(dataDir, 'memory.db'));
    db.exec(`
        CREATE TABLE exits (
            id              TEXT PRIMARY KEY,
            adventure_id    TEXT NOT NULL,
            from_room       TEXT NOT NULL,
            direction       TEXT NOT NULL,
            to_room         TEXT NOT NULL,
            kind            TEXT DEFAULT 'walk',
            inferred        INTEGER DEFAULT 0,
            discovered_turn INTEGER,
            UNIQUE(adventure_id, from_room, direction)
        );
        INSERT INTO exits (id, adventure_id, from_room, direction, to_room, kind, inferred, discovered_turn)
        VALUES ('edge-1', 'adv1', 'room-a', 'north', 'room-b', 'walk', 0, 1);
    `);
    db.close();
}

const notnullOf = (store, table, column) =>
    store.db.prepare(`PRAGMA table_info(${table})`).all().find(c => c.name === column).notnull;

test('spatial: rooms/exits/room_visits tables are created on init', (t) => {
    const { store, dataDir } = makeStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));

    for (const table of ['rooms', 'exits', 'room_visits']) {
        assert.ok(columns(store, table).size > 0, `${table} table exists`);
    }
    // D1 column contract
    const roomCols = columns(store, 'rooms');
    for (const col of ['id', 'adventure_id', 'name', 'first_turn', 'last_visit_turn', 'visit_count']) {
        assert.ok(roomCols.has(col), `rooms.${col}`);
    }
    const exitCols = columns(store, 'exits');
    for (const col of ['from_room', 'direction', 'to_room', 'kind', 'inferred', 'discovered_turn']) {
        assert.ok(exitCols.has(col), `exits.${col}`);
    }
});

test('spatial: upsertRoom / getRoom / getRooms round-trip', (t) => {
    const { store, dataDir } = makeStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));

    const room = store.upsertRoom('adv1', 'room-a', 'Forest Edge', 'A quiet clearing.', 1);
    assert.equal(room.name, 'Forest Edge');

    const fetched = store.getRoom('adv1', 'room-a');
    assert.equal(fetched.name, 'Forest Edge');
    assert.equal(fetched.first_turn, 1);

    const rooms = store.getRooms('adv1');
    assert.equal(rooms.length, 1);
});

test('spatial: recordVisit bumps visit_count/last_visit_turn and writes a room_visits row', (t) => {
    const { store, dataDir } = makeStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));

    store.upsertRoom('adv1', 'room-a', 'Forest Edge', null, 1);
    store.recordVisit('adv1', 'room-a', 1);
    store.recordVisit('adv1', 'room-a', 2);

    const room = store.getRoom('adv1', 'room-a');
    assert.equal(room.visit_count, 2);
    assert.equal(room.last_visit_turn, 2);

    const visits = store.db.prepare(
        'SELECT * FROM room_visits WHERE adventure_id = ? ORDER BY turn'
    ).all('adv1');
    assert.equal(visits.length, 2);
    assert.equal(visits[0].turn, 1);
    assert.equal(visits[1].turn, 2);
});

test('spatial: recordEdge / getEdge / getExits / getEdges round-trip', (t) => {
    const { store, dataDir } = makeStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));

    store.upsertRoom('adv1', 'room-a', 'Forest Edge', null, 1);
    store.upsertRoom('adv1', 'room-b', 'North Clearing', null, 2);
    store.recordEdge('adv1', 'room-a', 'north', 'room-b', 'walk', 0, 2);
    store.recordEdge('adv1', 'room-b', 'south', 'room-a', 'walk', 1, 2);

    const edge = store.getEdge('adv1', 'room-a', 'north');
    assert.equal(edge.to_room, 'room-b');
    assert.equal(edge.kind, 'walk');
    assert.equal(edge.inferred, 0);

    const exits = store.getExits('adv1', 'room-a');
    assert.equal(exits.length, 1);
    assert.equal(exits[0].direction, 'north');

    const allEdges = store.getEdges('adv1');
    assert.equal(allEdges.length, 2);
});

test('spatial: UNIQUE(adventure_id, from_room, direction) enforces one edge per direction', (t) => {
    const { store, dataDir } = makeStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));

    store.upsertRoom('adv1', 'room-a', 'Forest Edge', null, 1);
    store.upsertRoom('adv1', 'room-b', 'North Clearing', null, 2);

    // A second raw insert with a DIFFERENT id but the same key must violate
    // the UNIQUE constraint — that is what makes re-traversal deterministic.
    store.recordEdge('adv1', 'room-a', 'north', 'room-b', 'walk', 0, 2);
    assert.throws(
        () => store.db.prepare(`
            INSERT INTO exits (id, adventure_id, from_room, direction, to_room, kind, inferred)
            VALUES ('other-id', 'adv1', 'room-a', 'north', 'room-x', 'walk', 0)
        `).run(),
        /UNIQUE|constraint/i,
        'a second edge on the same (adventure, from_room, direction) must be rejected'
    );
});

test('spatial: recordEdge with a NULL direction (directionless walk) succeeds against real SQLite (8.1)', (t) => {
    const { store, dataDir } = makeStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));

    store.upsertRoom('adv1', 'room-a', 'Forest Edge', null, 1);
    store.upsertRoom('adv1', 'room-b', 'Lower Depths', null, 2);

    // 8.1 regression: directionless one-way walks ("walk on", "slide down the
    // chute") call recordEdge(..., null, ...). This used to throw
    // `NOT NULL constraint failed: exits.direction` against the real DB; the
    // in-memory ctx mock in roomMap.test.mjs masked the constraint.
    store.recordEdge('adv1', 'room-a', null, 'room-b', 'walk', 0, 2);

    const edge = store.getEdge('adv1', 'room-a', null);
    assert.ok(edge, 'the null-direction edge is recorded');
    assert.equal(edge.to_room, 'room-b');
    assert.equal(edge.kind, 'walk');
    assert.equal(edge.inferred, 0);
    assert.equal(edge.direction, null);

    // SQLite treats NULLs as distinct in the UNIQUE index: several one-way
    // edges from the same room coexist.
    store.upsertRoom('adv1', 'room-c', 'Pit Floor', null, 3);
    store.recordEdge('adv1', 'room-a', null, 'room-c', 'walk', 0, 3);
    const nullEdges = store.db.prepare(
        'SELECT * FROM exits WHERE adventure_id = ? AND direction IS NULL'
    ).all('adv1');
    assert.equal(nullEdges.length, 2, 'multiple null-direction edges coexist');

    // Named-direction edges still enforce one-per-(from_room, direction).
    store.recordEdge('adv1', 'room-a', 'north', 'room-b', 'walk', 0, 4);
    assert.throws(
        () => store.db.prepare(`
            INSERT INTO exits (id, adventure_id, from_room, direction, to_room, kind, inferred)
            VALUES ('dup-north', 'adv1', 'room-a', 'north', 'room-x', 'walk', 0)
        `).run(),
        /UNIQUE|constraint/i,
        'named-direction edges keep the UNIQUE constraint'
    );

    // retractEdge with a NULL direction removes exactly the null-direction rows.
    store.retractEdge('adv1', 'room-a', null);
    assert.equal(store.getEdge('adv1', 'room-a', null), null, 'null-direction edges retract');
    assert.equal(store.getEdge('adv1', 'room-a', 'north').to_room, 'room-b', 'named edges survive');
});

test('spatial: getInferredEdges returns only inferred edges', (t) => {
    const { store, dataDir } = makeStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));

    store.upsertRoom('adv1', 'room-a', 'Forest Edge', null, 1);
    store.upsertRoom('adv1', 'room-b', 'North Clearing', null, 2);
    store.recordEdge('adv1', 'room-a', 'north', 'room-b', 'walk', 0, 2);
    store.recordEdge('adv1', 'room-b', 'south', 'room-a', 'walk', 1, 2);

    const inferred = store.getInferredEdges('adv1');
    assert.equal(inferred.length, 1);
    assert.equal(inferred[0].inferred, 1);
});

test('spatial: room-name lookup resolves via canonical matching', (t) => {
    const { store, dataDir } = makeStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));

    store.upsertRoom('adv1', 'room-a', 'Northern Caves', null, 1);

    const byExact = store.findRoomByName('adv1', 'northern caves');
    assert.equal(byExact.id, 'room-a');
    const byStem = store.findRoomByName('adv1', 'Northern Cave');
    assert.equal(byStem.id, 'room-a', 'stem variants resolve to the same room');
    assert.equal(store.findRoomByName('adv1', 'The Spire'), null);
});

test('spatial: rollbackTurn removes rooms/exits/visits at turns >= N', (t) => {
    const { store, dataDir } = makeStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));

    // Turn 1: room-a discovered, room-b discovered, edge a→b.
    store.upsertRoom('adv1', 'room-a', 'Forest Edge', null, 1);
    store.upsertRoom('adv1', 'room-b', 'North Clearing', null, 1);
    store.recordVisit('adv1', 'room-a', 1);
    store.recordEdge('adv1', 'room-a', 'north', 'room-b', 'walk', 0, 1);

    // Turn 2: room-c discovered, edge b→c + inferred c→b.
    store.upsertRoom('adv1', 'room-c', 'Sunlit Grove', null, 2);
    store.recordVisit('adv1', 'room-b', 2);
    store.recordEdge('adv1', 'room-b', 'east', 'room-c', 'walk', 0, 2);
    store.recordEdge('adv1', 'room-c', 'west', 'room-b', 'walk', 1, 2);

    store.rollbackTurn('adv1', 2);

    assert.equal(store.getRoom('adv1', 'room-c'), null, 'room discovered on turn 2 is removed');
    assert.ok(store.getRoom('adv1', 'room-a'), 'room-a survives');
    assert.ok(store.getRoom('adv1', 'room-b'), 'room-b survives');
    assert.equal(store.getEdge('adv1', 'room-b', 'east'), null, 'edge discovered turn 2 removed');
    assert.equal(store.getEdge('adv1', 'room-c', 'west'), null, 'inferred edge discovered turn 2 removed');
    assert.ok(store.getEdge('adv1', 'room-a', 'north'), 'edge from turn 1 survives');
    const visits = store.db.prepare(
        'SELECT * FROM room_visits WHERE adventure_id = ?'
    ).all('adv1');
    assert.equal(visits.length, 1, 'only the turn-1 visit survives');
    assert.equal(visits[0].turn, 1);
});

test('spatial: rollbackTurn preserves hand-created rows (NULL discovered_turn, first_turn 0)', (t) => {
    const { store, dataDir } = makeStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));

    // Hand-created (no narration turn): room with first_turn 0, edge with NULL
    // discovered_turn, visit at turn 0.
    store.upsertRoom('adv1', 'room-hand', 'Starting Room', null, 0);
    store.upsertRoom('adv1', 'room-narr', 'Narrated Room', null, 3);
    store.recordVisit('adv1', 'room-hand', 0);
    store.recordEdge('adv1', 'room-hand', 'north', 'room-narr', 'walk', 0, null);
    store.recordVisit('adv1', 'room-narr', 3);

    store.rollbackTurn('adv1', 2);

    assert.ok(store.getRoom('adv1', 'room-hand'), 'hand-created room (first_turn 0) survives');
    assert.equal(store.getRoom('adv1', 'room-narr'), null, 'narration room at turn 3 is removed');
    assert.ok(store.getEdge('adv1', 'room-hand', 'north'), 'hand-created edge (NULL discovered_turn) survives');
    const visits = store.db.prepare(
        'SELECT * FROM room_visits WHERE adventure_id = ?'
    ).all('adv1');
    assert.equal(visits.length, 1, 'turn-0 visit survives; turn-3 visit removed');
    assert.equal(visits[0].turn, 0);
});

test('spatial: getIncomingExits and getLastVisit support room inspection', (t) => {
    const { store, dataDir } = makeStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));

    store.upsertRoom('adv1', 'room-a', 'Forest Edge', null, 1);
    store.upsertRoom('adv1', 'room-b', 'North Clearing', null, 1);
    store.recordEdge('adv1', 'room-a', 'north', 'room-b', 'walk', 0, 1);
    store.recordEdge('adv1', 'room-b', 'south', 'room-a', 'walk', 1, 1);
    store.recordVisit('adv1', 'room-b', 1);
    store.recordVisit('adv1', 'room-b', 2);

    const incoming = store.getIncomingExits('adv1', 'room-b');
    assert.equal(incoming.length, 1);
    assert.equal(incoming[0].from_room, 'room-a');

    const lastVisit = store.getLastVisit('adv1', 'room-b');
    assert.equal(lastVisit.turn, 2);
});

test('spatial: guarded migration rebuilds a stale exits.direction NOT NULL into nullable (8.6)', (t) => {
    const dataDir = createTempDir('od-spatial-');
    t.after(() => cleanupDir(dataDir));
    createStaleExitsStore(dataDir);

    // Constructing the store runs _initSchema, which must detect the NOT NULL
    // direction column and rebuild the table as nullable.
    const store = new StructuredStore(dataDir);
    t.after(() => store.close());

    // (a) PRAGMA now shows direction nullable.
    assert.equal(notnullOf(store, 'exits', 'direction'), 0,
        'exits.direction rebuilt as nullable');

    // (b) The pre-existing row survived the rebuild with its data intact.
    const row = store.db.prepare('SELECT * FROM exits WHERE id = ?').get('edge-1');
    assert.ok(row, 'pre-existing edge row survived the rebuild');
    assert.equal(row.adventure_id, 'adv1');
    assert.equal(row.from_room, 'room-a');
    assert.equal(row.direction, 'north');
    assert.equal(row.to_room, 'room-b');

    // (c) recordEdge(..., null, ...) now succeeds against the migrated table.
    store.upsertRoom('adv1', 'room-a', 'Forest Edge', null, 1);
    store.upsertRoom('adv1', 'room-b', 'Lower Depths', null, 2);
    store.recordEdge('adv1', 'room-a', null, 'room-b', 'walk', 0, 2);
    const edge = store.getEdge('adv1', 'room-a', null);
    assert.ok(edge, 'null-direction edge records after the migration');
    assert.equal(edge.to_room, 'room-b');

    // The rebuilt table keeps the UNIQUE(adventure_id, from_room, direction)
    // constraint for named-direction edges.
    assert.throws(
        () => store.db.prepare(`
            INSERT INTO exits (id, adventure_id, from_room, direction, to_room, kind, inferred)
            VALUES ('dup-north', 'adv1', 'room-a', 'north', 'room-x', 'walk', 0)
        `).run(),
        /UNIQUE|constraint/i,
        'named-direction edges keep the UNIQUE constraint on the rebuilt table'
    );

    // Idempotent: re-construction no-ops and keeps every row (including the
    // null-direction edge written above).
    const store2 = new StructuredStore(dataDir);
    t.after(() => store2.close());
    assert.equal(notnullOf(store2, 'exits', 'direction'), 0,
        're-construction does not re-migrate (idempotent)');
    assert.ok(store2.db.prepare('SELECT * FROM exits WHERE id = ?').get('edge-1'),
        'legacy row survives re-construction');
    const nullEdge = store2.getEdge('adv1', 'room-a', null);
    assert.ok(nullEdge && nullEdge.to_room === 'room-b',
        'null-direction edge survives re-construction');
});
