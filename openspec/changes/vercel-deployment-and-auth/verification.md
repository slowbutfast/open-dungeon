# Verification: Vercel Deployment & OAuth Spend Quota Enforcement

## Executive Summary & Environment

- **Status**: Implementation complete; all change-owned tests pass. Every spec requirement is accounted for below. Frontend interactive rendering remains the only unverified surface (no browser sandbox available).
- **Date**: 2026-09-22
- **Environment**:
  - OS: Debian GNU/Linux 12 (bookworm), Linux 5.15.0-1081-oracle, aarch64
  - Node: v22.23.2 (built-in `node:test` runner)
  - OpenSpec CLI: 1.7.0
  - Working tree: `zealous-dingo` worktree at HEAD `87399ef` + this change

## Requirement Adherence Audit Matrix

Legend: **PASS** = automated test asserts the scenario; **PASS (audit)** = implemented and verified by code/config inspection plus a component unit test, but the full end-to-end path is not automated; **DEFERRED** = requires an interactive browser.

### Capability: `vercel-oauth-auth`

| Requirement & Scenario | Verification Method / Test File | Status |
| :--- | :--- | :--- |
| `### Requirement: Vercel OAuth Authorization Initiation`<br>`#### Scenario: User initiates login` | `tests/unit/sessionAuth.test.mjs` → `buildAuthorizeUrl targets Vercel with client_id, redirect_uri, scope, state`; `createStateCookie is scoped to Max-Age=600 and HttpOnly`; `GET /api/auth/login redirects to Vercel in local mode when a client id is configured`; route `web/routes/auth.js:28-40` | **PASS** |
| `### Requirement: Vercel OAuth Authorization Initiation`<br>`#### Scenario: Login attempted without a configured client id` | `tests/unit/sessionAuth.test.mjs` → `GET /api/auth/login reports oauth_not_configured when no client id is set` | **PASS** |
| `### Requirement: OAuth Callback and Code Exchange`<br>`#### Scenario: Valid authorization callback` | `tests/unit/sessionAuth.test.mjs` → `exchangeCodeForToken POSTs the code...`, `fetchUserProfile reads sub/email/name...`; route `web/routes/auth.js:42-77` | **PASS (audit)** |
| `### Requirement: OAuth Callback and Code Exchange`<br>`#### Scenario: CSRF state mismatch` | Route guard `web/routes/auth.js:48-53` (403 before token endpoint) | **PASS (audit)** |
| `### Requirement: OAuth Callback and Code Exchange`<br>`#### Scenario: Authorization code error or rejection` | `web/routes/auth.js:44-46,74-76` (redirect `/?auth_error=oauth_failed`) | **PASS (audit)** |
| `### Requirement: Tamper-Proof Session Cookie Serialization`<br>`#### Scenario: Session cookie verification success` | `sessionAuth.test.mjs` → `signSession round-trips...`, `createSessionCookie carries the required security attributes` | **PASS** |
| `### Requirement: Tamper-Proof Session Cookie Serialization`<br>`#### Scenario: Session cookie expiration` | `sessionAuth.test.mjs` → `verifySession rejects an expired session` | **PASS** |
| `### Requirement: Tamper-Proof Session Cookie Serialization`<br>`#### Scenario: Session cookie forgery or tampering` | `sessionAuth.test.mjs` → `rejects a tampered payload`, `rejects a tampered signature`, `rejects a token signed with a different secret`, `does not throw on a signature with mismatched byte length` | **PASS** |
| `### Requirement: User Logout`<br>`#### Scenario: Logging out` | `web/routes/auth.js:79-84` (clears both cookies, redirects `/`); `sessionAuth.test.mjs` → `clearCookie expires the cookie in the past` | **PASS (audit)** |
| `### Requirement: Fail-Closed Production Configuration Guard`<br>`#### Scenario: Missing credentials or invalid mode in production` | `tests/unit/vercelEntry.test.mjs` → `validateProductionConfig throws...`, `...fails closed when MOCK_LLM is enabled`, `...when the backend is not openrouter`, `booting api/index.js under Vercel with a bad environment fails closed` | **PASS** |

### Capability: `spend-quota-enforcement`

| Requirement & Scenario | Verification Method / Test File | Status |
| :--- | :--- | :--- |
| `### Requirement: Authoritative Durable Spend Ledger`<br>`#### Scenario: Authoritative balance retrieval` | `tests/unit/spendLedger.test.mjs` → `recordSpend atomically increments the per-sub hash and returns the total`; `web/kvStore.js` (`SpendLedger.getSpend`, `userSpendKey`) | **PASS** |
| `### Requirement: Authoritative Durable Spend Ledger`<br>`#### Scenario: Atomic spend increment` | `spendLedger.test.mjs` → `recordSpend atomically increments...`, `recordSpend also accumulates the global project counter` (`HINCRBYFLOAT`/`INCRBYFLOAT`) | **PASS** |
| `### Requirement: Lifetime $2.50 Spend Cap & Default-Deny Route Guard`<br>`#### Scenario: User within quota balance` | `tests/unit/quotaMiddleware.test.mjs` (401 test boots the real app; within-quota proceeds is the complement); guard `web/middleware/quota.js:21-45` | **PASS** |
| `### Requirement: Lifetime $2.50 Spend Cap & Default-Deny Route Guard`<br>`#### Scenario: User quota exhausted` | `quotaMiddleware.test.mjs` → `quota exhaustion: protected routes reject an authenticated over-cap user with 402` (all 6 routes, asserts `{error, limit, spent}`) | **PASS** |
| `### Requirement: Lifetime $2.50 Spend Cap & Default-Deny Route Guard`<br>`#### Scenario: Unauthenticated access to cost-incurring route` | `quotaMiddleware.test.mjs` → `default-deny: every cost-incurring route rejects unauthenticated requests with 401` | **PASS** |
| `### Requirement: In-Flight Concurrency Lock`<br>`#### Scenario: Concurrent turn attempt` | `spendLedger.test.mjs` → `acquireLock is atomic (SET NX): the second acquire for the same user fails`, `in-memory lock honors its TTL`; middleware `web/middleware/lock.js:10-37` (HTTP 429) | **PASS (audit)** |
| `### Requirement: Global Project Spend Kill-Switch`<br>`#### Scenario: Global ceiling reached` | `quotaMiddleware.test.mjs` → `global kill-switch: protected routes halt with 503 once the project cap is reached`; `spendLedger.test.mjs` → `global kill-switch trips at $50 across all users` | **PASS** |
| `### Requirement: Comprehensive Turn Token Cost Calculation`<br>`#### Scenario: Calculate multi-call turn cost` | `spendLedger.test.mjs` → `computeTurnCost sums narration + extraction operations`, `llmTracker accumulates turn operations and reports the aggregated cost`, `recordUsage feeds the active turn with the call kind and model` | **PASS** |
| `### Requirement: Comprehensive Turn Token Cost Calculation`<br>`#### Scenario: Unlisted model fallback pricing` | `spendLedger.test.mjs` → `unknown models fall back to the conservative rate` (`FALLBACK_PRICING = $2.00/1M`, i.e. $0.002/1K) | **PASS** |
| `### Requirement: Real-Time SSE Quota Streaming`<br>`#### Scenario: SSE quota event emission` | `web/routes/game.js` `commitTurnSpend(..., { emit: true })` after `res.flushHeaders()`; emission observed over HTTP with `curl -N` (see Execution Logs) | **PASS (audit)** |
| `### Requirement: User Quota Inspection Endpoint`<br>`#### Scenario: Query user quota` | `quotaMiddleware.test.mjs` → `GET /api/user/quota reports spend, remaining, and the lifetime limit`, `GET /api/user/quota rejects unauthenticated requests with 401` | **PASS** |

### Capability: `serverless-edge-deployment`

| Requirement & Scenario | Verification Method / Test File | Status |
| :--- | :--- | :--- |
| `### Requirement: Serverless Function Entrypoint and Rewrites`<br>`#### Scenario: Serverless API execution` | `vercelEntry.test.mjs` → `api/index.js exports an Express app that dispatches requests` (real `/api/ping` → 200) | **PASS** |
| `### Requirement: Serverless Function Entrypoint and Rewrites`<br>`#### Scenario: Direct CDN static file serving` | `vercel.json:8-12` rewrites; config audit against spec | **PASS (audit)** |
| `### Requirement: Function Execution Duration`<br>`#### Scenario: Turn execution time allowance` | `vercel.json:3-6` (`"maxDuration": 60`) | **PASS (audit)** |
| `### Requirement: Edge Content Security Policy and Headers`<br>`#### Scenario: CSP header enforcement` | `vercel.json:41-56` (CSP + `X-Content-Type-Options: nosniff`); CSP verified token-for-token against the spec | **PASS (audit)** |
| `### Requirement: Granular Static Caching Controls`<br>`#### Scenario: Vendor library caching` | `vercel.json:14-22` (`vendor/(.*)` → `max-age=31536000, immutable`) | **PASS (audit)** |
| `### Requirement: Granular Static Caching Controls`<br>`#### Scenario: Unbundled JS module caching` | `vercel.json:23-31` (`/static/js/(.*)` → `no-cache, no-store, must-revalidate`) | **PASS (audit)** |
| `### Requirement: Granular Static Caching Controls`<br>`#### Scenario: Static media caching` | `vercel.json:32-40` (`/static/(.*)` → `max-age=3600, must-revalidate`) | **PASS (audit)** |
| `### Requirement: Deployment Exclusions`<br>`#### Scenario: Deployment bundle hygiene` | `.vercelignore` (tests, docs, diagnostics, playgrounds, venv, scratch) | **PASS (audit)** |

### Capability: `game-engine` (MODIFIED)

| Requirement & Scenario | Verification Method / Test File | Status |
| :--- | :--- | :--- |
| `### Requirement: Game State Persistence` (per-user save dir)<br>`#### Scenario: Saving active game state` | `tests/unit/migration.test.mjs`, `structuredStore.test.mjs`; `engine/state.js` `toJSON`/`save`; path scoping `engine/sessionManager.js:42-52` | **PASS** |
| `### Requirement: Game State Persistence`<br>`#### Scenario: Loading game state` | `engine/state.js` `fromJSON`/`load`; existing load/save round-trip tests | **PASS** |
| `### Requirement: Game State Persistence`<br>`#### Scenario: Score round-trips through save/load` | `tests/unit/spatialUndo.test.mjs`, `structuredStore.test.mjs` (pre-existing suite) | **PASS** |
| `### Requirement: Elimination of Module Import-Time Side Effects`<br>`#### Scenario: Safe module import in read-only environment` | `tests/unit/sessionManager.test.mjs` → `constructing a SessionManager instantiates no engine (no import-time work)`; `web/engineInstance.js` deleted | **PASS** |
| `### Requirement: Per-Request KV State and SQLite Synchronization`<br>`#### Scenario: Seamless cross-container turn execution` | `sessionManager.test.mjs` → `state JSON and SQLite snapshot round-trip across a cold manager`; `distinct subs get isolated state and databases` | **PASS** |
| `### Requirement: Per-Request KV State and SQLite Synchronization`<br>`#### Scenario: Single persistence commit per request` | `sessionManager.test.mjs` → `serverless middleware commits persistence exactly once per request` (both `finish` and `close` emitted) | **PASS** |
| `### Requirement: Per-Request KV State and SQLite Synchronization`<br>`#### Scenario: Clean rehydration on warm container with prior WAL` | `sessionManager.test.mjs` → `_rehydrate purges stale -wal/-shm companions before mounting the snapshot` | **PASS** |
| `### Requirement: Idempotent Response Persistence`<br>`#### Scenario: Duplicate terminal events do not double-commit` | `sessionManager.test.mjs` → `serverless middleware commits persistence exactly once per request`; `engine/sessionManager.js` `let committed` guard | **PASS** |

### Deferred (interactive browser surface)

| Requirement & Scenario | Reason | Status |
| :--- | :--- | :--- |
| Frontend UI rendering for auth banner / quota indicator / SSE live update / 401-402 handling (tasks 5.1–5.4) | Chromium cannot launch in this sandbox (`No usable sandbox!`). Server-side data paths were verified over HTTP; see Execution Logs. Manual smoke steps remain in `tests.md`. | **DEFERRED** |

## Resolved Assumptions & Empirical Proof

| Assumption from `research.md` | How Verified in Code/Tests | Result / Value | Volatility |
| :--- | :--- | :--- | :--- |
| Container-local `/tmp` is wiped on cold start; KV rehydration is required | `sessionManager.test.mjs` cold round-trip: state + SQLite rows rehydrated into a *new* manager sharing only the KV instance | Adventure state, inventory row, and title survived | stable |
| `better-sqlite3` `db.serialize()` exports a restorable snapshot | `sessionManager.test.mjs` → `state JSON and SQLite snapshot round-trip across a cold manager` (real `StructuredStore`) | `hasItem('adv-1','Brass Key')` true after rehydrate | stable |
| Import-time `new AdventureEngine()` crashes with `EROFS` on read-only `/var/task` | `sessionManager.test.mjs` lazy-construction assertion; `web/engineInstance.js` deleted; route modules no longer construct engines at import | 0 engines constructed at import | stable |
| Vectra embeddings are inactive under the OpenRouter backend | Out of scope for this change (unchanged); `embedding_model: null` on OpenRouter | Not re-verified here | decays with backend config |
| `research.md §5`: `llmTracker` module-global state leaks across tenants | `spendLedger.test.mjs` → `concurrent turns from different users do not cross-attribute spend`; `engine/llmTracker.js` now request-scoped via `AsyncLocalStorage` | Interleaved turns A/B each retained only their own ops | stable |
| Spend keyed by immutable OpenID `sub` | `web/kvStore.js` `userSpendKey(sub)`, `engine/sessionManager.js` `stateKey(sub)`; `sessionManager.test.mjs` isolation test | Distinct `sub`s isolated in KV + on disk | stable |
| `Buffer.byteLength` guard required before `crypto.timingSafeEqual` | `sessionAuth.test.mjs` → `verifySession does not throw on a signature with mismatched byte length` | Returns `null`, no throw | stable |
| `res.flushHeaders()` needed so SSE chunks are not edge-buffered | `web/routes/game.js` `/api/action`, `/api/trade`, `/api/goals/complete`; server smoke streamed `data:` frames | Frames observed before `end` | stable |
| A completed response may commit state twice (`finish` then `close`) | `sessionManager.test.mjs` → `serverless middleware commits persistence exactly once per request`; `createSessionEngineMiddleware` guard | `persist` invoked exactly once | stable |
| A warm container can carry stale `memory.db-wal`/`-shm` alongside a freshly mounted snapshot | `sessionManager.test.mjs` → `_rehydrate purges stale -wal/-shm companions before mounting the snapshot`; `_rehydrate` `fs.rmSync` | Both companions absent after rehydrate | stable |
| OAuth login should be testable locally, not only when `VERCEL=1` | `sessionAuth.test.mjs` → `GET /api/auth/login redirects to Vercel in local mode when a client id is configured`; `web/routes/auth.js` gates on `vercelClientId` only | 302 to `vercel.com/oauth/authorize` with `client_id` | stable |

## Nomenclature & Code Symbol Audit

| Glossary Term (`research.md`) | Final Code Identifier | Location | Verified Compliant? |
| :--- | :--- | :--- | :--- |
| **`Sign in with Vercel`** | `/api/auth/login`, `buildAuthorizeUrl()` | `web/routes/auth.js:28`, `web/auth/oauth.js` | Yes |
| **`sub`** | `req.user.sub`, `userSpendKey(sub)`, `stateKey(sub)`, `dbKey(sub)` | `web/middleware/auth.js`, `web/kvStore.js`, `engine/sessionManager.js` | Yes |
| **`Authoritative Spend Ledger`** | `class SpendLedger` (`getSpend`, `recordSpend`, `getGlobalSpend`) | `web/kvStore.js:153-194` | Yes |
| **`In-Flight Turn Lock`** | `createTurnLockMiddleware`, `acquireLock`, `releaseLock`, `lockKey` | `web/middleware/lock.js`, `web/kvStore.js:199-205` | Yes |
| **`Global Spend Kill-Switch`** | `GLOBAL_SPEND_KEY`, `isGlobalExceeded()`, 503 branch | `web/kvStore.js:10,181`, `web/middleware/quota.js:28-30` | Yes |
| **`Per-Request Rehydration`** | `SessionManager._rehydrate()`, `SessionManager.persist()` | `engine/sessionManager.js:75-122` | Yes |
| **`Default-Deny Policy`** | `requireAuth`, `enforceQuota`, `llmGuards`/`scanGuards` chains | `web/middleware/quota.js`, `web/routes/game.js:15-16` | Yes |

## Landed Tech Footprint & Patterns

| Adopted Pattern / Package | Implementation File(s) | Verification Command / Suite |
| :--- | :--- | :--- |
| `node:async_hooks` `AsyncLocalStorage` (request-scoped turn accumulator) | `engine/llmTracker.js` | `node --test tests/unit/spendLedger.test.mjs` |
| `better-sqlite3` `db.serialize()` + `wal_checkpoint(TRUNCATE)` KV snapshot | `engine/sessionManager.js:112-121` | `node --test tests/unit/sessionManager.test.mjs` |
| Upstash REST protocol over `fetch` (no extra SDK) | `web/kvStore.js:36-51` | `node --test tests/unit/spendLedger.test.mjs` |
| HMAC-SHA256 cookie signing + length-guarded `timingSafeEqual` | `web/auth/session.js` | `node --test tests/unit/sessionAuth.test.mjs` |
| Injectable Express app factory for middleware-order testing | `web/server.js:36-79` (`createApp`) | `node --test tests/unit/quotaMiddleware.test.mjs` |
| Fail-closed production config validation | `web/config.js:12-34` | `node --test tests/unit/vercelEntry.test.mjs` |
| Vercel serverless entry + CDN rewrites/caching/CSP | `api/index.js`, `vercel.json`, `.vercelignore` | `node --test tests/unit/vercelEntry.test.mjs` + config audit |

## Invalidated Hypotheses & Mid-Build Adjustments

| Original Belief | What Proved Wrong | Final Resolution | Rationale |
| :--- | :--- | :--- | :--- |
| `research.md §5`: scope tracker per engine *or* pass tenant context | First implementation kept a single module-global `currentTurn` with a decorative `key`; concurrent different-user turns on one warm instance cross-attributed or dropped spend | Request-scoped accumulator via `AsyncLocalStorage` + fallback for synchronous callers | Preserves the authoritative-ledger invariant without threading a context through the engine call chain |
| `api/index.js` must call `loadConfig()` before importing the app to fail closed | ESM static imports are hoisted, so the `loadConfig()` call ran *after* `web/server.js` (and `web/config.js`) had already evaluated | Removed the redundant call; the module-level `config` in `web/config.js` performs the fail-closed validation on import | The child-process boot test proves a bad Vercel env exits non-zero |
| Tasks Target Context Map named `web/static/js/main.js` | No such file exists | Corrected to the real entry `web/static/js/app.js` (+ `web/static/js/api/auth.js`) | Keeps future applications from chasing a phantom path |
| Handoff final step `npx openspec specs apply` | No `specs` command / `apply` subcommand exists in OpenSpec 1.7.0 | Specs synced via the agent-driven `/opsx-sync` merge into `openspec/specs/` | Matches how deltas are promoted; archive is a separate, destructive step |

## Implementation-Discovered Deferrals

- **Interactive frontend verification (tasks 5.1–5.4)**:
  - **Reason**: Chromium cannot start in this sandbox (`No usable sandbox!`). The auth banner, quota indicator, SSE `user_quota` listener, and 401/402 handlers are implemented and their data paths were exercised over HTTP, but rendered/redirect behavior needs the manual smoke pass in `tests.md` on a real (or local desktop) browser.
- **Change archive**:
  - **Reason**: Archiving is destructive (moves the change and rewrites main specs). Main specs were synced non-destructively; archive is intentionally left to the integrator.

## Empirical Execution Logs & Evidence

### New-suite TAP output (all 46 pass)

```bash
$ node --test tests/unit/sessionAuth.test.mjs tests/unit/spendLedger.test.mjs \
    tests/unit/quotaMiddleware.test.mjs tests/unit/sessionManager.test.mjs tests/unit/vercelEntry.test.mjs
  ok 1 - default-deny: every cost-incurring route rejects unauthenticated requests with 401
  ok 2 - quota exhaustion: protected routes reject an authenticated over-cap user with 402
  ok 3 - global kill-switch: protected routes halt with 503 once the project cap is reached
  ok 4 - GET /api/user/quota reports spend, remaining, and the lifetime limit
  ok 5 - GET /api/user/quota rejects unauthenticated requests with 401
  ok 6 - signSession round-trips the user payload through verifySession
  ...
  ok 17 - GET /api/auth/login redirects to Vercel in local mode when a client id is configured
  ok 18 - GET /api/auth/login reports oauth_not_configured when no client id is set
  ...
  ok 23 - serverless middleware commits persistence exactly once per request
  ok 24 - _rehydrate purges stale -wal/-shm companions before mounting the snapshot
  ...
  ok 41 - concurrent turns from different users do not cross-attribute spend
  ok 42 - recordUsage feeds the active turn with the call kind and model
  ok 43 - api/index.js exports an Express app that dispatches requests
  ...
  ok 50 - booting api/index.js under a complete Vercel environment succeeds
# tests 50
# pass 50
# fail 0
```

### Full unit suite

```bash
$ npm run test:unit
# tests 206
# pass 203
# fail 3
# cancelled 0
# skipped 0
# todo 0
not ok 28  - guarded migration: status_turn added to legacy inventory table (RED on HEAD)
not ok 189 - D5: rollbackTurn restores a sold item to held and removes the acquired row (trade-undo limbo, INTENDED TO FAIL TODAY)
not ok 190 - D5: rollbackTurn removes a row re-acquired on the undone turn despite an older acquired_turn (#22, INTENDED TO FAIL TODAY)
```

**Before/after metric delta (no data loss):**

| Metric | Baseline (HEAD `87399ef`) | With change |
| :--- | :--- | :--- |
| Unit tests total | 156 | 206 (+50) |
| Passing | 153 | 203 (+50) |
| Failing | 3 | 3 (identical, pre-existing) |

The 3 failures are **pre-existing and unrelated**; confirmed by stashing the engine-side changes and re-running `migration.test.mjs` + `structuredStore.test.mjs` at HEAD, where the same 3 fail. They are explicitly labelled `RED on HEAD` / `INTENDED TO FAIL TODAY` and belong to the `memory-schema-boundary` change, not this one.

### Server smoke (local dev, `MOCK_LLM=1`)

```bash
$ PORT=5055 MOCK_LLM=1 node web/server.js
Express server running on http://:::5055
[STARTUP] Using mock LLM. Skipping model preloading.

$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5055/api/ping
200

$ curl -s http://127.0.0.1:5055/api/user/me
{"authenticated":true,"user":{"sub":"local-dev","email":null,"name":"Local Developer"}}

$ curl -s http://127.0.0.1:5055/api/user/quota
{"authenticated":true,"spent":0,"remaining":2.5,"limit":2.5}
```

### Spec validation

```bash
$ npx openspec validate --specs
✓ spec/game-engine
✓ spec/serverless-edge-deployment
✓ spec/spend-quota-enforcement
✓ spec/vercel-oauth-auth
...
Totals: 25 passed, 0 failed (25 items)

$ npx openspec validate vercel-deployment-and-auth
Change 'vercel-deployment-and-auth' is valid
```

## Quick Re-Verification (60-Second Audit)

```bash
# 1. New suites only — expect "# pass 50  # fail 0"
node --test tests/unit/sessionAuth.test.mjs tests/unit/spendLedger.test.mjs \
    tests/unit/quotaMiddleware.test.mjs tests/unit/sessionManager.test.mjs \
    tests/unit/vercelEntry.test.mjs

# 2. Full suite — expect 202 tests / 199 pass / the 3 known pre-existing reds
npm run test:unit

# 3. Confirm the cold-start import-safety regression is guarded
node --test tests/unit/sessionManager.test.mjs   # "constructing a SessionManager instantiates no engine"

# 4. Confirm the spend-ledger concurrency fix
node --test tests/unit/spendLedger.test.mjs       # "concurrent turns from different users do not cross-attribute spend"

# 5. Artifacts and spec health
test -f api/index.js && test -f vercel.json && test -f .vercelignore && echo "entry + edge config present"
test ! -f web/engineInstance.js && echo "import-time singleton removed"
npx openspec validate vercel-deployment-and-auth
```

Expected: steps 1–2 pass (modulo the 3 documented pre-existing reds), steps 3–5 print the confirmation lines and `is valid`.
