## Source material

- **2026-09-22 User Request**:
  > "how we force a vercel sign before accessing the header page?"
- **2026-09-22 Peer Review (DeepSeek V4.1 Flash)**:
  > "Routing `/` through the function is the only way to enforce anything server-side — right now `vercel.json:10` serves `web/templates/index.html` straight off the CDN, so the Express app never sees root. `includeFiles: "web/templates/**"` is also necessary, not optional: `res.sendFile` is a dynamic path at `web/server.js:77`, so Node File Trace can't discover the template, and the lambda would 404/ENOENT without it."
  > "Option C is not a lockout... Option A's sign-out is a UX trap... Recommendation: Option B. Server-render a gate page at `/` instead of redirecting... because `/` always returns content (gate or app) and never 302s, the entire redirect-loop class disappears."

### Raised but not acted on

- **Option A (Direct 302 redirect on unauthenticated root)**: Deliberately rejected because edge proxy caching, third-party cookie blocking, and post-logout redirects cause infinite OAuth loops.
- **Option C (Client-side modal lockout)**: Deliberately rejected because static HTML and presets are sent unauthenticated to the client before JavaScript runs.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Access Gate | Server-rendered HTML view (`web/templates/gate.html`) displayed to unauthenticated visitors at `GET /` prompting for Vercel OAuth login. | An HTTP 302 redirect loop or a client-side JavaScript overlay. |
| Header / Startup Page | The primary application entry point (`web/templates/index.html`) containing the startup menu, title banner, preset selector, and simulation controls. | An HTTP header or an independent `/header` route. |
| Fail-Closed Diagnostic | Response returned by Express when production environment variables are missing on Vercel. | An unhandled exception or crash of the lambda runtime. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| Vercel Functions Config Docs | `functions.<entrypoint>.includeFiles` bundles static files that are dynamically referenced by serverless handlers. | MIT / Public Docs | 2026-09-22 |
| Vercel Rewrites Docs | Rewriting `{ "source": "/", "destination": "/api/index.js" }` directs root requests to the Express serverless function while preserving path. | MIT / Public Docs | 2026-09-22 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Option A: Automatic 302 Redirect | Rejected | Induces redirect loops when session cookies are rejected; breaks sign-out workflow. | 2026-09-22 |
| Option B: Server-Rendered Gate Screen | Adopted | Returns HTTP 200 reliably, eliminates redirect loops, gives a clean landing page for unauthenticated visitors and sign-out. | 2026-09-22 |
| Option C: Client-Side DOM Lockout | Rejected | Insecure: transmits full HTML and template payload over the wire before login. | 2026-09-22 |

## Patterns adopted

- **Server-Side View Gating**: Gating at `GET /` inside Express based on `req.user` attached by `createAttachUserMiddleware(cfg)`.
- **Static Assets on CDN**: Leaving `/static/(.*)` routed directly to `/web/static/$1` so stylesheets, fonts, and scripts load without serverless invocation.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Vercel rewrites `/` to static HTML currently | `{ "source": "/", "destination": "/web/templates/index.html" }` | Read `vercel.json` | 2026-09-22 | stable |
| `createAttachUserMiddleware` populates `req.user` from `od_session` cookie | `user` or `null` on Vercel, `LOCAL_DEV_USER` in local dev | Read `web/middleware/auth.js` | 2026-09-22 | stable |
| Cost and session APIs already default-deny unauthenticated requests | Returns 401 via `resolveEngine` / `requireAuth` | Grepped `web/routes/game.js`, `user.js` | 2026-09-22 | stable |
| `res.sendFile` requires bundling templates in Vercel functions | `includeFiles: "web/templates/**"` | Vercel documentation & peer review | 2026-09-22 | stable |

## Unverified assumptions

| Assumption | Confidence | Verification Cost |
| :--- | :--- | :--- |
| Vercel edge CDN respects `rewrites` with function destinations for root `/` | High | Tested in `vercelEntry.test.mjs` and verified after deployment |

## Superseded claims

| Prior Belief | Why Wrong | Replacement |
| :--- | :--- | :--- |
| Auto-redirecting (302) `/` to `/api/auth/login` is the best approach | Infinite loop on cookie misconfiguration and prevents clean sign-out | Option B: Render `gate.html` at `GET /` when `!req.user` |

## Links out

- [Vercel Deployment & Auth Architecture](file:///home/node/global-sandbox/projects/open-dungeon/web/FRONTEND_ARCHITECTURE.md)
- [Auth Routes](file:///home/node/global-sandbox/projects/open-dungeon/web/routes/auth.js)
