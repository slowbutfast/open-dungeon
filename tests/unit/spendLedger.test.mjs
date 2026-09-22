// Spend ledger, in-flight locking, and token pricing unit tests
// (vercel-deployment-and-auth, task 1.4).
//
// The KV transport is exercised through its in-memory fallback
// (`new KvStore()`), so no Upstash credentials or network are required.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

import {
    KvStore,
    SpendLedger,
    createKvStore,
    acquireLock,
    releaseLock,
    lockKey,
    userSpendKey,
    GLOBAL_SPEND_KEY,
    USER_SPEND_LIMIT_USD,
    GLOBAL_SPEND_LIMIT_USD
} from '../../web/kvStore.js';

import {
    computeCost,
    computeTurnCost,
    getModelPricing,
    FALLBACK_PRICING,
    llmTracker
} from '../../engine/llmTracker.js';

// ─── ledger ────────────────────────────────────────────────────────────────

test('recordSpend atomically increments the per-sub hash and returns the total', async () => {
    const ledger = new SpendLedger(new KvStore());
    assert.equal(await ledger.getSpend('u_1'), 0);

    const a = await ledger.recordSpend('u_1', 0.25);
    const b = await ledger.recordSpend('u_1', 0.5);
    assert.equal(a, 0.25);
    assert.equal(b, 0.75);
    assert.equal(await ledger.getSpend('u_1'), 0.75);

    // Distinct subs never share a balance.
    assert.equal(await ledger.getSpend('u_2'), 0);
});

test('recordSpend also accumulates the global project counter', async () => {
    const ledger = new SpendLedger(new KvStore());
    await ledger.recordSpend('u_1', 1.0);
    await ledger.recordSpend('u_2', 2.0);
    assert.equal(await ledger.getGlobalSpend(), 3.0);
});

test('per-user quota caps at $2.50 and remaining never goes negative', async () => {
    const ledger = new SpendLedger(new KvStore());
    await ledger.recordSpend('u_1', 2.4);
    assert.equal(await ledger.canSpend('u_1'), true);

    await ledger.recordSpend('u_1', 0.2); // a turn can overshoot the pre-check
    assert.equal(await ledger.getSpend('u_1'), 2.6);
    assert.equal(await ledger.canSpend('u_1'), false);
    assert.equal(await ledger.getRemaining('u_1'), 0);
    assert.equal(ledger.userLimit, USER_SPEND_LIMIT_USD);
});

test('global kill-switch trips at $50 across all users', async () => {
    const ledger = new SpendLedger(new KvStore());
    await ledger.recordSpend('u_1', 25);
    assert.equal(await ledger.isGlobalExceeded(), false);
    await ledger.recordSpend('u_2', 25);
    assert.equal(await ledger.getGlobalSpend(), GLOBAL_SPEND_LIMIT_USD);
    assert.equal(await ledger.isGlobalExceeded(), true);
    assert.equal(await ledger.canSpend('u_3'), false, 'a fresh user is blocked by the global cap');
});

// ─── in-flight lock ────────────────────────────────────────────────────────

test('acquireLock is atomic (SET NX): the second acquire for the same user fails', async () => {
    const kv = new KvStore();
    const key = lockKey('u_1');
    assert.equal(await acquireLock(kv, key, 30), true);
    assert.equal(await acquireLock(kv, key, 30), false, 'overlapping turn must be rejected');
    await releaseLock(kv, key);
    assert.equal(await acquireLock(kv, key, 30), true, 'lock is reusable after release');
});

test('in-memory lock honors its TTL', async () => {
    const kv = new KvStore({ now: () => Date.now() });
    const key = lockKey('u_ttl');
    assert.equal(await acquireLock(kv, key, 0.01), true);
    await new Promise(r => setTimeout(r, 30));
    assert.equal(await acquireLock(kv, key, 30), true, 'expired lock must be re-acquirable');
});

test('createKvStore falls back to in-memory without credentials', () => {
    const kv = createKvStore({});
    assert.equal(kv.isMemory, true);
    const configured = createKvStore({ KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'tok' });
    assert.equal(configured.isMemory, false);
});

// ─── pricing ───────────────────────────────────────────────────────────────

test('computeCost prices listed models from the catalog', () => {
    const p = getModelPricing('deepseek/deepseek-v4-flash');
    assert.equal(p.prompt, 0.40);
    assert.equal(p.completion, 1.10);

    const cost = computeCost({
        model: 'deepseek/deepseek-v4-flash',
        promptTokens: 1_000_000,
        completionTokens: 1_000_000
    });
    assert.ok(Math.abs(cost - 1.50) < 1e-9, `expected 1.50, got ${cost}`);
});

test('computeTurnCost sums narration + extraction operations', () => {
    const model = 'deepseek/deepseek-v4-flash';
    const total = computeTurnCost([
        { kind: 'narration', model, promptTokens: 1200, completionTokens: 350 },
        { kind: 'extraction', model, promptTokens: 800, completionTokens: 150 }
    ]);
    const expected =
        (1200 / 1e6) * 0.40 + (350 / 1e6) * 1.10 +
        (800 / 1e6) * 0.40 + (150 / 1e6) * 1.10;
    assert.ok(Math.abs(total - expected) < 1e-12, `got ${total}`);
    assert.ok(total > 0);
});

test('unknown models fall back to the conservative rate', () => {
    const p = getModelPricing('some/unlisted-model');
    assert.deepEqual(p, FALLBACK_PRICING);
    const cost = computeCost({ model: 'some/unlisted-model', promptTokens: 1000, completionTokens: 0 });
    assert.ok(Math.abs(cost - 0.002) < 1e-12, `expected 0.002, got ${cost}`);
});

test('llmTracker accumulates turn operations and reports the aggregated cost', () => {
    llmTracker.clear();
    llmTracker.beginTurn();
    llmTracker.recordTurnOperation({
        kind: 'narration', model: 'deepseek/deepseek-v4-flash',
        promptTokens: 1200, completionTokens: 350
    });
    llmTracker.recordTurnOperation({
        kind: 'extraction', model: 'deepseek/deepseek-v4-flash',
        promptTokens: 800, completionTokens: 150
    });

    const turn = llmTracker.getTurnCost();
    assert.equal(turn.operations.length, 2);
    assert.ok(turn.estimated_cost_usd > 0);

    const ended = llmTracker.endTurn();
    assert.equal(ended.estimated_cost_usd, turn.estimated_cost_usd);
    // After endTurn the turn is closed; a fresh turn starts empty.
    assert.equal(llmTracker.getTurnCost().operations.length, 0);
});

test('concurrent turns from different users do not cross-attribute spend', async () => {
    // Two request contexts (as on a warm serverless instance) must each own
    // their turn even though their LLM calls interleave.
    const requestContext = new AsyncLocalStorage();
    llmTracker.clear();

    const model = 'deepseek/deepseek-v4-flash';
    const opA = { kind: 'narration', model, promptTokens: 1000, completionTokens: 100 };
    const opB = { kind: 'extraction', model, promptTokens: 500, completionTokens: 50 };

    async function runTurn(key, op, firstDelay, secondDelay) {
        return requestContext.run({}, async () => {
            llmTracker.beginTurn(key);
            await new Promise(r => setTimeout(r, firstDelay));
            llmTracker.recordTurnOperation(op);
            await new Promise(r => setTimeout(r, secondDelay));
            return llmTracker.endTurn();
        });
    }

    const [turnA, turnB] = await Promise.all([
        runTurn('u_A', opA, 20, 20),
        runTurn('u_B', opB, 5, 30)
    ]);

    assert.equal(turnA.key, 'u_A');
    assert.equal(turnA.operations.length, 1, 'A must not capture B\'s operations');
    assert.equal(turnA.operations[0].kind, 'narration');
    assert.equal(turnB.key, 'u_B');
    assert.equal(turnB.operations.length, 1, 'B must not capture A\'s operations');
    assert.equal(turnB.operations[0].kind, 'extraction');
});

test('recordUsage feeds the active turn with the call kind and model', () => {
    llmTracker.clear();
    llmTracker.beginTurn();
    const id = llmTracker.startCall('narration', 'prompt', 'deepseek/deepseek-v4-flash');
    llmTracker.recordUsage(id, { prompt_tokens: 1000, completion_tokens: 500 });

    const turn = llmTracker.getTurnCost();
    assert.equal(turn.operations.length, 1);
    assert.equal(turn.operations[0].kind, 'narration');
    assert.equal(turn.operations[0].model, 'deepseek/deepseek-v4-flash');
    llmTracker.endTurn();
});
