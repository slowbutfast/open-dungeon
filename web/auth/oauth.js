// Vercel OAuth 2.0 / OIDC wire helpers (vercel-deployment-and-auth, task 2.3).
//
// Pure builders/exchangers: every function takes an injectable `fetchImpl` so
// the flow can be unit-tested without hitting Vercel.
export const VERCEL_AUTHORIZE_URL = 'https://vercel.com/oauth/authorize';
export const VERCEL_TOKEN_URL = 'https://api.vercel.com/login/oauth/token';
export const VERCEL_USERINFO_URL = 'https://api.vercel.com/login/oauth/userinfo';
export const OAUTH_SCOPE = null;

export function buildAuthorizeUrl({ clientId, redirectUri, state, scope = OAUTH_SCOPE, codeChallenge, codeChallengeMethod = 'S256' }) {
    const url = new URL(VERCEL_AUTHORIZE_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    if (scope) {
        url.searchParams.set('scope', scope);
    }
    if (codeChallenge) {
        url.searchParams.set('code_challenge', codeChallenge);
        url.searchParams.set('code_challenge_method', codeChallengeMethod);
    }
    url.searchParams.set('state', state);
    return url.toString();
}

export async function exchangeCodeForToken({ code, clientId, clientSecret, redirectUri, codeVerifier, fetchImpl = fetch }) {
    const params = {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
    };
    if (codeVerifier) {
        params.code_verifier = codeVerifier;
    }
    const res = await fetchImpl(VERCEL_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        },
        body: new URLSearchParams(params).toString()
    });
    if (!res.ok) {
        const detail = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
        throw new Error(`Vercel token exchange failed (${res.status}) ${detail}`.trim());
    }
    return res.json();
}

export async function fetchUserProfile({ accessToken, fetchImpl = fetch }) {
    const res = await fetchImpl(VERCEL_USERINFO_URL, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
        }
    });
    if (!res.ok) {
        const detail = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
        throw new Error(`Vercel userinfo request failed (${res.status}) ${detail}`.trim());
    }
    const profile = await res.json();
    if (!profile.sub) {
        // Claim KEYS only — never values; the payload carries PII.
        console.error('OAUTH_USERINFO_NO_SUB', { claimKeys: Object.keys(profile || {}) });
    }
    return {
        sub: profile.sub,
        email: profile.email ?? null,
        name: profile.name ?? profile.preferred_username ?? null
    };
}
