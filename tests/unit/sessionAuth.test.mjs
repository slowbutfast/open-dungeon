// Session + OAuth auth unit tests (vercel-deployment-and-auth, task 1.3).
//
// Covers the HMAC-SHA256 session cookie surface (`web/auth/session.js`) and the
// Vercel OAuth 2.0 wire helpers (`web/auth/oauth.js`). No network: the OAuth
// fetcher is injected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';

import {
    SESSION_COOKIE,
    STATE_COOKIE,
    signSession,
    verifySession,
    generateState,
    createSessionCookie,
    createStateCookie,
    clearCookie,
    parseCookieHeader
} from '../../web/auth/session.js';

import {
    buildAuthorizeUrl,
    exchangeCodeForToken,
    fetchUserProfile
} from '../../web/auth/oauth.js';

import { createAuthRouter } from '../../web/routes/auth.js';

const SECRET = 'unit-test-secret';

function testConfig(overrides = {}) {
    return {
        isVercel: false,
        isProduction: false,
        sessionSecret: SECRET,
        vercelClientId: null,
        vercelClientSecret: null,
        appUrl: null,
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

// ─── session signing ───────────────────────────────────────────────────────

test('signSession round-trips the user payload through verifySession', () => {
    const token = signSession({ sub: 'u_123', email: 'a@b.c', name: 'Ada' }, SECRET);
    assert.equal(typeof token, 'string');

    const payload = verifySession(token, SECRET);
    assert.ok(payload, 'valid token must verify');
    assert.equal(payload.sub, 'u_123');
    assert.equal(payload.email, 'a@b.c');
    assert.equal(payload.name, 'Ada');
    assert.equal(payload.v, 1);
    assert.ok(payload.exp > payload.iat, 'exp must be after iat');
});

test('verifySession rejects a tampered payload', () => {
    const token = signSession({ sub: 'u_123', email: 'a@b.c', name: 'Ada' }, SECRET);
    const [, sig] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({
        sub: 'attacker', email: null, name: null, iat: 0, exp: 9999999999, v: 1
    })).toString('base64url');

    assert.equal(verifySession(`${forgedPayload}.${sig}`, SECRET), null);
});

test('verifySession rejects a tampered signature', () => {
    const token = signSession({ sub: 'u_123' }, SECRET);
    const [body, sig] = token.split('.');
    const flipped = sig[0] === 'A' ? 'B' + sig.slice(1) : 'A' + sig.slice(1);
    assert.equal(verifySession(`${body}.${flipped}`, SECRET), null);
});

test('verifySession rejects a token signed with a different secret', () => {
    const token = signSession({ sub: 'u_123' }, SECRET);
    assert.equal(verifySession(token, 'some-other-secret'), null);
});

test('verifySession rejects an expired session', () => {
    // Signed 10 seconds in the past, exp already passed.
    const token = signSession({ sub: 'u_123' }, SECRET, { ttlSeconds: -10 });
    assert.equal(verifySession(token, SECRET), null);
});

test('verifySession rejects malformed tokens without throwing', () => {
    for (const bad of [null, undefined, '', 'garbage', 'a.b.c', '.', 'onlybody.', '.onlysig']) {
        assert.equal(verifySession(bad, SECRET), null, `expected null for ${JSON.stringify(bad)}`);
    }
});

test('verifySession does not throw on a signature with mismatched byte length', () => {
    // crypto.timingSafeEqual throws when lengths differ — the guard must
    // return null instead.
    const body = Buffer.from(JSON.stringify({
        sub: 'u', email: null, name: null, iat: 0, exp: 9999999999, v: 1
    })).toString('base64url');
    assert.doesNotThrow(() => verifySession(`${body}.short`, SECRET));
    assert.equal(verifySession(`${body}.short`, SECRET), null);
});

// ─── cookies ───────────────────────────────────────────────────────────────

test('createSessionCookie carries the required security attributes', () => {
    const token = signSession({ sub: 'u_123' }, SECRET);
    const cookie = createSessionCookie(token);
    assert.ok(cookie.startsWith(`${SESSION_COOKIE}=`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /Max-Age=604800/);
});

test('createStateCookie is scoped to Max-Age=600 and HttpOnly', () => {
    const cookie = createStateCookie('abc123');
    assert.ok(cookie.startsWith(`${STATE_COOKIE}=`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Max-Age=600/);
});

test('clearCookie expires the cookie in the past', () => {
    const cookie = clearCookie(SESSION_COOKIE);
    assert.match(cookie, /Max-Age=0/);
});

test('generateState returns a 32-byte hex, non-repeating value', () => {
    const a = generateState();
    const b = generateState();
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, b);
});

test('parseCookieHeader splits and decodes cookie pairs', () => {
    const parsed = parseCookieHeader('od_session=abc.def; od_oauth_state=xyz');
    assert.equal(parsed[SESSION_COOKIE], 'abc.def');
    assert.equal(parsed[STATE_COOKIE], 'xyz');
    assert.deepEqual(parseCookieHeader(''), {});
    assert.deepEqual(parseCookieHeader(undefined), {});
});

// ─── oauth wire helpers ────────────────────────────────────────────────────

test('buildAuthorizeUrl targets Vercel with client_id, redirect_uri, state (scope omitted by default)', () => {
    const url = new URL(buildAuthorizeUrl({
        clientId: 'client_123',
        redirectUri: 'https://example.com/api/auth/callback',
        state: 'state_abc'
    }));
    assert.equal(url.origin + url.pathname, 'https://vercel.com/oauth/authorize');
    assert.equal(url.searchParams.get('client_id'), 'client_123');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://example.com/api/auth/callback');
    assert.equal(url.searchParams.get('state'), 'state_abc');
    assert.equal(url.searchParams.has('scope'), false);
});

test('buildAuthorizeUrl includes scope when explicitly configured', () => {
    const url = new URL(buildAuthorizeUrl({
        clientId: 'client_123',
        redirectUri: 'https://example.com/api/auth/callback',
        state: 'state_abc',
        scope: 'openid'
    }));
    assert.equal(url.searchParams.get('scope'), 'openid');
});

test('GET /api/auth/callback forwards provider error code in redirect', async () => {
    const app = express();
    app.use('/api', createAuthRouter(testConfig()));

    await withServer(app, async (base) => {
        const res = await fetch(base + '/api/auth/callback?error=invalid_scope&error_description=bad_scope', { redirect: 'manual' });
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), '/?auth_error=invalid_scope');
    });
});

test('exchangeCodeForToken POSTs the code to the Vercel token endpoint', async () => {
    let seen = null;
    const fetchImpl = async (input, init) => {
        seen = { input, init };
        return { ok: true, status: 200, json: async () => ({ access_token: 'tok_1' }) };
    };
    const token = await exchangeCodeForToken({
        code: 'code_1', clientId: 'cid', clientSecret: 'csecret',
        redirectUri: 'https://example.com/api/auth/callback', fetchImpl
    });
    assert.equal(token.access_token, 'tok_1');
    assert.equal(seen.input, 'https://api.vercel.com/login/oauth/token');
    assert.equal(seen.init.method, 'POST');
    assert.match(seen.init.body, /grant_type=authorization_code/);
    assert.match(seen.init.body, /code=code_1/);
    assert.match(seen.init.body, /client_id=cid/);
    assert.match(seen.init.body, /client_secret=csecret/);
});

test('exchangeCodeForToken throws on a non-ok token response', async () => {
    const fetchImpl = async () => ({ ok: false, status: 400, text: async () => 'bad' });
    await assert.rejects(() => exchangeCodeForToken({
        code: 'x', clientId: 'cid', clientSecret: 'cs', redirectUri: 'r', fetchImpl
    }));
});

test('fetchUserProfile reads sub/email/name from the userinfo endpoint', async () => {
    let seen = null;
    const fetchImpl = async (input, init) => {
        seen = { input, init };
        return {
            ok: true, status: 200,
            json: async () => ({ sub: 'user_1', email: 'dev@example.com', name: 'Dev' })
        };
    };
    const profile = await fetchUserProfile({ accessToken: 'tok_1', fetchImpl });
    assert.deepEqual(profile, { sub: 'user_1', email: 'dev@example.com', name: 'Dev' });
    assert.equal(seen.input, 'https://api.vercel.com/login/oauth/userinfo');
    assert.equal(seen.init.headers.Authorization, 'Bearer tok_1');
});

test('fetchUserProfile surfaces the raw claim keys when sub is absent', async () => {
    const seen = [];
    const original = console.error;
    console.error = (...args) => seen.push(args);
    try {
        await fetchUserProfile({
            accessToken: 't',
            fetchImpl: async () => ({ ok: true, json: async () => ({ id: 'u_1', email: 'a@b.c' }) })
        });
    } finally {
        console.error = original;
    }
    assert.deepEqual(seen[0][1].claimKeys, ['id', 'email']);
});

// ─── login route gating ────────────────────────────────────────────────────

test('GET /api/auth/login redirects to Vercel in local mode when a client id is configured (scope omitted by default)', async () => {
    const app = express();
    app.use('/api', createAuthRouter(testConfig({ vercelClientId: 'client_xyz' })));

    await withServer(app, async (base) => {
        const res = await fetch(base + '/api/auth/login', { redirect: 'manual' });
        assert.equal(res.status, 302);
        const location = res.headers.get('location');
        assert.match(location, /^https:\/\/vercel\.com\/oauth\/authorize\?/);
        assert.match(location, /client_id=client_xyz/);
        assert.match(location, /state=[0-9a-f]{64}/);
        assert.equal(/scope=/.test(location), false);
        assert.match(res.headers.get('set-cookie') || '', /od_oauth_state=/);
    });
});

test('GET /api/auth/login passes scope when vercelOAuthScope is configured', async () => {
    const app = express();
    app.use('/api', createAuthRouter(testConfig({ vercelClientId: 'client_xyz', vercelOAuthScope: 'openid' })));

    await withServer(app, async (base) => {
        const res = await fetch(base + '/api/auth/login', { redirect: 'manual' });
        assert.equal(res.status, 302);
        const location = res.headers.get('location');
        assert.match(location, /scope=openid/);
    });
});

test('GET /api/auth/login reports oauth_not_configured when no client id is set', async () => {
    const app = express();
    app.use('/api', createAuthRouter(testConfig({ vercelClientId: null })));

    await withServer(app, async (base) => {
        const res = await fetch(base + '/api/auth/login', { redirect: 'manual' });
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), '/?auth_error=oauth_not_configured');
    });
});
