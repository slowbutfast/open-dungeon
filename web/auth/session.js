// HMAC-SHA256 signed session cookies (vercel-deployment-and-auth, task 2.2).
//
// A session is `<base64url(payload)>.<base64url(HMAC)>`. Verification is
// constant-time with an explicit byte-length guard (crypto.timingSafeEqual
// throws on length mismatch) and enforces the `exp` timestamp.
import crypto from 'crypto';

export const SESSION_COOKIE = 'od_session';
export const STATE_COOKIE = 'od_oauth_state';

export const SESSION_TTL_SECONDS = 604800; // 7 days
export const STATE_TTL_SECONDS = 600;      // 10 minutes

function base64url(buf) {
    return Buffer.from(buf).toString('base64url');
}

function hmac(body, secret) {
    return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

/**
 * Serialize a user identity into a signed session token. The payload shape is
 * fixed at `{ sub, email, name, iat, exp, v: 1 }`.
 */
export function signSession(user, secret, { ttlSeconds = SESSION_TTL_SECONDS, now = Date.now() } = {}) {
    if (!secret) throw new Error('signSession requires a SESSION_SECRET');
    if (!user || !user.sub) throw new Error('signSession requires a user with a sub');

    const iat = Math.floor(now / 1000);
    const payload = {
        sub: user.sub,
        email: user.email ?? null,
        name: user.name ?? null,
        iat,
        exp: iat + ttlSeconds,
        v: 1
    };
    const body = base64url(JSON.stringify(payload));
    return `${body}.${hmac(body, secret)}`;
}

/**
 * Verify a session token. Returns the decoded payload or null when the token
 * is malformed, tampered, signed with the wrong secret, or expired.
 */
export function verifySession(token, secret, { now = Date.now() } = {}) {
    if (typeof token !== 'string' || !secret) return null;
    const dot = token.lastIndexOf('.');
    if (dot <= 0 || dot === token.length - 1) return null;

    const body = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    const expected = hmac(body, secret);

    const providedBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    // Constant-time comparison requires equal byte lengths; the guard prevents
    // both a timing side-channel and a timingSafeEqual runtime throw.
    if (providedBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

    let payload;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (!payload || typeof payload !== 'object') return null;
    if (payload.v !== 1 || !payload.sub) return null;
    if (typeof payload.exp !== 'number' || now / 1000 >= payload.exp) return null;

    return payload;
}

/** Cryptographically secure OAuth state (32 random bytes, hex). */
export function generateState() {
    return crypto.randomBytes(32).toString('hex');
}

export function createSessionCookie(token, { maxAge = SESSION_TTL_SECONDS } = {}) {
    return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function createStateCookie(state, { maxAge = STATE_TTL_SECONDS } = {}) {
    return `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearCookie(name) {
    return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Parse a Cookie request header into a plain name→value object. */
export function parseCookieHeader(header) {
    const out = {};
    if (!header || typeof header !== 'string') return out;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        const name = part.slice(0, eq).trim();
        if (!name) continue;
        out[name] = part.slice(eq + 1).trim();
    }
    return out;
}
