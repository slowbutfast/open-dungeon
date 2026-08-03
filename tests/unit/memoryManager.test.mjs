// MemoryManager unit tests (architecture-deepening-sequence, task 1.3).
//
// READ-THROUGH FRESHNESS (INTENDED TO FAIL TODAY — the #26 contract):
// a read through the manager's read path (`getEventLog`, `getInventory`,
// `getStats`) must reflect every buffered turn WITHOUT a caller-owned
// `flushIfReady` call. Today reads are pass-throughs to the store, so a
// buffered-but-unflushed turn is invisible — these assertions are red by
// design. They are the TDD floor for #26 (memory freshness).
//
// Flush dedup (already implemented) is pinned as a regression guard: while a
// flush is in flight, a second `flushIfReady` reuses the same active promise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryManager, cleanupDir } from './helpers.test-utils.mjs';

const KNOWN_EXTRACTION = {
    events: [{ type: 'discovery', summary: 'Found a gem.', entities: ['gem'], location: 'Cave' }],
    inventory_changes: [{ action: 'acquire', item_name: 'Silver Ring', item_type: 'misc', quantity: 1 }],
    lore_facts: [{ name: 'Cave Keeper', type: 'character', description: 'Guards the cave.', trigger_words: ['keeper', 'cave'] }],
    offers: [],
    goals: []
};

test('READ-THROUGH: getEventLog reflects a buffered turn without a caller flush (INTENDED TO FAIL TODAY)', async (t) => {
    const { mm, dataDir } = createMemoryManager();
    t.after(() => mm.structuredStore.close());
    t.after(() => cleanupDir(dataDir));
    await mm.initialize('adv1');
    mm.eventExtractor.extractEvents = async () => KNOWN_EXTRACTION;

    mm.bufferTurnPair({ turnIndex: 1, player: 'take the ring', dm: 'You take it.' });

    // No flushIfReady call. #26: the read path flushes internally so the
    // buffered turn's event is already visible.
    const events = await mm.getEventLog('adv1');
    assert.equal(events.length, 1, 'buffered turn must be visible to getEventLog');
    assert.equal(events[0].summary, 'Found a gem.');
});

test('READ-THROUGH: getInventory reflects a buffered turn without a caller flush (INTENDED TO FAIL TODAY)', async (t) => {
    const { mm, dataDir } = createMemoryManager();
    t.after(() => mm.structuredStore.close());
    t.after(() => cleanupDir(dataDir));
    await mm.initialize('adv1');
    mm.eventExtractor.extractEvents = async () => KNOWN_EXTRACTION;

    mm.bufferTurnPair({ turnIndex: 1, player: 'take the ring', dm: 'You take it.' });

    const inventory = await mm.getInventory('adv1');
    assert.equal(inventory.length, 1, 'buffered turn must be visible to getInventory');
    assert.equal(inventory[0].item_name, 'Silver Ring');
});

test('READ-THROUGH: getStats reflects a buffered turn without a caller flush (INTENDED TO FAIL TODAY)', async (t) => {
    const { mm, dataDir } = createMemoryManager();
    t.after(() => mm.structuredStore.close());
    t.after(() => cleanupDir(dataDir));
    await mm.initialize('adv1');
    mm.eventExtractor.extractEvents = async () => KNOWN_EXTRACTION;

    mm.bufferTurnPair({ turnIndex: 1, player: 'take the ring', dm: 'You take it.' });

    const stats = await mm.getStats('adv1');
    assert.equal(stats.events, 1, 'buffered turn must be visible to getStats.events');
    assert.equal(stats.inventory, 1, 'buffered turn must be visible to getStats.inventory');
    assert.equal(stats.lore, 1, 'buffered turn must be visible to getStats.lore');
});

test('flushIfReady dedups: a second call while in flight reuses the active promise', async (t) => {
    const { mm, dataDir } = createMemoryManager();
    t.after(() => mm.structuredStore.close());
    t.after(() => cleanupDir(dataDir));
    await mm.initialize('adv1');

    let resolveExtract;
    let extractCalls = 0;
    mm.eventExtractor.extractEvents = () => {
        extractCalls += 1;
        return new Promise((resolve) => { resolveExtract = resolve; });
    };

    mm.bufferTurnPair({ turnIndex: 1, player: 'a', dm: 'b' });
    mm.bufferTurnPair({ turnIndex: 2, player: 'c', dm: 'd' });
    mm.bufferTurnPair({ turnIndex: 3, player: 'e', dm: 'f' });

    const state = { adventureId: 'adv1', cards: [] };
    const p1 = mm.flushIfReady(state, 'mock', async () => {});
    const activeBeforeSecondCall = mm.activeFlushPromise;
    const p2 = mm.flushIfReady(state, 'mock', async () => {});

    // The second call must not start a second extraction, and it must not
    // replace the in-flight promise — both callers share one flush.
    assert.equal(extractCalls, 1, 'second flush must not start a second extraction');
    assert.equal(mm.activeFlushPromise, activeBeforeSecondCall,
        'second flush reuses the in-flight promise rather than replacing it');

    resolveExtract({ events: [], inventory_changes: [], lore_facts: [], offers: [], goals: [] });
    await p1;
    await p2;
    assert.equal(extractCalls, 1, 'both callers settle on the single shared flush');
});
