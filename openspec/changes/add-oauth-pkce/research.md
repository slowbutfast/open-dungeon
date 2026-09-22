## Source material

### 2026-09-22 — Peer engineering review of `enforce-vercel-auth-gate` (Greg L., in-repo work order)

The review that produced this change identified that the shipped OAuth flow does not
implement PKCE, despite the access gate's footnote advertising `PROTOCOL :: OAUTH 2.0 + PKCE`:

- `web/auth/oauth.js:10` — `buildAuthorizeUrl` sends `client_id`, `redirect_uri`,
  `response_type`, `scope`, and `state`, but no `code_challenge`.
- `web/auth/oauth.js:20` — `exchangeCodeForToken` posts `grant_type`, `code`,
  `client_id`, `client_secret`, `redirect_uri`; no `code_verifier`.
- `web/routes/auth.js:28` — `/api/auth/login` sets only the state cookie.
- `web/routes/auth.js:44` — `/api/auth/callback` verifies state but has no verifier to
  pass into the exchange.

Two options were scoped:

1. **Fast** — drop `+ PKCE` from the gate footnote (`web/templates/gate.html`) and ship
   no PKCE. Zero risk, but the flow stays vulnerable to authorization-code interception
   by a downgrade / malicious client swapping in its own code.
2. **Right** — add PKCE (S256) as a follow-up change against the `vercel-oauth-auth`
   capability. This is the capability change this document proposes.

The fast option's copy fix (`PROTOCOL :: OAUTH 2.0`) was already applied to the gate PR so
this change can proceed on its own merit rather than on what a footnote claims.

### Raised but not acted on

- **Confidential-client exemption**: The reviewer explicitly flagged that Vercel's
  authorization server may reject extra PKCE parameters for a confidential client (one
  that already authenticates with `client_secret`). If that happens, the PKCE parameters
  are harmless to the request but could cause an authorization error. This is the one
  aspect that CANNOT be verified offline — it requires a real sign-in round-trip against
  `https://vercel.com/oauth/authorize`. If Vercel rejects it, fall back to the copy change.
- **State vs PKCE redundancy**: Both `state` (CSRF) and PKCE (code interception) protect
  overlapping parts of the flow. This change keeps both — PKCE does not replace state.
- **Nonce / ID token validation**: Not in scope. Vercel returns a profile via the
  `userinfo` endpoint; full OIDC `nonce` validation is a separate hardening change.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| PKCE | Proof Key for Code Exchange (RFC 7636) — the client derives a `code_verifier` (high-entropy secret) and sends only its SHA-256 hash (`code_challenge`) to the authorization server, then proves knowledge of the verifier at the token exchange. | A replacement for the CSRF `state` parameter. It binds the code to the client that started the flow; `state` binds the callback to the browser session that initiated it. |
| code_challenge (S256) | `base64url(SHA-256(code_verifier))`, sent on the authorize request as `code_challenge` + `code_challenge_method=S256`. | The verifier itself. The verifier is never sent to the authorization server. |
| code_verifier | A cryptographically random string, ≥ 43 chars per RFC 7636, stored in an HttpOnly cookie so the callback can re-send it to the token endpoint. | A value derivable by an attacker who can read the page DOM. It must live in an HttpOnly cookie, mirroring `od_oauth_state`. |
| Confidential client | An OAuth client that authenticates to the token endpoint with `client_secret`. Vercel app integrations are treated as confidential clients. | A public client (mobile/native/SPA) where PKCE is mandatory. |

## External research

- **RFC 7636 — Proof Key for Code Exchange (PKCE)**: September 2015, IETF. Defines
  `code_verifier` (43–128 ASCII chars), `code_challenge` = `S256` (`BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))`) or plain, and the token-endpoint `code_verifier`
  requirement. Specifies the `code_challenge` / `code_challenge_method` authorize params.
  Applicable to confidential clients as a defense-in-depth layer against
  authorization-code interception, per OAuth 2.0 Security BCP (RFC 9700 §3.2.1, Dec 2025).
- **RFC 9700 — OAuth 2.0 Security Best Current Practice**: December 2025, IETF. Section
  3.2.1 recommends PKCE for ALL client types, including confidential clients, to mitigate
  authorization-code interception. This is the authoritative basis for adding PKCE here
  even though the client is confidential.
- **Failed lookup**: No public Vercel documentation explicitly confirming whether
  `/oauth/authorize` + `/login/oauth/token` accept PKCE parameters for confidential
  clients. Vercel's OAuth docs describe the basic code flow; PKCE support must be verified
  empirically against a live round-trip (recorded under "Unverified assumptions").

## Candidate tech

- **Adopted**: PKCE via the standard `crypto` module — `crypto.randomBytes` for the
  verifier, `crypto.createHash('sha256')` for the challenge. No new dependency; matches
  the existing `web/auth/session.js` HMAC implementation.
- **Rejected**: `pkce-challenge` npm package. Adds a dependency for two ~5-line functions
  the repo can own in `web/auth/session.js`, consistent with the existing zero-dependency
  auth module.

## Patterns adopted

- Mirror the existing state-cookie pattern: `STATE_COOKIE`/`createStateCookie` becomes the
  template for `PKCE_COOKIE`/`createPkceCookie` — same `HttpOnly; Secure; SameSite=Lax;
  Path=/; Max-Age=600` attributes, same 10-minute TTL.
- `challengeFromVerifier` uses the same `base64url` encoding already used for session
  payloads (no new encoding code).

## Verified facts

| Claim | How verified |
| :--- | :--- |
| `buildAuthorizeUrl` sends no PKCE params | Read `web/auth/oauth.js:10-18`. |
| `exchangeCodeForToken` sends no `code_verifier` | Read `web/auth/oauth.js:20-37`. |
| `/api/auth/login` sets only the state cookie | Read `web/routes/auth.js:28-42`. |
| `/api/auth/callback` passes no verifier to the exchange | Read `web/routes/auth.js:44-79`. |
| Gate footnote claimed `OAUTH 2.0 + PKCE`; now `OAUTH 2.0` | `web/templates/gate.html` — copy fix applied in the gate PR. |
| `createStateCookie` sets `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600` | Read `web/auth/session.js:85-87`. |
| Repo session serialization is already base64url via `crypto` | Read `web/auth/session.js:14-16`. |

## Unverified assumptions

| Belief | What checking costs |
| :--- | :--- |
| Vercel's `/oauth/authorize` accepts `code_challenge` + `code_challenge_method=S256` for a confidential client | One real sign-in round-trip on a preview deployment; can NOT be done offline. If it errors, fall back to the copy-only option. |
| Vercel's `/login/oauth/token` requires `code_verifier` when the authorize request carried `code_challenge` | Same live round-trip. RFC 7636 §4.5 requires it; Vercel's conformance is the unknown. |
| Vercel does not already require PKCE, i.e. adding it is an additive hardening, not a fix for a broken flow | Read: current flow exchanges codes fine in production (per deployment history). |

## Superseded claims

| Original claim | Why wrong | Resolution |
| :--- | :--- | :--- |
| Gate footnote `OAUTH 2.0 + PKCE` accurately describes the shipped flow | `buildAuthorizeUrl`/`exchangeCodeForToken` implement no PKCE at all | Footnote corrected to `OAUTH 2.0` in the gate PR; PKCE tracked as this separate capability change |

## Links out

- RFC 7636: https://www.rfc-editor.org/rfc/rfc7636
- RFC 9700: https://www.rfc-editor.org/rfc/rfc9700
- Vercel OAuth docs: https://vercel.com/docs/oauth