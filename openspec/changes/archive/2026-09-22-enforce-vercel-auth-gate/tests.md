## Automated Tests

- `node --test tests/unit/vercelEntry.test.mjs`:
  - **Unauthenticated Vercel Root Access**: Verifies that when `config.isVercel` is true and no session cookie is provided, `GET /` responds with HTTP 200 containing the retro-terminal access gate HTML (`[ OPENDUNGEON // ACCESS CONTROL ]` and `/api/auth/login` sign-in link).
  - **Authenticated Vercel Root Access**: Verifies that when `config.isVercel` is true and a valid signed `od_session` cookie is sent, `GET /` responds with HTTP 200 containing the main game simulation markup (`index.html`).
  - **Local Development Pass-through**: Verifies that when running in local development mode (`config.isVercel` is false), `GET /` responds with HTTP 200 serving `index.html` without requiring any session cookie or authentication.
  - **Vercel Configuration Rewrites**: Verifies that `vercel.json` contains rewrites mapping `/` and `/api/(.*)` to `api/index.js`, maps `/static/(.*)` to `/web/static/$1`, and configures `"includeFiles": "web/templates/**"`.
- `node --test tests/unit/auth.test.mjs`:
  - Verifies that session cookie generation, verification, and logout routes function properly with valid and tampered HMAC signatures.

## Manual Verification

- **Unauthenticated Root Access in Production**:
  - **WHEN** opening `https://open-dungeon-three.vercel.app/` in a fresh incognito browser window without active cookies
  - **THEN** the browser displays the retro-terminal CRT access gate with amber/green phosphor styling, scanline effects, header text `[ OPENDUNGEON // ACCESS CONTROL ]`, and a prominent `[ Sign in with Vercel ]` button. The simulation startup menu, narrative presets, and game console are not rendered.

- **Vercel Sign-In Flow**:
  - **WHEN** clicking the `[ Sign in with Vercel ]` button on the gate screen
  - **THEN** the browser navigates to `/api/auth/login`, redirects to the Vercel OAuth authorization screen, and upon approval redirects back via `/api/auth/callback` to `/` with an `od_session` cookie set, loading the full simulation startup screen and header.

- **OAuth Error Display**:
  - **WHEN** navigating directly to `/?auth_error=oauth_failed` or `/?auth_error=oauth_not_configured`
  - **THEN** the gate screen renders an alert banner detailing the error message without triggering an automatic redirect loop.

- **Local Development Experience**:
  - **WHEN** running `npm start` locally and visiting `http://localhost:3000/`
  - **THEN** the main simulation screen (`index.html`) loads immediately without any gate screen or OAuth prompt.
