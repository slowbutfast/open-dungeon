// Vercel OAuth 2.0 authentication routes (vercel-deployment-and-auth, task 2.5).
import express from 'express';
import { config } from '../config.js';
import {
    SESSION_COOKIE,
    STATE_COOKIE,
    generateState,
    signSession,
    createSessionCookie,
    createStateCookie,
    clearCookie,
    parseCookieHeader
} from '../auth/session.js';
import { buildAuthorizeUrl, exchangeCodeForToken, fetchUserProfile } from '../auth/oauth.js';

function resolveRedirectUri(req, cfg) {
    if (cfg.appUrl) {
        return new URL('/api/auth/callback', cfg.appUrl).toString();
    }
    const host = req.get('host') || 'localhost';
    const proto = cfg.isVercel ? 'https' : (req.protocol || 'http');
    return `${proto}://${host}/api/auth/callback`;
}

export function createAuthRouter(cfg = config) {
    const router = express.Router();

    router.get('/auth/login', (req, res) => {
        // Gated only on a configured client id so local development (without
        // VERCEL=1) can exercise the full OAuth flow against a test app.
        if (!cfg.vercelClientId) {
            return res.redirect('/?auth_error=oauth_not_configured');
        }
        const state = generateState();
        const redirectUri = resolveRedirectUri(req, cfg);
        res.setHeader('Set-Cookie', createStateCookie(state));
        res.redirect(buildAuthorizeUrl({
            clientId: cfg.vercelClientId,
            redirectUri,
            state
        }));
    });

    router.get('/auth/callback', async (req, res) => {
        const { code, state, error, error_description: errorDescription } = req.query;
        if (error) {
            // Provider-side rejection: log the full pair, surface only the code.
            console.error('OAUTH_CALLBACK_PROVIDER_ERROR', { error, errorDescription });
            return res.redirect('/?auth_error=oauth_failed');
        }

        const cookies = parseCookieHeader(req.headers && req.headers.cookie);
        const storedState = cookies[STATE_COOKIE];
        if (!state || !storedState || state !== storedState) {
            // CSRF: never contact the token endpoint on a state mismatch.
            return res.status(403).send('Forbidden');
        }

        try {
            const redirectUri = resolveRedirectUri(req, cfg);
            const token = await exchangeCodeForToken({
                code,
                clientId: cfg.vercelClientId,
                clientSecret: cfg.vercelClientSecret,
                redirectUri
            });
            const profile = await fetchUserProfile({ accessToken: token.access_token });
            if (!profile.sub) {
                console.error('OAUTH_CALLBACK_NO_SUB', { profileKeys: Object.keys(profile || {}) });
                return res.redirect('/?auth_error=oauth_failed');
            }

            const session = signSession(
                { sub: profile.sub, email: profile.email, name: profile.name },
                cfg.sessionSecret
            );
            res.setHeader('Set-Cookie', [createSessionCookie(session), clearCookie(STATE_COOKIE)]);
            res.redirect('/');
        } catch (err) {
            console.error('OAUTH_CALLBACK_EXCHANGE_FAILED', {
                message: err && err.message,
                redirectUri: resolveRedirectUri(req, cfg)
            });
            res.redirect('/?auth_error=oauth_failed');
        }
    });

    const logout = (req, res) => {
        res.setHeader('Set-Cookie', [clearCookie(SESSION_COOKIE), clearCookie(STATE_COOKIE)]);
        res.redirect('/');
    };
    router.get('/auth/logout', logout);
    router.post('/auth/logout', logout);

    return router;
}

export default createAuthRouter();
