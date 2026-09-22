# Verification Plan: Vercel Deployment & OAuth Spend Quota

## Automated Tests

- `node --test tests/unit/sessionAuth.test.mjs`:
  - Verifies HMAC-SHA256 session cookie serialization and deserialization with `{ sub, email, name, iat, exp, v: 1 }`.
  - Verifies constant-time signature verification with explicit buffer length guard against timing attacks and length mismatch exceptions.
  - Verifies session rejection when `exp` timestamp is expired.
  - Verifies state cookie generation, storage, and matching validation.
  - Verifies rejection of tampered session payloads and malformed tokens.
- `node --test tests/unit/spendLedger.test.mjs`:
  - Verifies atomic float spend incrementing and balance querying keyed by OpenID `sub`.
  - Verifies spend quota capping at $2.50 lifetime spend per user account.
  - Verifies global project spend cap ($50.00) acting as an automatic kill-switch.
  - Verifies atomic in-flight turn lock (`SET NX EX 30`) and rejection of overlapping turns for the same user.
  - Verifies accurate multi-call token cost calculation across narration, summarization, and extraction using catalog pricing.
- `node --test tests/unit/quotaMiddleware.test.mjs`:
  - Verifies default-deny coverage: `/api/init`, `/api/action`, `/api/summary`, `/api/lore`, `/api/scan`, and `/api/goals/complete` all reject unauthenticated requests with HTTP 401.
  - Verifies all protected routes reject requests with HTTP 402 Payment Required when authenticated user spend >= $2.50.
  - Verifies `/api/user/quota` returns current spend, remaining balance, and limit.
- `node --test tests/unit/sessionManager.test.mjs`:
  - Verifies no engine, directory, or database is created at module import time.
  - Verifies lazy instantiation of `AdventureEngine` per request.
  - Verifies state JSON and SQLite `db.serialize()` buffer round-trip through KV across distinct cold engine instances.
  - Verifies adventures and databases are strictly isolated between distinct user `sub` IDs.
- `node --test tests/unit/vercelEntry.test.mjs`:
  - Verifies `api/index.js` dispatches incoming requests through the Express application.
  - Verifies fail-closed boot checks: throws when `VERCEL === '1'` if `VERCEL_APP_CLIENT_SECRET`, `SESSION_SECRET`, or `OPENROUTER_API_KEY` are missing, or if `MOCK_LLM === '1'`.

## Manual Verification

- **Vercel OAuth Login & Flow**:
  - **WHEN** developer navigates to `/` as an unauthenticated visitor and clicks "Sign in with Vercel"
  - **THEN** browser redirects to `https://vercel.com/oauth/authorize` with valid `client_id`, `state`, and `scope`; upon authorizing, redirects back to `/api/auth/callback`, receives `od_session` cookie, and displays the authenticated terminal with user details and remaining $2.50 quota.
- **Default-Deny Protection on `/api/init`**:
  - **WHEN** an unauthenticated visitor or over-quota user calls `POST /api/init`
  - **THEN** the request fails with HTTP 401 or HTTP 402 without executing the `opening_scene` LLM call.
- **In-Flight Concurrency Rejection**:
  - **WHEN** a user triggers two rapid sequential action turns concurrently
  - **THEN** the second request receives HTTP 429 Too Many Requests, protecting against parallel overspend.
- **Cross-Container Cold-Start Continuity**:
  - **WHEN** a user starts an adventure, makes a turn on a preview deployment, and subsequently executes another turn after a container recycling event
  - **THEN** the adventure state, inventory, and room graph are rehydrated seamlessly from KV without loss of progress.
- **Real-Time Quota Updates via SSE**:
  - **WHEN** a player completes a narration turn
  - **THEN** `res.flushHeaders()` ensures chunks stream immediately, and the remaining quota indicator in the UI decrements dynamically upon receiving the SSE `user_quota` event.
- **Deployed Smoke Check (`curl -I`)**:
  - **WHEN** running `curl -I https://<preview-domain>/static/js/vendor/cytoscape.min.js`
  - **THEN** response headers return `Cache-Control: public, max-age=31536000, immutable`.
  - **WHEN** running `curl -I https://<preview-domain>/static/js/main.js`
  - **THEN** response headers return `Cache-Control: no-cache, no-store, must-revalidate`.
  - **WHEN** inspecting response headers of the main page
  - **THEN** `Content-Security-Policy` matches the configured whitelists without `'unsafe-eval'`.
