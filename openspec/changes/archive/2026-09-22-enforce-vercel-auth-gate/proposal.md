## Why

Currently, when deployed to Vercel, the root path (`/`) is served statically off Vercel's CDN, exposing the full game startup interface, story presets, and character generator to unauthenticated visitors before they sign in. Requiring authentication before accessing the application interface ensures that only authenticated operators can view or interact with the game simulation, without relying on client-side visual overlays or introducing redirect loops.

## What Changes

- Route `GET /` through the Express serverless function on Vercel instead of bypassing it to static CDN hosting.
- Provide a server-rendered retro-terminal access gate (`web/templates/gate.html`) at `GET /` for unauthenticated visitors on Vercel, displaying an explicit "Sign in with Vercel" trigger.
- Serve the full game simulation interface (`web/templates/index.html`) only when the visitor possesses a valid, signed `od_session` cookie (or when running in local development mode).
- Bundle `web/templates/**` in the Vercel serverless function package via `includeFiles` in `vercel.json`.
- Preserve fast CDN caching for static assets (`/static/*`).

## Capabilities

### New Capabilities
- `access-gate`: Server-rendered authentication barrier at `GET /` for unauthenticated visitors, presenting a retro-terminal login interface and preventing unauthorized access to the application menu.

### Modified Capabilities
- `serverless-edge-deployment`: The root route `/` routes to the serverless function `api/index.js` rather than being directly served as a static HTML rewrite.

## Impact

- **Routing & Packaging**: `vercel.json` rewrites and function packaging (`includeFiles`).
- **Server Entrypoint & Root Route**: `web/server.js` (`app.get('/')`).
- **Templates**: New `web/templates/gate.html` styled to match the CRT phosphor aesthetic.
- **Testing**: `tests/unit/vercelEntry.test.mjs` test cases for access gate rendering, authenticated pass-through, and local development fallback.
