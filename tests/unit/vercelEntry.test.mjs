// Vercel serverless entrypoint + fail-closed boot tests
// (vercel-deployment-and-auth, task 1.7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import app from '../../api/index.js';
import { loadConfig, validateProductionConfig } from '../../web/config.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

async function withServer(expressApp, fn) {
    const server = http.createServer(expressApp);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        return await fn(base);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

const VALID_PROD_ENV = {
    VERCEL: '1',
    VERCEL_APP_CLIENT_ID: 'cid',
    VERCEL_APP_CLIENT_SECRET: 'csecret',
    SESSION_SECRET: 'session-secret',
    OPENROUTER_API_KEY: 'router-key',
    LLM_BACKEND: 'openrouter',
    MOCK_LLM: '0'
};

test('api/index.js exports an Express app that dispatches requests', async () => {
    assert.equal(typeof app, 'function');
    await withServer(app, async (base) => {
        const res = await fetch(base + '/api/ping');
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.ok(body.status, 'ping response has a status field');
    });
});

test('validateProductionConfig throws when required production secrets are missing', () => {
    assert.throws(() => validateProductionConfig({ VERCEL: '1' }), /SESSION_SECRET|OPENROUTER_API_KEY|VERCEL_APP_CLIENT_SECRET/);
});

test('validateProductionConfig fails closed when MOCK_LLM is enabled', () => {
    assert.throws(
        () => validateProductionConfig({ ...VALID_PROD_ENV, MOCK_LLM: '1' }),
        /MOCK_LLM/
    );
});

test('validateProductionConfig fails closed when the backend is not openrouter', () => {
    assert.throws(
        () => validateProductionConfig({ ...VALID_PROD_ENV, LLM_BACKEND: 'lmstudio' }),
        /LLM_BACKEND/
    );
});

test('validateProductionConfig accepts a complete production environment', () => {
    assert.doesNotThrow(() => validateProductionConfig(VALID_PROD_ENV));
    const cfg = loadConfig(VALID_PROD_ENV);
    assert.equal(cfg.isVercel, true);
    assert.equal(cfg.sessionSecret, 'session-secret');
});

test('loadConfig tolerates a credential-free local development environment', () => {
    const cfg = loadConfig({ NODE_ENV: 'development' });
    assert.equal(cfg.isVercel, false);
    assert.ok(cfg.sessionSecret, 'dev falls back to a local session secret');
});

test('booting api/index.js under Vercel with a bad environment fails closed with diagnostic response', () => {
    const script = `
        import http from 'http';
        import app from './api/index.js';

        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', async () => {
            const port = server.address().port;
            const resJson = await fetch('http://127.0.0.1:' + port + '/api/auth/login', {
                headers: { 'Accept': 'application/json' }
            });
            const bodyJson = await resJson.json();
            if (resJson.status !== 500 || !bodyJson.missing || !bodyJson.missing.includes('VERCEL_APP_CLIENT_ID')) {
                console.error('DIAG_FAIL_JSON', resJson.status, JSON.stringify(bodyJson));
                process.exit(1);
            }

            const resHtml = await fetch('http://127.0.0.1:' + port + '/api/auth/login', {
                headers: { 'Accept': 'text/html' }
            });
            const bodyHtml = await resHtml.text();
            if (resHtml.status !== 500 || !bodyHtml.includes('SYSTEM DIAGNOSTIC')) {
                console.error('DIAG_FAIL_HTML', resHtml.status);
                process.exit(1);
            }

            server.close(() => process.exit(0));
        });
    `;

    const result = spawnSync(process.execPath, [
        '--input-type=module',
        '-e',
        script
    ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: process.env.HOME, VERCEL: '1', MOCK_LLM: '1' }
    });
    assert.equal(result.status, 0, `expected diagnostic 500 response, stderr: ${result.stderr}`);
});

test('booting api/index.js under a complete Vercel environment succeeds', () => {
    const result = spawnSync(process.execPath, [
        '--input-type=module',
        '-e',
        "import('./api/index.js').then(() => process.exit(0)).catch((e) => { console.error('BOOT_FAIL: ' + e.message); process.exit(1); });"
    ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: process.env.HOME, ...VALID_PROD_ENV }
    });
    assert.equal(result.status, 0, `expected clean boot, stderr: ${result.stderr}`);
});
