# vercel-oauth-auth Specification

## Purpose
Defines the OAuth 2.0 / OIDC authentication flow using "Sign in with Vercel", tamper-proof HMAC session cookie serialization with explicit expiration and security attributes, state CSRF verification, and edge route guards.

## ADDED Requirements

### Requirement: Vercel OAuth Authorization Initiation
The system SHALL provide an authentication initiation endpoint at `/api/auth/login` that constructs a standard OAuth 2.0 authorization URL directed to Vercel (`https://vercel.com/oauth/authorize`), generates a cryptographically secure random state parameter, stores that state in a signed or HttpOnly cookie, and redirects the user.

#### Scenario: User initiates login
- **WHEN** a user navigates to `/api/auth/login`
- **THEN** a 32-byte cryptographic random state is generated and set in an `od_oauth_state` HttpOnly cookie (`Secure; SameSite=Lax; Path=/; Max-Age=600`), and the user is redirected to `https://vercel.com/oauth/authorize` with query parameters `client_id`, `redirect_uri`, `scope=openid email profile offline_access`, and `state`

### Requirement: OAuth Callback and Code Exchange
The system SHALL provide an authorization callback handler at `/api/auth/callback` that validates the returning state parameter against the stored state cookie, exchanges the authorization code for access tokens via `https://api.vercel.com/login/oauth/token`, and retrieves user identity profile from `https://api.vercel.com/login/oauth/userinfo`.

#### Scenario: Valid authorization callback
- **WHEN** Vercel redirects back to `/api/auth/callback` with matching `state` and a valid `code`
- **THEN** the server exchanges the code for tokens, extracts the user's Vercel profile (`sub`, `email`, `name`), clears the `od_oauth_state` cookie, sets an authenticated `od_session` cookie, and redirects the user to `/`

#### Scenario: CSRF state mismatch
- **WHEN** `/api/auth/callback` is invoked with a `state` query parameter that does not match the `od_oauth_state` cookie
- **THEN** the request is rejected with HTTP 403 Forbidden without contacting the token endpoint

#### Scenario: Authorization code error or rejection
- **WHEN** `/api/auth/callback` receives an `error` query parameter or token exchange fails
- **THEN** the user is redirected to `/?auth_error=oauth_failed` and no session is created

### Requirement: Tamper-Proof Session Cookie Serialization
The system SHALL serialize authenticated user identity into an HttpOnly cookie (`od_session`) signed with HMAC-SHA256 using a configured `SESSION_SECRET`. The payload SHALL include `{ sub, email, name, iat, exp, v: 1 }` and cookie attributes SHALL include `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`. Signature verification SHALL strictly compare byte lengths before executing `crypto.timingSafeEqual` to prevent timing attacks and avoid uncaught length mismatch exceptions, and SHALL verify that `Date.now() / 1000 < exp`.

#### Scenario: Session cookie verification success
- **WHEN** an incoming request includes an unexpired `od_session` cookie with valid signature matching `SESSION_SECRET`
- **THEN** the server verifies the signature in constant time and decodes the user profile object `{ sub, email, name }`

#### Scenario: Session cookie expiration
- **WHEN** an incoming request provides an `od_session` cookie whose `exp` timestamp is in the past
- **THEN** verification rejects the cookie as expired and the request is treated as unauthenticated

#### Scenario: Session cookie forgery or tampering
- **WHEN** an incoming request provides an invalid signature or tampered payload in `od_session`
- **THEN** signature verification fails, the invalid session is ignored, and the request is treated as unauthenticated

### Requirement: User Logout
The system SHALL provide a `/api/auth/logout` endpoint that clears authentication cookies and redirects the user to the landing screen.

#### Scenario: Logging out
- **WHEN** a user posts or navigates to `/api/auth/logout`
- **THEN** the `od_session` and `od_oauth_state` cookies are cleared with expiration dates in the past, and the user is redirected to `/`

### Requirement: Fail-Closed Production Configuration Guard
When running in production on Vercel (`process.env.VERCEL === '1'`), the application configuration module SHALL throw an error and halt initialization if `VERCEL_APP_CLIENT_ID`, `VERCEL_APP_CLIENT_SECRET`, `SESSION_SECRET`, or `OPENROUTER_API_KEY` are not set, or if `LLM_BACKEND !== 'openrouter'` or `MOCK_LLM === '1'`. In local development (`NODE_ENV !== 'production'`), it MAY fall back to a development session mode if secrets are absent.

#### Scenario: Missing credentials or invalid mode in production
- **WHEN** `process.env.VERCEL` is "1" and `MOCK_LLM` is "1" or `OPENROUTER_API_KEY` is missing
- **THEN** the application throws an initialization error and fails closed immediately
