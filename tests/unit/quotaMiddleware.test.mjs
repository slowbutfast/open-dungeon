// Default-deny quota guard integration tests (vercel-deployment-and-auth,
// task 1.5).
//
// Boots the real Express application via `createApp` on an ephemeral port and
// drives it with `fetch`, so the middleware ordering under test is exactly the
// production wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';

import { createApp } from '../../web/server.js';
import { KvStore, SpendLedger, USER_SPEND_LIMIT_USD, GLOBAL_SPEND_LIMIT_USD } from '../../web/kvStore.js';
import { signSession, SESSION_COOKIE } from '../../web/auth/session.js';
import { SessionManager } from '../../engine/sessionManager.js';

const SECRET = 'quota-test-secret';

// Every cost-incurring endpoint from the spec.
const PROTECTED_POSTS = [
    '/api/init',
    '/api/action',
    '/api/summary',
    '/api/lore',
    '/api/scan',
    '/api/goals/complete'
];

function testConfig(overrides = {}) {
    return {
        isVercel: true,
        isProduction: true,
        sessionSecret: SECRET,
        vercelClientId: 'cid',
        vercelClientSecret: 'csecret',
        openrouterApiKey: 'key',
        llmBackend: 'openrouter',
        mockLlm: false,
        appUrl: null,
        kvUrl: null,
        kvToken: null,
        userSpendLimit: USER_SPEND_LIMIT_USD,
        globalSpendLimit: GLOBAL_SPEND_LIMIT_USD,
        ...overrides
    };
}

async function withServer(app, fn) {
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        return await fn(base);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

function sessionCookie(sub) {
    return `${SESSION_COOKIE}=${signSession({ sub, email: `${sub}@example.com`, name: sub }, SECRET)}`;
}

// A session manager whose engine factory never touches disk — the quota guard
// must reject before any engine work, so these routes should never reach it.
function inertSessionManager() {
    return new SessionManager({
        serverless: false,
        engineFactory: () => ({ state: { adventureId: null }, memory: { structuredStore: null } })
    });
}

test('default-deny: every cost-incurring route rejects unauthenticated requests with 401', async () => {
    const app = createApp({ config: testConfig(), ledger: new SpendLedger(new KvStore()), sessionManager: inertSessionManager() });
    await withServer(app, async (base) => {
        for (const path of PROTECTED_POSTS) {
            const res = await fetch(base + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
            assert.equal(res.status, 401, `${path} should require authentication`);
            const body = await res.json();
            assert.equal(body.error, 'Unauthorized');
        }
    });
});

test('quota exhaustion: protected routes reject an authenticated over-cap user with 402', async () => {
    const ledger = new SpendLedger(new KvStore());
    await ledger.recordSpend('u_over', USER_SPEND_LIMIT_USD);
    const app = createApp({ config: testConfig(), ledger, sessionManager: inertSessionManager() });

    await withServer(app, async (base) => {
        for (const path of PROTECTED_POSTS) {
            const res = await fetch(base + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: sessionCookie('u_over') },
                body: '{}'
            });
            assert.equal(res.status, 402, `${path} should reject an over-quota user`);
            const body = await res.json();
            assert.equal(body.error, 'Quota exceeded');
            assert.equal(body.limit, USER_SPEND_LIMIT_USD);
        }
    });
});

test('global kill-switch: protected routes halt with 503 once the project cap is reached', async () => {
    const ledger = new SpendLedger(new KvStore());
    await ledger.recordSpend('someone_else', GLOBAL_SPEND_LIMIT_USD);
    const app = createApp({ config: testConfig(), ledger, sessionManager: inertSessionManager() });

    await withServer(app, async (base) => {
        const res = await fetch(base + '/api/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: sessionCookie('u_fresh') },
            body: '{}'
        });
        assert.equal(res.status, 503);
        assert.equal((await res.json()).error, 'Global service quota reached');
    });
});

test('GET /api/user/quota reports spend, remaining, and the lifetime limit', async () => {
    const ledger = new SpendLedger(new KvStore());
    await ledger.recordSpend('u_1', 1.0);
    const app = createApp({ config: testConfig(), ledger, sessionManager: inertSessionManager() });

    await withServer(app, async (base) => {
        const res = await fetch(base + '/api/user/quota', {
            headers: { Cookie: sessionCookie('u_1') }
        });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.authenticated, true);
        assert.equal(body.spent, 1.0);
        assert.equal(body.remaining, 1.5);
        assert.equal(body.limit, USER_SPEND_LIMIT_USD);
    });
});

test('GET /api/user/quota rejects unauthenticated requests with 401', async () => {
    const app = createApp({ config: testConfig(), ledger: new SpendLedger(new KvStore()), sessionManager: inertSessionManager() });
    await withServer(app, async (base) => {
        const res = await fetch(base + '/api/user/quota');
        assert.equal(res.status, 401);
    });
});
