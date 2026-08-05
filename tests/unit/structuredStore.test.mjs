// StructuredStore unit tests (architecture-deepening-sequence, task 1.2).
//
// Two surfaces:
//
//  1. Canonical matching — `hasItem`/`executeTrade` resolve drifted spellings
//     to the held row via engine/memory/itemNames.js. These already pass today
//     (canonicalization landed in validate-memory-extraction); they pin the
//     contract so later refactors cannot silently regress it.
//
//  2. FULL-SURFACE ROLLBACK (INTENDED TO FAIL TODAY — the #27 contract).
//     `rollbackTurn` must remove the full turn surface: events, inventory,
//     lore, barter_offers, and quest_goals. Today it only deletes events and
//     inventory, so the lore/offers/goals assertions below are red. They are
//     the TDD floor for #27 (schema boundary + full-surface rollback).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StructuredStore } from '../../engine/memory/structuredStore.js';
import { BarterEngine } from '../../engine/memory/barterEngine.js';
import { createTempDir, cleanupDir } from './helpers.test-utils.mjs';

// ─── canonical matching ────────────────────────────────────────────────────

test('hasItem resolves a stem-differing spelling to the held row', (t) => {
    const dataDir = createTempDir('od-canonical-');
    t.after(() => cleanupDir(dataDir));
    const store = new StructuredStore(dataDir);
    store.initAdventure('adv1');
    store.upsertInventoryItem('adv1', { item_name: 'Rusty Gear', item_type: 'misc', quantity: 1, status: 'held' });

    const found = store.hasItem('adv1', 'Rusted Gear');
    assert.ok(found, 'Rusted Gear should resolve to the held Rusty Gear row');
    assert.equal(found.item_name, 'Rusty Gear');
});

test('hasItem resolves a plain spelling to a legacy quantity-encoded row', (t) => {
    const dataDir = createTempDir('od-canonical-');
    t.after(() => cleanupDir(dataDir));
    const store = new StructuredStore(dataDir);
    store.initAdventure('adv1');
    // Legacy row written before quantity parsing: the count lives in the name.
    store.db.prepare(
        "INSERT INTO inventory (id, adventure_id, item_name, item_type, quantity, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).run('adv1:2_coppers_legacy', 'adv1', '2 Coppers', 'misc', 1, 'held');

    const found = store.hasItem('adv1', 'Coppers');
    assert.ok(found, 'Coppers should resolve to the legacy 2 Coppers row');
    assert.equal(found.item_name, '2 Coppers');
    assert.equal(found.quantity, 1);
});

test('executeTrade resolves a canonical spelling against a variant held row', (t) => {
    const dataDir = createTempDir('od-canonical-');
    t.after(() => cleanupDir(dataDir));
    const store = new StructuredStore(dataDir);
    store.initAdventure('adv1');
    store.upsertInventoryItem('adv1', { item_name: 'Gem', item_type: 'misc', quantity: 1, status: 'held' });

    store.executeTrade('adv1', 'the gem', 'Gold Coin', 'A coin.', 'misc');

    assert.equal(store.hasItem('adv1', 'the gem'), null, 'the gem is consumed');
    assert.ok(store.hasItem('adv1', 'Gold Coin'), 'Gold Coin is granted');
});

// ─── full-surface rollback (the #27 contract) ──────────────────────────────

// Seeds one row on every rollback surface (events, inventory, lore, offers,
// goals) at turn 1, so `rollbackTurn('adv1', 1)` must empty all five tables.
function seedRollbackAdventure(dataDir) {
    const store = new StructuredStore(dataDir);
    store.initAdventure('adv1');

    store.insertEvent('adv1', 'evt-turn-1', 1, 'discovery', 'Found a gem.', ['gem'], 'Cave');

    store.upsertInventoryItem('adv1', {
        item_name: 'Silver Ring',
        item_type: 'misc',
        description: 'A silver ring.',
        quantity: 1,
        acquired_at: 'Cave',
        acquired_turn: 1,
        status: 'held'
    });

    store.upsertLore('adv1', 'lore-turn-1', 'Cave Keeper', 'character', 'Guards the cave.', ['keeper', 'cave']);

    const barter = new BarterEngine(store);
    barter.registerOffer('adv1', 'Merchant Bob', 'Silver Ring', 'Gold Coin', 'A shiny coin.');
    barter.createGoal('adv1', 'Korr', 'Find the locket', 'Locket', 'Gem');

    return store;
}

const countRows = (store, table, adventureId) =>
    store.db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE adventure_id = ?`).get(adventureId).c;

test('rollbackTurn removes events for turns >= N (already implemented)', (t) => {
    const dataDir = createTempDir('od-rollback-');
    t.after(() => cleanupDir(dataDir));
    const store = seedRollbackAdventure(dataDir);

    store.rollbackTurn('adv1', 1);

    assert.equal(store.getEventCount('adv1'), 0);
});

test('rollbackTurn removes inventory acquired at turns >= N (already implemented)', (t) => {
    const dataDir = createTempDir('od-rollback-');
    t.after(() => cleanupDir(dataDir));
    const store = seedRollbackAdventure(dataDir);

    store.rollbackTurn('adv1', 1);

    assert.equal(store.getInventory('adv1').length, 0);
});

test('FULL-SURFACE ROLLBACK: rollbackTurn removes lore rows (INTENDED TO FAIL TODAY)', (t) => {
    const dataDir = createTempDir('od-rollback-');
    t.after(() => cleanupDir(dataDir));
    const store = seedRollbackAdventure(dataDir);

    store.rollbackTurn('adv1', 1);

    // #27: the rollback surface must cover lore, which today has no turn_index
    // and is never touched by rollbackTurn — this assertion is red by design.
    assert.equal(store.getLore('adv1').length, 0);
});

test('FULL-SURFACE ROLLBACK: rollbackTurn removes barter offers (INTENDED TO FAIL TODAY)', (t) => {
    const dataDir = createTempDir('od-rollback-');
    t.after(() => cleanupDir(dataDir));
    const store = seedRollbackAdventure(dataDir);

    store.rollbackTurn('adv1', 1);

    // #27: barter_offers must roll back with the turn. Today they are orphaned.
    assert.equal(countRows(store, 'barter_offers', 'adv1'), 0);
});

test('FULL-SURFACE ROLLBACK: rollbackTurn removes quest goals (INTENDED TO FAIL TODAY)', (t) => {
    const dataDir = createTempDir('od-rollback-');
    t.after(() => cleanupDir(dataDir));
    const store = seedRollbackAdventure(dataDir);

    store.rollbackTurn('adv1', 1);

    // #27: quest_goals must roll back with the turn. Today they are orphaned.
    assert.equal(countRows(store, 'quest_goals', 'adv1'), 0);
});

// ─── D5: status-mutation rollback (residual undo-after-trade, group 7) ─────
//
// `rollbackTurn` deletes inventory rows by `acquired_turn >= N` only, so two
// undo-after-trade cases fail. Both are pinned here; the tests are RED on HEAD
// and go green once `upsertInventoryItem` attributes status mutations to a
// `status_turn` column and `rollbackTurn` reverts them (spec D5).

test('D5: rollbackTurn restores a sold item to held and removes the acquired row (trade-undo limbo, INTENDED TO FAIL TODAY)', (t) => {
    const dataDir = createTempDir('od-d5-trade-');
    t.after(() => cleanupDir(dataDir));
    const store = new StructuredStore(dataDir);
    store.initAdventure('adv1');

    // Leaflet acquired on turn 1.
    store.upsertInventoryItem('adv1', {
        item_name: 'Leaflet', item_type: 'misc', quantity: 1,
        acquired_turn: 1, status: 'held'
    });

    // Trade turn 2: the extraction path flips the sold item to 'traded' and
    // acquires the received item.
    store.upsertInventoryItem('adv1', {
        item_name: 'Leaflet', item_type: 'misc', quantity: 1,
        acquired_turn: 2, status: 'traded'
    });
    store.upsertInventoryItem('adv1', {
        item_name: 'Gem', item_type: 'misc', quantity: 1,
        acquired_turn: 2, status: 'held'
    });

    store.rollbackTurn('adv1', 2);

    // The sold item must come back as held, not stay stranded in 'traded' limbo.
    const leaflet = store.hasItem('adv1', 'Leaflet');
    assert.ok(leaflet, 'the sold item must be held again after undo');
    assert.equal(leaflet.status, 'held', 'the sold item is not stranded as traded');
    // The acquired row must be gone.
    assert.equal(store.hasItem('adv1', 'Gem'), null, 'the acquired row must be removed');
});

test('D5: rollbackTurn removes a row re-acquired on the undone turn despite an older acquired_turn (#22, INTENDED TO FAIL TODAY)', (t) => {
    const dataDir = createTempDir('od-d5-reacquire-');
    t.after(() => cleanupDir(dataDir));
    const store = new StructuredStore(dataDir);
    store.initAdventure('adv1');

    // Leaflet acquired turn 1, then traded away turn 2 (status flip on the row).
    store.upsertInventoryItem('adv1', {
        item_name: 'Leaflet', item_type: 'misc', quantity: 1,
        acquired_turn: 1, status: 'held'
    });
    store.upsertInventoryItem('adv1', {
        item_name: 'Leaflet', item_type: 'misc', quantity: 1,
        acquired_turn: 2, status: 'traded'
    });

    // Re-acquired on turn 3: status flips back to 'held' but the conflict path
    // leaves the ORIGINAL acquired_turn (1) untouched.
    store.upsertInventoryItem('adv1', {
        item_name: 'Leaflet', item_type: 'misc', quantity: 1,
        acquired_turn: 3, status: 'held'
    });
    assert.ok(store.hasItem('adv1', 'Leaflet'), 'the leaflet is held after the re-acquire');

    store.rollbackTurn('adv1', 3);

    // The re-acquisition is rolled back even though the row predates turn 3.
    assert.equal(store.hasItem('adv1', 'Leaflet'), null, 'the re-acquired row must be removed');
});
