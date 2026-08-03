// StructuredStore guarded-migration unit tests (memory-schema-boundary, #27).
//
// The turn_index column on lore/barter_offers/quest_goals is the rollback
// surface for full-surface rollback. Existing DBs (created before #27) have
// those tables WITHOUT the column, so _initSchema must guard the migration:
// PRAGMA table_info → ALTER TABLE ADD COLUMN only when the column is missing.
//
// This is the TDD floor for the migration behavior (not part of the committed
// seam): RED on HEAD (no migration exists), GREEN once _initSchema migrates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'path';
import { StructuredStore } from '../../engine/memory/structuredStore.js';
import { createTempDir, cleanupDir } from './helpers.test-utils.mjs';

// Creates a legacy-schema memory.db exactly as it existed before #27: the
// three rollback-surface tables carry no turn_index column.
function createLegacyStore(dataDir) {
    const db = new Database(path.join(dataDir, 'memory.db'));
    db.exec(`
        CREATE TABLE IF NOT EXISTS events (
            id          TEXT PRIMARY KEY,
            adventure_id TEXT NOT NULL,
            turn_index  INTEGER,
            event_type  TEXT NOT NULL,
            summary     TEXT NOT NULL,
            entities    TEXT,
            location    TEXT,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS inventory (
            id              TEXT PRIMARY KEY,
            adventure_id    TEXT NOT NULL,
            item_name       TEXT NOT NULL,
            item_type       TEXT,
            description     TEXT,
            quantity        INTEGER DEFAULT 1,
            acquired_at     TEXT,
            acquired_turn   INTEGER,
            status          TEXT DEFAULT 'held'
        );
        CREATE TABLE IF NOT EXISTS lore (
            id              TEXT PRIMARY KEY,
            adventure_id    TEXT NOT NULL,
            name            TEXT NOT NULL,
            type            TEXT NOT NULL,
            description     TEXT,
            trigger_words   TEXT,
            enabled         INTEGER DEFAULT 1,
            source          TEXT DEFAULT 'auto'
        );
        CREATE TABLE IF NOT EXISTS barter_offers (
            id              TEXT PRIMARY KEY,
            adventure_id    TEXT NOT NULL,
            trader_name     TEXT NOT NULL,
            required_item   TEXT NOT NULL,
            offered_item    TEXT NOT NULL,
            description     TEXT
        );
        CREATE TABLE IF NOT EXISTS quest_goals (
            id              TEXT PRIMARY KEY,
            adventure_id    TEXT NOT NULL,
            npc_name        TEXT NOT NULL,
            goal_title      TEXT NOT NULL,
            required_item   TEXT NOT NULL,
            reward_item     TEXT NOT NULL,
            status          TEXT DEFAULT 'NOT_STARTED',
            created_turn    INTEGER,
            completed_turn  INTEGER
        );
    `);
    db.close();
}

const columns = (store, table) =>
    new Set(store.db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));

test('guarded migration: turn_index added to legacy lore/offers/goals tables (RED on HEAD)', (t) => {
    const dataDir = createTempDir('od-migrate-');
    t.after(() => cleanupDir(dataDir));
    createLegacyStore(dataDir);

    const store = new StructuredStore(dataDir);
    t.after(() => store.close());

    assert.ok(columns(store, 'lore').has('turn_index'), 'legacy lore gained turn_index');
    assert.ok(columns(store, 'barter_offers').has('turn_index'), 'legacy barter_offers gained turn_index');
    assert.ok(columns(store, 'quest_goals').has('turn_index'), 'legacy quest_goals gained turn_index');
});

test('guarded migration is idempotent and preserves legacy rows', (t) => {
    const dataDir = createTempDir('od-migrate-');
    t.after(() => cleanupDir(dataDir));
    createLegacyStore(dataDir);

    const store = new StructuredStore(dataDir);
    t.after(() => store.close());
    store.db.prepare(
        "INSERT INTO barter_offers (id, adventure_id, trader_name, required_item, offered_item, description) VALUES ('legacy-offer', 'adv1', 'Korr', 'Leaflet', 'Gem', NULL)"
    ).run();

    // Second construction re-runs the guarded migration without error and the
    // legacy row (turn_index NULL) survives.
    const store2 = new StructuredStore(dataDir);
    store2.close();
    const row = store.db.prepare('SELECT * FROM barter_offers WHERE id = ?').get('legacy-offer');
    assert.ok(row, 'legacy offer row survived the migration');
    assert.equal(row.turn_index, null, 'legacy rows stay NULL turn_index');
});
