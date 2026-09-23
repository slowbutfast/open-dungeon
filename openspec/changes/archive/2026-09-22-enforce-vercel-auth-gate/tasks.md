# Tasks: Enforce Vercel Sign-In Before Accessing the Main Page

## Target Context Map

| Target File | Target Lines | Modification Summary |
|-------------|--------------|----------------------|
| `tests/unit/vercelEntry.test.mjs` | L130–L165 | Add unit tests verifying `GET /` serves `gate.html` when unauthenticated on Vercel, serves `index.html` when authenticated with `od_session`, and serves `index.html` unconditionally in local development mode. Also verify `vercel.json` rewrites and function packaging. |
| `web/templates/gate.html` | L1–L120 (new file) | Create dedicated retro-terminal access gate screen styled with phosphor CRT effects, amber accents, `[ OPENDUNGEON // ACCESS CONTROL ]` header, `[ Sign in with Vercel ]` action trigger, and URL query parameter error display (`auth_error`). |
| `web/server.js` | L75–L80 | Update `GET /` route to check `cfg.isVercel && !req.user`. If true, serve `templates/gate.html`. Otherwise serve `templates/index.html`. |
| `vercel.json` | L3–L12 | Add `"includeFiles": "web/templates/**"` to `api/index.js` function configuration. Update rewrites to route `/` to `api/index.js` rather than statically serving `index.html`. |
| `web/FRONTEND_ARCHITECTURE.md` | L228–L240 | Update documentation describing server-rendered gated access model, `/` rewrite through `api/index.js`, and preserving static CDN caching for `/static/*`. |

---

## 1. Test Scaffolding (TDD)

- [x] 1.1 Scaffold failing unit tests in `tests/unit/vercelEntry.test.mjs` for unauthenticated `GET /` access under Vercel configuration (`cfg.isVercel = true`), asserting HTTP 200 response with `gate.html` content (`[ OPENDUNGEON // ACCESS CONTROL ]` and `/api/auth/login`).
- [x] 1.2 Scaffold failing unit tests in `tests/unit/vercelEntry.test.mjs` for authenticated `GET /` access under Vercel configuration with signed `od_session` cookie, asserting HTTP 200 response with `index.html` content.
- [x] 1.3 Scaffold unit tests in `tests/unit/vercelEntry.test.mjs` verifying local development mode (`cfg.isVercel = false`) passes through `GET /` to `index.html` without requiring credentials or session cookies.
- [x] 1.4 Scaffold test in `tests/unit/vercelEntry.test.mjs` asserting `vercel.json` rewrites `/` to `/api/index.js` and configures `functions["api/index.js"].includeFiles` with `web/templates/**`.

## 2. Access Gate Template & Styling

- [x] 2.1 Create `web/templates/gate.html` with responsive retro-terminal CRT scanlines, CRT flicker animations, and phosphor text styling consistent with OpenDungeon's visual aesthetic.
- [x] 2.2 Add `[ OPENDUNGEON // ACCESS CONTROL ]` header, system status notice, and prominent action button linking to `/api/auth/login` (`[ Sign in with Vercel ]`).
- [x] 2.3 Implement inline client script in `gate.html` reading `window.location.search` for `auth_error` parameter and displaying an amber error notice block when present (e.g. `oauth_failed`, `oauth_not_configured`) without auto-redirecting.

## 3. Server Route Gating & Packaging

- [x] 3.1 Update `web/server.js` `GET /` route to evaluate `cfg.isVercel && !req.user`, serving `gate.html` for unauthenticated requests and `index.html` for authenticated or local requests.
- [x] 3.2 Update `vercel.json` functions configuration to include `"includeFiles": "web/templates/**"` under `api/index.js`.
- [x] 3.3 Update `vercel.json` rewrites mapping `{ "source": "/", "destination": "/api/index.js" }`.

## 4. Verification & Documentation

- [x] 4.1 Run unit test suite `node --test tests/unit/vercelEntry.test.mjs` and confirm all tests pass.
- [x] 4.2 Run existing auth unit tests `node --test tests/unit/auth.test.mjs` to ensure no regression in session token handling. *(Task path is stale — `tests/unit/auth.test.mjs` does not exist. Ran the actual auth unit suite `tests/unit/sessionAuth.test.mjs`: 18/18 pass.)*
- [x] 4.3 Update `web/FRONTEND_ARCHITECTURE.md` to reflect the server-rendered access gate architecture and Vercel routing changes.
