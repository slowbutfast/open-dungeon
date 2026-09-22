# Implementation Tasks: Vercel Deployment & OAuth Spend Quota Enforcement

## Target Context Map

| Relative File Path | Target Line Range | Component / Purpose |
| :--- | :--- | :--- |
| `tests/unit/sessionAuth.test.mjs` | Lines 1–130 (New) | Unit tests for HMAC session cookie signing, timing-safe validation, expiration, and OAuth state CSRF |
| `tests/unit/spendLedger.test.mjs` | Lines 1–160 (New) | Unit tests for atomic spend tracking, $2.50 user cap, $50 global kill-switch, in-flight locks, and pricing |
| `tests/unit/quotaMiddleware.test.mjs` | Lines 1–140 (New) | Integration tests for default-deny route protection, HTTP 402 rejection on quota exhaustion, and `/api/user/quota` |
| `tests/unit/sessionManager.test.mjs` | Lines 1–110 (New) | Tests for zero import-time side effects, KV state JSON & SQLite snapshot rehydration across cold instances |
| `tests/unit/vercelEntry.test.mjs` | Lines 1–80 (New) | Tests verifying `api/index.js` dispatches requests through Express and fail-closed boot checks |
| `web/engineInstance.js` | Lines 1–9 (Delete) | Remove global singleton constructor to eliminate cold-start `EROFS` crashes |
| `web/config.js` | Lines 1–55 (New) | Environment configuration, validation, and fail-closed checks for production (`VERCEL === '1'`) |
| `web/auth/session.js` | Lines 1–95 (New) | HMAC-SHA256 cookie signing, timing-safe length-checked verification, expiration, and state generator |
| `web/auth/oauth.js` | Lines 1–105 (New) | Vercel OAuth 2.0 / OIDC authorization URL builder, code exchange, and profile fetcher (`sub`, `email`, `name`) |
| `web/kvStore.js` | Lines 1–130 (New) | Durable Vercel KV / Upstash Redis client with atomic `HINCRBYFLOAT`, `SET NX EX`, and dev store fallback |
| `web/middleware/auth.js` | Lines 1–60 (New) | Request authentication middleware extracting and attaching verified user session to `req.user` |
| `web/middleware/lock.js` | Lines 1–50 (New) | In-flight turn concurrency lock middleware (`SET user:lock:<subId> 1 NX EX 30`) |
| `web/middleware/quota.js` | Lines 1–85 (New) | Default-deny quota guard checking user spend < $2.50 and global spend < $50.00 |
| `web/routes/auth.js` | Lines 1–80 (New) | Authentication routes (`/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`) |
| `web/routes/user.js` | Lines 1–45 (New) | User profile and quota query endpoint (`/api/user/quota`) |
| `web/server.js` | Lines 1–50, 120–136 | Mount cookie parser, auth routers, export Express `app` for serverless, conditional `app.listen` |
| `web/routes/game.js` | Lines 1–30, 270–300, 330–470 | Sweep `engineInstance.js`, protect `/api/init` and `/api/action`, call `res.flushHeaders()`, emit SSE `user_quota` |
| `web/routes/saves.js` | Lines 1–40 | Sweep `engineInstance.js`, resolve engine via `req.engine` |
| `web/routes/lore.js` | Lines 1–35 | Sweep `engineInstance.js`, resolve engine via `req.engine` |
| `web/routes/memory.js` | Lines 1–35 | Sweep `engineInstance.js`, resolve engine via `req.engine` |
| `engine/index.js` | Lines 40–65 | Safe lazy initialization, default `saveDir` to `/tmp/open-dungeon/...` in serverless |
| `engine/sessionManager.js` | Lines 1–95 (New) | Per-request engine rehydration and persistence to KV (`user:state:<subId>` and `user:db:<subId>`) |
| `engine/llmTracker.js` | Lines 5–45 | Comprehensive token pricing table and exact turn cost calculation summing all operations in a turn |
| `web/static/js/app.js` + `web/static/js/api/auth.js` | — | Quota balance UI indicator, "Sign in with Vercel" auth banner, and `user_quota` SSE handling (entry module is `app.js`, not `main.js`) |
| `vercel.json` | Lines 1–75 (New) | Vercel deployment configuration, CDN static rewrites, `api/index.js` rewrite, `maxDuration: 60`, CSP |
| `.vercelignore` | Lines 1–25 (New) | File exclusions for edge deployment (tests, docs, venv, diagnostics, playgrounds) |
| `api/index.js` | Lines 1–20 (New) | Vercel serverless function entrypoint exporting the Express application |
| `engine/ARCHITECTURE.md` | Doc update | Document serverless state rehydration, KV persistence, and lazy engine instantiation |
| `web/FRONTEND_ARCHITECTURE.md` | Doc update | Document Vercel OAuth session flow, quota UI indicator, and direct CDN static serving |
| `tests/ARCHITECTURE.md` | Doc update | Document new test suites for auth, spend ledger, quota middleware, and session manager |

---

## 1. Test Scaffolding (TDD)

- [x] 1.1 Spike: Verify `better-sqlite3` `db.serialize()` / deserialize behavior and memory footprint
- [x] 1.2 Spike: Verify Express app export and basic dispatch via `api/index.js`
- [x] 1.3 Scaffold failing unit tests for HMAC cookie signing, timing-safe equality, expiration, and CSRF state in `tests/unit/sessionAuth.test.mjs`
- [x] 1.4 Scaffold failing unit tests for KV atomic spend increments, $2.50 user limit, $50 global cap, and in-flight locks in `tests/unit/spendLedger.test.mjs`
- [x] 1.5 Scaffold failing integration tests for default-deny route protection (`/api/init`, `/api/action`, etc.) in `tests/unit/quotaMiddleware.test.mjs`
- [x] 1.6 Scaffold failing tests for zero import-time side effects and KV state/SQLite rehydration in `tests/unit/sessionManager.test.mjs`
- [x] 1.7 Scaffold failing tests for `api/index.js` dispatch and fail-closed boot configuration in `tests/unit/vercelEntry.test.mjs`

## 2. Authentication & Session Infrastructure

- [x] 2.1 Implement `web/config.js` with fail-closed production checks (`VERCEL_APP_CLIENT_SECRET`, `SESSION_SECRET`, `OPENROUTER_API_KEY`, `MOCK_LLM !== '1'`)
- [x] 2.2 Implement `web/auth/session.js` with HMAC-SHA256 signing, expiration checking, and length-guarded `crypto.timingSafeEqual` verification
- [x] 2.3 Implement `web/auth/oauth.js` with Vercel OAuth URL generation, state cookie creation, and token/userinfo exchange extracting `sub`
- [x] 2.4 Implement `web/middleware/auth.js` session parser middleware attaching user to `req.user`
- [x] 2.5 Implement `web/routes/auth.js` for `/api/auth/login`, `/api/auth/callback`, and `/api/auth/logout`

## 3. Spend Ledger, In-Flight Locking & Default-Deny Quota

- [x] 3.1 Implement `engine/llmTracker.js` comprehensive token pricing table and turn cost calculator summing all operations in a turn
- [x] 3.2 Implement `web/kvStore.js` with Upstash REST API / Vercel KV client supporting atomic `HINCRBYFLOAT`, `SET NX EX`, and dev store fallback
- [x] 3.3 Implement `web/middleware/lock.js` acquiring and releasing in-flight locks (`user:lock:<subId>`) with HTTP 429 on conflict
- [x] 3.4 Implement `web/middleware/quota.js` enforcing default-deny route protection, $2.50 user cap, and $50 global kill-switch
- [x] 3.5 Implement `web/routes/user.js` exposing `GET /api/user/quota`
- [x] 3.6 Update `web/routes/game.js` to call `res.flushHeaders()` and emit `user_quota` SSE events upon turn completion

## 4. Multi-Tenant KV State & Cold-Start Safety

- [x] 4.1 Delete `web/engineInstance.js` and sweep `web/routes/game.js`, `web/routes/saves.js`, `web/routes/lore.js`, `web/routes/memory.js` to remove module-level engine imports
- [x] 4.2 Update `engine/index.js` so default paths resolve in `/tmp/open-dungeon/...` when executing under serverless without synchronous import writes
- [x] 4.3 Implement `engine/sessionManager.js` with per-request KV hydration and persistence of `engine.state` JSON and SQLite `db.serialize()` buffer
- [x] 4.4 Mount session engine middleware in Express attaching the rehydrated engine instance to `req.engine`

## 5. Web Frontend UI & SSE Quota Stream

- [x] 5.1 Implement "Sign in with Vercel" login / user profile banner (entry module is `web/static/js/app.js`; banner built in `web/static/js/api/auth.js` into `#auth-banner`; `GET /api/user/me` drives it. Interactive browser smoke check deferred to tests.md manual plan — Chromium cannot launch in this sandbox)
- [x] 5.2 Implement remaining quota indicator in `web/static/js/api/auth.js` (`#val-quota` status-bar slot; `renderQuota()` wired; `GET /api/user/quota` returns `{spent,remaining,limit}`. Interactive browser smoke check deferred to tests.md)
- [x] 5.3 Implement client-side SSE listener for `user_quota` events updating the quota balance in real-time (handler in `web/static/js/api/streaming.js`; server-side emission verified over HTTP. Browser listener smoke check deferred to tests.md)
- [x] 5.4 Handle HTTP 401 (redirect to login) and HTTP 402 (quota exhausted alert) in frontend API client (`handleAuthError` wired into the `/api/action` and undo paths; server-side 401/402 covered by unit tests. Interactive redirect/alert check deferred to tests.md)

## 6. Vercel Serverless, Edge Config & Documentation

- [x] 6.1 Adapt `web/server.js` to export Express `app` and conditionally listen on port only when not executing under Vercel
- [x] 6.2 Implement serverless entrypoint in `api/index.js` exporting the configured Express application
- [x] 6.3 Configure `vercel.json` with direct CDN static rewrites (`/` and `/static/*`), `api/index.js` rewrite, `maxDuration: 60`, cache-control headers, and strict CSP
- [x] 6.4 Configure `.vercelignore` to exclude tests, docs, diagnostics, scratch, and playgrounds
- [x] 6.5 Update architecture documentation per AGENTS.md (`engine/ARCHITECTURE.md`, `web/FRONTEND_ARCHITECTURE.md`, `tests/ARCHITECTURE.md`)
- [x] 6.6 Run all unit tests (`npm run test:unit`) to confirm all TDD suites pass
