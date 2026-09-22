# access-gate Specification

## Purpose
Describes how the OpenDungeon web app gates access to the simulation interface on Vercel: unauthenticated visitors are met with a server-rendered retro-terminal access gate at `GET /` instead of the application, while authenticated sessions and local development proceed to the full interface.
## Requirements
### Requirement: Server-Rendered Access Gate
When deployed on Vercel (`config.isVercel` is true), the Express server at `GET /` SHALL verify whether the request has an authenticated session (`req.user`). If the request is unauthenticated, the server SHALL serve `web/templates/gate.html` with HTTP status 200, presenting the retro-terminal access control screen and a sign-in trigger pointing to `/api/auth/login`.

#### Scenario: Unauthenticated visitor accessing root on Vercel
- **WHEN** an unauthenticated client sends `GET /` on Vercel without a valid `od_session` cookie
- **THEN** the server returns HTTP 200 with the contents of `web/templates/gate.html`, displaying `ACCESS CONTROL` and an explicit `Sign in with Vercel` button

#### Scenario: Authenticated user accessing root on Vercel
- **WHEN** a client sends `GET /` on Vercel with a valid, signed `od_session` cookie
- **THEN** the server returns HTTP 200 with the contents of `web/templates/index.html`, revealing the full startup menu and simulation interface

#### Scenario: Local development root access
- **WHEN** a client sends `GET /` in a local development environment (`VERCEL !== '1'`)
- **THEN** the server returns HTTP 200 with `web/templates/index.html` without requiring Vercel authentication

#### Scenario: Gate responses are not shared between sessions
- **WHEN** any client sends `GET /`
- **THEN** the response carries `Cache-Control: private, no-store` and `Vary: Cookie`, so no shared cache can serve an authenticated document to an anonymous visitor

### Requirement: Access Gate Error Notice
`web/templates/gate.html` SHALL display an error alert banner when the URL search parameters contain `auth_error`, informing the operator of the specific authentication failure without triggering redirect loops. The banner SHALL be rendered by the external module `/static/js/gate.js` (loaded via `<script type="module">`), never by an inline script, so it remains functional under the site-wide `script-src 'self'` Content Security Policy.

#### Scenario: Displaying OAuth error on access gate
- **WHEN** a client loads `/` with `?auth_error=oauth_failed` or `?auth_error=oauth_not_configured`
- **THEN** `gate.html` renders a visible error banner indicating the authentication problem and prompts the operator to retry

