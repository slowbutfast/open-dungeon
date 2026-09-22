# Proposal: Vercel Deployment and Vercel OAuth Spend Quota Enforcement

## Why

Deploying OpenDungeon to public infrastructure exposes its backend to automated exploitation and free OpenRouter credit exhaustion. To safely host the game on Vercel without requiring users to supply their own API keys, the application requires developer-grade authentication via "Sign in with Vercel" (OAuth 2.0 / OIDC), a tamper-proof lifetime spend ceiling of $2.50 per developer account, and an overarching global spend kill-switch. Furthermore, running OpenDungeon in Vercel's ephemeral serverless environment requires eliminating import-time filesystem side effects, synchronizing adventure state and SQLite snapshots to durable KV per request, and securing edge delivery with robust Content Security Policy and caching headers.

## What Changes

- **Add Vercel OAuth 2.0 / OIDC Authentication Flow**: Implement login, callback exchange, user profile extraction, and logout handlers using Vercel's authorization endpoints (`/oauth/authorize`, `/api/vercel.com/login/oauth/token`, `/api/vercel.com/login/oauth/userinfo`). Enforce CSRF protection with cryptographic state cookies and verify state before code exchange.
- **Implement Tamper-Proof Session Cookie Serialization**: Issue HMAC-SHA256 signed session cookies (`od_session`) containing `{ sub, email, name, iat, exp, v: 1 }` with explicit attributes (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`). Verify signatures using length-checked constant-time equality (`crypto.timingSafeEqual`) and validate session expiration.
- **Default-Deny Quota & Concurrency Enforcement**: Gate all cost-incurring endpoints (`/api/init`, `/api/action`, `/api/summary`, `/api/lore`, `/api/scan`, `/api/goals/complete`) behind authentication and quota verification. Acquire an in-flight lock (`SET user:lock:<subId> 1 NX EX 30`) to eliminate parallel race-condition overspending.
- **Authoritative Spend Ledger & Global Kill-Switch**: Maintain per-user spend records (`user:spend:<subId>`) in durable Vercel KV / Upstash Redis with atomic float increments (`HINCRBYFLOAT`). Enforce a $2.50 lifetime cap per user account. Enforce an overarching global project ceiling (`global:spend:total` capped at $50.00) acting as an automatic kill-switch. Provide local memory/file fallbacks for local development.
- **Dynamic Quota Deduction & SSE Live Updates**: Calculate turn cost across all LLM operations in the turn (narration, summarization, extraction). In serverless action streaming (`/api/action`), emit remaining balance updates through Server-Sent Events (`data: {"type": "user_quota", "remaining": ...}`) after calling `res.flushHeaders()`.
- **Eliminate Module-Load Side Effects & Multi-Tenant KV State**: Delete `web/engineInstance.js` and eliminate all import-time database creations or disk writes. Implement request-scoped engine management via `sessionManager`, synchronizing `engine.state` (JSON) and `StructuredStore` (SQLite `db.serialize()` buffer) to Vercel KV on each turn so cold starts and container re-routing never lose user progress.
- **Vercel Serverless Function & Edge CDN Routing**: Introduce `api/index.js` exporting the Express application. Configure `vercel.json` with CDN rewrites for `/` and `/static/*`, unbundled JS `no-cache` rules, immutable vendor script caching, function `maxDuration: 60`, and restrictive Content Security Policy headers. Exclude `playgrounds/` from edge deployment via `.vercelignore`.
- **Production Fail-Closed Validation**: When running on Vercel (`process.env.VERCEL === '1'`), assert that `MOCK_LLM !== '1'`, `LLM_BACKEND === 'openrouter'`, `OPENROUTER_API_KEY`, `VERCEL_APP_CLIENT_SECRET`, and `SESSION_SECRET` are present; otherwise fail closed on boot.

## Capabilities

### New Capabilities
- `vercel-oauth-auth`: End-to-end OAuth 2.0 / OIDC authentication flow with Vercel authorization servers, CSRF state verification, HMAC-SHA256 signed session cookies with explicit expiry and security flags, and login/logout edge integration.
- `spend-quota-enforcement`: Per-user $2.50 lifetime spend ceiling tracking keyed by OpenID `sub`, global $50.00 project spend kill-switch, atomic KV increments, in-flight concurrency locking, default-deny route protection, and real-time SSE quota reporting.
- `serverless-edge-deployment`: Vercel serverless entrypoint `api/index.js`, CDN static routing, granular Cache-Control headers, function execution timeout configuration, and production environment fail-closed configuration.

### Modified Capabilities
- `game-engine`: Serverless statelessness adaptation, removing import-time side effects, deleting `web/engineInstance.js`, and rehydrating/persisting state and SQLite snapshots per request via `sessionManager` and KV.

## Impact

- **Web Server (`web/server.js`)**: Express app exported for serverless consumption; server bootstrap conditional on direct script execution; delete `web/engineInstance.js`.
- **API Routes (`web/routes/`)**: Added `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`, and `/api/user/quota` endpoints; default-deny auth and quota middleware applied to `/api/init`, `/api/action`, `/api/summary`, `/api/lore`, etc.
- **Game Engine (`engine/index.js`, `engine/sessionManager.js`)**: Engine instantiated lazily per request, with state and SQLite database rehydrated from and committed to KV.
- **LLM Tracking (`engine/llmTracker.js`)**: Pricing catalog lookup table and exact turn cost calculation summing all LLM calls in a turn, scoped per request context.
- **Frontend UI (`web/static/js/`)**: Authentication sign-in/profile banner, remaining quota indicator, and SSE `user_quota` event listener.
- **Configuration & Infrastructure**: Added `vercel.json`, `.vercelignore`, and `api/index.js`.
