# Research: Vercel Deployment, Vercel OAuth, and OpenRouter Spend Quota

## Core Technical Objectives

1. **Vercel Serverless Hosting**: Adapt the Node.js/Express application to run on Vercel without persistent container processes.
2. **Developer OAuth Authentication**: Implement "Sign in with Vercel" (OAuth 2.0 / OIDC) using Vercel's authorization server endpoints, with HMAC-SHA256 session cookies.
3. **Authoritative Lifetime Spend Quota**: Enforce a strict $2.50 lifetime spend ceiling per developer account on OpenRouter LLM completions.
4. **Stateless Serverless Execution**: Solve multi-container ephemeral execution by persisting active game state and SQLite snapshots to Vercel KV per request.
5. **Fail-Closed Security & Concurrency Defense**: Prevent race conditions via in-flight locks, enforce a global project spending kill-switch, eliminate module import side effects, and fail closed in production.

---

## Architectural Findings & Analysis

### 1. Serverless Statelessness: Ephemeral `/tmp` vs. Per-Request KV Persistence
- **The Problem**: In Vercel serverless execution, requests from the same user across sequential turns land on different ephemeral Lambda container instances. An in-memory engine registry or container-local `/tmp` storage cannot guarantee that turn $N+1$ finds the state created in turn $N$. If the container is recycled or cold-started, `/tmp` is empty, causing state loss.
- **The Solution**: 
  - `AdventureState` (`engine/state.js`) already round-trips to pure JSON containing history, summary, lore cards, inventory, location stack, room id, score, and moves.
  - `StructuredStore` (`engine/memory/structuredStore.js`) runs `better-sqlite3`. SQLite supports `db.serialize()`, which exports the entire in-memory/file database into a compact binary Node `Buffer` (~20–80KB).
  - On every request: The `sessionManager` fetches `user:state:<subId>` (JSON) and `user:db:<subId>` (buffer) from Vercel KV, rehydrating the active adventure state and writing/mounting the SQLite database in `/tmp/open-dungeon/${subId}/`.
  - On turn completion: The `sessionManager` persists the updated state JSON to `user:state:<subId>` and `db.serialize()` to `user:db:<subId>`.
  - Vectra Semantic Memory: OpenRouter backend configures `embedding_model: null` (`web/routes/game.js:215-234`), meaning Vectra is inactive and bypassed in OpenRouter production mode.

### 2. Module-Load Side Effects: Cold-Start EROFS Prevention
- **The Problem**: `web/engineInstance.js:3` executes `export let engine = new AdventureEngine();` at module import time. The `AdventureEngine` constructor synchronously executes `mkdirSync` and `new Database()` on `game/data/memory.db`. In Vercel production, `/var/task` is a read-only filesystem, throwing `EROFS: read-only file system` and crashing every route during cold start before any request handler is invoked.
- **The Solution**:
  - Delete `web/engineInstance.js` entirely.
  - Sweep all routers (`web/routes/game.js`, `web/routes/saves.js`, `web/routes/lore.js`, `web/routes/memory.js`) to remove top-level imports of `engine` or `engineInstance.js`.
  - Replace all occurrences with request-scoped engine resolution via `req.engine` (attached by a session/engine middleware).
  - Default all write directories in serverless to `/tmp/open-dungeon/...`.

### 3. Attack Surface & Default-Deny Quota Protection
- **The Problem**: Protecting only `/api/action` leaves critical LLM call sites completely exposed:
  - `/api/init` generates the opening scene via `llmCall('opening_scene', ...)` (`web/routes/game.js:374`). Anyone can spam `/api/init` to drain OpenRouter credits without authentication or quota check.
  - `/api/summary`, `/api/lore`, `/api/scan`, and `/api/goals/complete` also trigger LLM completions.
- **The Solution**: Default-deny architecture.
  - Mount an authentication and quota guard middleware on all LLM-touching routes (`/api/init`, `/api/action`, `/api/summary`, `/api/lore`, `/api/scan`, `/api/goals/complete`).
  - Unauthenticated requests receive HTTP 401 Unauthorized.
  - Requests exceeding the $2.50 limit receive HTTP 402 Payment Required.

### 4. Concurrency, In-Flight Overspend, and Global Spend Ceilings
- **The Problem**:
  - *Race Window*: Checking spend at turn start and incrementing via `HINCRBYFLOAT` at turn end leaves a 5–15 second window where concurrent parallel requests can all pass the check and overspend.
  - *Sybil Attack*: An attacker could generate 100 free Vercel accounts to consume 100 × $2.50 = $250.
- **The Solution**:
  - **In-Flight Lock**: Acquire an atomic lock in KV (`SET user:lock:<subId> 1 NX EX 30`) before processing an LLM turn; release upon turn completion. Reject concurrent turns for the same user with HTTP 429 Too Many Requests.
  - **Global Project Spend Ceiling**: Maintain an authoritative global spend counter in KV (`global:spend:total`). If total project spend exceeds a hard cap (e.g. $50.00), all LLM operations halt immediately (kill-switch).
  - **Provider-Level Hard Limit**: Configure OpenRouter API keys with a hard credit limit in the OpenRouter dashboard as the ultimate external backstop.
  - **Stable Identifier**: Key spend records by OpenID `sub` (`user:spend:<subId>`), which is immutable, rather than email which can be altered on provider accounts.

### 5. Multi-Tenant LLM Tracking
- **The Problem**: `engine/llmTracker.js` stores calls and token totals in module-scoped global variables (`activeCalls = []`, `sessionTotals = {}`). In a serverless container, concurrent or sequential turns across different users share this state, causing token leakage across tenants and corrupting `/api/cost` and `/api/debug/info`.
- **The Solution**: Scope `llmTracker` per `GameEngine` instance, or pass a tenant context to tracker calls so token records, cost calculations, and turn totals are strictly isolated per user.

### 6. Edge Routing, CDN Static Serving, and Caching Controls
- **Express Entrypoint**: Use `api/index.js` exporting the configured Express app. In `vercel.json`, use `rewrites` to route `/api/(.*)` to `/api/index.js`.
- **CDN Static Serving**: Route `/static/(.*)` directly to `/web/static/$1` and `/` to `/web/templates/index.html` in `vercel.json` rewrites. This serves static assets directly from Vercel's global Edge CDN without invoking serverless functions, saving execution cost and eliminating cold-start latency for UI assets.
- **Cache-Control Rules**:
  - Third-party vendor scripts (`/static/js/vendor/(.*)`): `public, max-age=31536000, immutable`.
  - Unbundled app ES modules (`/static/js/(.*)`): `no-cache, no-store, must-revalidate` to prevent stale script caching on edge redeployments.
  - Static media and CSS (`/static/(.*)`): `public, max-age=3600, must-revalidate`.
- **Function Configuration**: Set `"maxDuration": 60` for `api/index.js` in `vercel.json` to allow sufficient time for LLM generation and streaming.
- **SSE Real-Time Streaming**: Call `res.flushHeaders()` when initiating Server-Sent Events on `/api/action` to ensure chunks stream immediately without edge buffering.
- **Session Cookie Specifications**:
  - Payload: `{ sub, email, name, iat, exp, v: 1 }`.
  - Signature: HMAC-SHA256 with constant-time equality check guarded by `Buffer.byteLength(a) === Buffer.byteLength(b)`.
  - Attributes: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800` (7 days).

---

## Glossary of Terms

| Term | Verified Definition |
| :--- | :--- |
| **`Sign in with Vercel`** | Vercel's OAuth 2.0 / OIDC identity provider service allowing users to authenticate using developer accounts. |
| **`sub`** | OpenID Connect Subject Identifier — the stable, unique, immutable identifier for a user account. |
| **`Authoritative Spend Ledger`** | A durable, centralized datastore (Vercel KV / Upstash Redis) holding atomic spend counters, eliminating client-side replay attacks. |
| **`In-Flight Turn Lock`** | An atomic, time-bounded lock in KV (`SET user:lock:<subId> 1 NX EX 30`) that serializes LLM turns per user and closes the parallel overspend window. |
| **`Global Spend Kill-Switch`** | A centralized counter (`global:spend:total`) and boolean guard halting all LLM calls if aggregate project spend exceeds a hard limit ($50.00). |
| **`Per-Request Rehydration`** | Loading user game state JSON and SQLite database buffer from KV at request start, and committing state mutations back to KV at request end. |
| **`Default-Deny Policy`** | Access control principle where all routes capable of incurring financial cost reject unauthenticated or over-quota requests by default. |
