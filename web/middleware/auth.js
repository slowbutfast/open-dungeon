// Request authentication middleware (vercel-deployment-and-auth, task 2.4).
//
// Verifies the signed `od_session` cookie and attaches the decoded identity to
// `req.user`. Outside Vercel a credential-free local development session is
// assumed so the single-user local workflow keeps working.
import { SESSION_COOKIE, verifySession, parseCookieHeader } from '../auth/session.js';

export const LOCAL_DEV_USER = {
    sub: 'local-dev',
    email: null,
    name: 'Local Developer',
    local: true
};

export function createAttachUserMiddleware(config) {
    return (req, res, next) => {
        const cookies = parseCookieHeader(req.headers && req.headers.cookie);
        const token = cookies[SESSION_COOKIE];
        const user = token ? verifySession(token, config.sessionSecret) : null;

        if (user) {
            req.user = user;
        } else if (!config.isVercel) {
            req.user = { ...LOCAL_DEV_USER };
        } else {
            req.user = null;
        }
        next();
    };
}
