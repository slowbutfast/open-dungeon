// BarterEngine unit tests (architecture-deepening-sequence, task 1.5).
//
// Two contracts:
//
//  1. ONE MATCHING REGIME — "do I hold this item?" must resolve through the
//     same canonical `itemNamesMatch` path everywhere. `completeGoal` with a
//     goal whose `required_item` is spelled "the Gem" must succeed against a
//     held item stored as "Gem". Today the store's `hasItem`/`executeTrade`
//     already use canonical matching (validate-memory-extraction landed), so
//     this test may already pass — it pins the single-regime contract.
//
//  2. SINGLE INSTANCE (INTENDED TO FAIL TODAY — the #27/#29 contract):
//     constructing an AdventureEngine must construct exactly ONE BarterEngine.
//     Today both `MemoryManager` (memoryManager.js:19) and `AdventureEngine`
//     (engine/index.js:69) construct one; the engine's instance then
//     overwrites `memory.barter`, orphaning the memory's own. The `_initSchema`
//     spy counts constructions — red today, green once the double construction
//     is collapsed (#27 5.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { BarterEngine } from '../../engine/memory/barterEngine.js';
import { createStructuredStore, createTempDir, cleanupDir } from './helpers.test-utils.mjs';

// ─── one matching regime ───────────────────────────────────────────────────

test('completeGoal: a goal spelling "the Gem" completes against a held item stored as "Gem"', (t) => {
    const { store, dataDir } = createStructuredStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));
    store.initAdventure('adv1');
    store.upsertInventoryItem('adv1', { item_name: 'Gem', item_type: 'misc', quantity: 1, status: 'held' });

    const barter = new BarterEngine(store);
    const goal = barter.createGoal('adv1', 'Korr', 'Bring the gem', 'the Gem', 'Gold Coin');

    const completed = barter.completeGoal('adv1', goal.id);

    assert.equal(completed.status, 'COMPLETED');
    assert.equal(store.hasItem('adv1', 'the gem'), null, 'the Gem is consumed on completion');
    assert.ok(store.hasItem('adv1', 'Gold Coin'), 'the reward item is granted');
});

test('completeGoal: a stem-differing spelling resolves to the held row (single regime)', (t) => {
    const { store, dataDir } = createStructuredStore();
    t.after(() => store.close());
    t.after(() => cleanupDir(dataDir));
    store.initAdventure('adv1');
    store.upsertInventoryItem('adv1', { item_name: 'Rusty Gear', item_type: 'misc', quantity: 1, status: 'held' });

    const barter = new BarterEngine(store);
    const goal = barter.createGoal('adv1', 'Mech', 'Deliver the gear', 'Rusted Gear', 'Oil Flask');

    const completed = barter.completeGoal('adv1', goal.id);

    assert.equal(completed.status, 'COMPLETED');
    assert.equal(store.hasItem('adv1', 'Rusted Gear'), null, 'Rusted Gear is consumed on completion');
    assert.ok(store.hasItem('adv1', 'Oil Flask'), 'the reward item is granted');
});

// ─── single instance ───────────────────────────────────────────────────────

// Constructing an AdventureEngine must not build two BarterEngine instances.
// Both construction sites call `_initSchema()` from the constructor, so a spy
// on the shared prototype counts constructions. Requires MOCK_LLM=1 so the
// engine builds a MockOpenAI client (no real backend, no network).
test('SINGLE INSTANCE: constructing an AdventureEngine builds exactly ONE BarterEngine (INTENDED TO FAIL TODAY)', async (t) => {
    process.env.MOCK_LLM = '1';

    const { AdventureEngine } = await import('../../engine/index.js');

    const tempRoot = createTempDir('od-engine-');
    const saveDir = path.join(tempRoot, 'saves');
    t.after(() => cleanupDir(tempRoot));

    const realInitSchema = BarterEngine.prototype._initSchema;
    let constructions = 0;
    BarterEngine.prototype._initSchema = function (...args) {
        constructions += 1;
        return realInitSchema.apply(this, args);
    };

    try {
        const engine = new AdventureEngine(saveDir);
        assert.equal(constructions, 1,
            `expected exactly one BarterEngine; got ${constructions} (MemoryManager + AdventureEngine each construct one today)`);

        // The one instance is shared: memory.barter is the same object the
        // engine exposes, over the memory's structured store.
        assert.equal(engine.memory.barter, engine.barter);
        assert.equal(engine.barter.store, engine.memory.structuredStore);
    } finally {
        BarterEngine.prototype._initSchema = realInitSchema;
    }
});
