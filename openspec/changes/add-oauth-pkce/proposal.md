# Proposal: Add PKCE to the Vercel OAuth flow

## Why

The Vercel OAuth flow ships without Proof Key for Code Exchange (RFC 7636). The
authorization request (`buildAuthorizeUrl`) sends `client_id`, `redirect_uri`,
`response_type`, `scope`, and `state` — no `code_challenge` — and the token exchange
sends no `code_verifier`. OAuth 2.0 Security BCP (RFC 9700) recommends PKCE for all client
types, including confidential clients, to mitigate authorization-code interception. This
change hardens the existing "Sign in with Vercel" flow with minimal surface area, mirroring
the CSRF `state` machinery already in place.

## What Changes

- **`web/auth/session.js`** — add `PKCE_COOKIE = 'od_pkce'`, `generateVerifier()` (43+ byte
  base64url randomness), `challengeFromVerifier(v)` (`base64url(SHA-256(v))`, S256), and
  `createPkceCookie(verifier)` mirroring `createStateCookie`
  (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`).
- **`web/auth/oauth.js`** — `buildAuthorizeUrl` accepts a `codeChallenge` and sets
  `code_challenge` + `code_challenge_method=S256`; `exchangeCodeForToken` accepts a
  `codeVerifier` and adds `code_verifier` to the form body.
- **`web/routes/auth.js`** — `/api/auth/login` generates the verifier and sets both the
  state and PKCE cookies (`Set-Cookie: [createStateCookie(state), createPkceCookie(verifier)]`);
  `/api/auth/callback` reads the verifier from the `od_pkce` cookie, passes it to the
  token exchange, and clears the PKCE cookie alongside the state cookie when the session
  is set.

## Capabilities

### New Capabilities

### Modified Capabilities
- `vercel-oauth-auth`: Authorization initiation gains `code_challenge`/`code_challenge_method=S256`
  and a PKCE verifier cookie; the callback exchange gains `code_verifier` and clears the
  PKCE cookie; the login route sets the PKCE cookie alongside the CSRF state cookie.

## Impact

- **`web/auth/session.js`**: New constants + three small functions (verifier, challenge, cookie).
- **`web/auth/oauth.js`**: `buildAuthorizeUrl` and `exchangeCodeForToken` signatures gain one
  parameter each; both remain pure/injectable (unit-testable offline).
- **`web/routes/auth.js`**: Login sets a second cookie; callback reads + clears it.
- **Tests**: Extend `tests/unit/sessionAuth.test.mjs` and the oauth unit coverage with
  verifier/challenge determinism, authorize-URL param presence, exchange body `code_verifier`,
  and cookie lifecycle.
- **No new dependencies** — uses the existing `crypto` module.

## Verification note

Everything above is testable offline. The one thing that is NOT is whether Vercel's
authorization server accepts PKCE parameters for this confidential client. Before
archiving, verify a real sign-in round-trip on a preview deployment. If Vercel rejects
the extra parameters, fall back to the copy-only option (gate footnote already corrected
in the gate PR).