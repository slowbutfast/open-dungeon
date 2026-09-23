# vercel-oauth-auth Specification

## Purpose
Defines the OAuth 2.0 / OIDC authentication flow using "Sign in with Vercel", tamper-proof HMAC session cookie serialization with explicit expiration and security attributes, state CSRF verification, PKCE (RFC 7636) code-interception hardening, and edge route guards.

## MODIFIED Requirements

### Requirement: Vercel OAuth Authorization Initiation
The system SHALL provide an authentication initiation endpoint at `/api/auth/login` that constructs a standard OAuth 2.0 authorization URL directed to Vercel (`https://vercel.com/oauth/authorize`), generates a cryptographically secure random state parameter, stores that state in a signed or HttpOnly cookie, and redirects the user. The initiation SHALL also generate a PKCE code verifier (≥ 43 bytes of base64url randomness), store it in a separate `od_pkce` HttpOnly cookie, and include the corresponding S256 `code_challenge` in the authorization URL.

#### Scenario: User initiates login
- **WHEN** a user navigates to `/api/auth/login`
- **THEN** a 32-byte cryptographic random state is generated and set in an `od_oauth_state` HttpOnly cookie (`Secure; SameSite=Lax; Path=/; Max-Age=600`), a PKCE code verifier is generated and set in an `od_pkce` HttpOnly cookie with the same attributes, and the user is redirected to `https://vercel.com/oauth/authorize` with query parameters `client_id`, `redirect_uri`, `scope=openid email profile offline_access`, `state`, `code_challenge`, and `code_challenge_method=S256`. The authorization redirect SHALL be issued whenever `VERCEL_APP_CLIENT_ID` is configured, including non-`VERCEL=1` local development environments, so the flow can be exercised against a test app without the production flag.

#### Scenario: Login attempted without a configured client id
- **WHEN** a user navigates to `/api/auth/login` and `VERCEL_APP_CLIENT_ID` is unset
- **THEN** the user is redirected to `/?auth_error=oauth_not_configured` without contacting Vercel and without setting either the state or PKCE cookie

### Requirement: OAuth Callback and Code Exchange
The system SHALL provide an authorization callback handler at `/api/auth/callback` that validates the returning state parameter against the stored state cookie, exchanges the authorization code for access tokens via `https://api.vercel.com/login/oauth/token`, and retrieves user identity profile from `https://api.vercel.com/login/oauth/userinfo`. The code exchange SHALL include the PKCE `code_verifier` read from the `od_pkce` cookie, and the callback SHALL clear the PKCE cookie alongside the state cookie once the session is established.

#### Scenario: Valid authorization callback
- **WHEN** Vercel redirects back to `/api/auth/callback` with matching `state` and a valid `code`
- **THEN** the server exchanges the code for tokens including `code_verifier` from the `od_pkce` cookie, extracts the user's Vercel profile (`sub`, `email`, `name`), clears the `od_oauth_state` and `od_pkce` cookies, sets an authenticated `od_session` cookie, and redirects the user to `/`

#### Scenario: CSRF state mismatch
- **WHEN** `/api/auth/callback` is invoked with a `state` query parameter that does not match the `od_oauth_state` cookie
- **THEN** the request is rejected with HTTP 403 Forbidden without contacting the token endpoint

#### Scenario: Authorization code error or rejection
- **WHEN** `/api/auth/callback` receives an `error` query parameter or token exchange fails
- **THEN** the user is redirected to `/?auth_error=oauth_failed` and no session is created

#### Scenario: Missing PKCE verifier cookie on callback
- **WHEN** `/api/auth/callback` is invoked with a valid state but no `od_pkce` cookie
- **THEN** the code exchange proceeds without a `code_verifier`, or is rejected per the token endpoint's PKCE enforcement, and any resulting failure redirects to `/?auth_error=oauth_failed`