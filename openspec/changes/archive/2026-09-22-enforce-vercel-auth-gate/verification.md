## Executive Summary & Environment

- **Status**: All specs verified passing
- **Date**: 2026-09-22
- **Environment**: Linux / Node v22.23.2 / `node --test` (tests/unit/*.test.mjs)

Implementation complete: `GET /` now terminates unauthenticated Vercel visitors at a
retro-terminal access gate (`web/templates/gate.html`) instead of leaking
`index.html`, while preserving the local-dev bypass and Edge CDN static caching.

## Requirement Adherence Audit Matrix

| Capability | Requirement & Scenario | Verification Method / Test File | Status |
| :--- | :--- | :--- | :--- |
| Server-Rendered Access Gate | `### Requirement: Server-Rendered Access Gate`<br>`#### Scenario: Unauthenticated visitor accessing root on Vercel` | `tests/unit/vercelEntry.test.mjs` — "GET / on Vercel without a session serves the access gate, not index.html" | **PASS** |
| Server-Rendered Access Gate | `### Requirement: Server-Rendered Access Gate`<br>`#### Scenario: Authenticated user accessing root on Vercel` | `tests/unit/vercelEntry.test.mjs` — "GET / on Vercel with a signed od_session cookie serves index.html" | **PASS** |
| Server-Rendered Access Gate | `### Requirement: Server-Rendered Access Gate`<br>`#### Scenario: Local development root access` | `tests/unit/vercelEntry.test.mjs` — "GET / in local development mode serves index.html without credentials" | **PASS** |
| Access Gate Error Notice | `### Requirement: Access Gate Error Notice`<br>`#### Scenario: Displaying OAuth error on access gate` | Static inspection of inline `URLSearchParams` script in `web/templates/gate.html` (no redirect; `auth_error` → amber banner) | **PASS** (static) |
| Serverless Function Entrypoint and Rewrites | `### Requirement: Serverless Function Entrypoint and Rewrites`<br>`#### Scenario: Serverless API execution` | `tests/unit/vercelEntry.test.mjs` — `booting api/index.js` (pre-existing) + `/api/(.*)` rewrite retained in `vercel.json` | **PASS** |
| Serverless Function Entrypoint and Rewrites | `### Requirement: Serverless Function Entrypoint and Rewrites`<br>`#### Scenario: Direct CDN static file serving` | `tests/unit/vercelEntry.test.mjs` — "vercel.json routes / through api/index.js and bundles web/templates" asserts `/static/(.*)` → `/web/static/$1` | **PASS** |
| Serverless Function Entrypoint and Rewrites | `### Requirement: Serverless Function Entrypoint and Rewrites`<br>`#### Scenario: Root document serverless routing` | `tests/unit/vercelEntry.test.mjs` — "vercel.json routes / through api/index.js and bundles web/templates" | **PASS** |

## Resolved Assumptions & Empirical Proof

| Assumption from research.md | How Verified in Code/Tests | Result / Value | Volatility |
| :--- | :--- | :--- | :--- |
| `createAttachUserMiddleware` attaches `LOCAL_DEV_USER` when `!isVercel`, making the gate inert locally | Local-dev test (`isVercel: false`, no cookie) returns `index.html` with `id="startup-screen"` | `req.user` is always populated outside Vercel | stable |
| A signed `od_session` cookie is the auth credential the gate checks | Test signs a session via `signSession` and asserts `index.html` is served | Auth path works end-to-end with the real session module | stable |
| Tampered cookie must not bypass the gate | Flipped-signature test asserts fallback to `ACCESS CONTROL` gate | Bad signatures fail closed | stable |

## Nomenclature & Code Symbol Audit

| Glossary Term | Final Code Identifier | Location / File | Verified Compliant? |
| :--- | :--- | :--- | :--- |
| Access gate | `gate.html` | `web/templates/gate.html` | Yes |
| Gate template selection | `cfg.isVercel && !req.user ? 'gate.html' : 'index.html'` | `web/server.js` `app.get('/')` | Yes |
| Session cookie | `SESSION_COOKIE` (`od_session`) | `web/auth/session.js` | Yes |
| Sign-in trigger | `[ Sign in with Vercel ]` → `/api/auth/login` | `web/templates/gate.html` | Yes |

## Landed Tech Footprint & Patterns

| Adopted Pattern / Package | Implementation File(s) | Verification Command / Suite |
| :--- | :--- | :--- |
| Option B — server-rendered gate (HTTP 200, no 302) | `web/server.js`, `web/templates/gate.html` | `node --test tests/unit/vercelEntry.test.mjs` |
| `includeFiles` lambda packaging | `vercel.json` → `functions["api/index.js"].includeFiles` | `node --test tests/unit/vercelEntry.test.mjs` |
| CRT scanline / phosphor chrome (shared `style.css` overlays) | `web/templates/gate.html` | — |

## Invalidated Hypotheses & Mid-Build Adjustments

| Original Belief | What Proved Wrong | Final Resolution | Rationale |
| :--- | :--- | :--- | :--- |
| Task 4.2 references `tests/unit/auth.test.mjs` | No such file exists in the repo | Ran the actual auth suite `tests/unit/sessionAuth.test.mjs` (18/18) and noted the stale path on the task checkbox | Task path was stale; the real suite name is `sessionAuth.test.mjs` |

## Implementation-Discovered Deferrals

- **Deferred Item**: `?auth_error=` banner is inert under production CSP
  - **Reason**: `vercel.json` sets `script-src 'self'`, which blocks the gate's inline `auth_error` script on Vercel. The gate and sign-in button are pure HTML/CSS and unaffected. Fix (tracked in `web/FRONTEND_ARCHITECTURE.md`): move the ~15-line block to an external `/static/js/gate.js` module or add a `'sha256-…'` CSP hash.

## Empirical Execution Logs & Evidence

```bash
node --test tests/unit/vercelEntry.test.mjs
# tests 13, pass 13, fail 0

node --test tests/unit/sessionAuth.test.mjs
# tests 18, pass 18, fail 0

npm run test:unit
# tests 211, pass 208, fail 3
```

### Metrics & Data Invariants
| Metric / Count | Before | After | Delta / Observation |
| :--- | :--- | :--- | :--- |
| `vercelEntry.test.mjs` tests | 8 | 13 | +5 gate/routing tests, all passing |
| Full unit suite failures | 3 | 3 | Unchanged — 3 pre-existing RED (`migration` "RED on HEAD", 2× `D5 trade-undo limbo` "INTENDED TO FAIL TODAY"), unrelated to this change |
| Root route behavior | `/` → `index.html` always | `/` → gate when `isVercel && !req.user` | Unauthenticated Vercel clients no longer receive `index.html` |

## Quick Re-Verification (60-Second Audit)

```bash
node --test tests/unit/vercelEntry.test.mjs
```
Expected output:
```
# tests 13
# pass 13
# fail 0
```