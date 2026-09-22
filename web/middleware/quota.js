// Default-deny authentication + spend quota guard
// (vercel-deployment-and-auth, task 3.4).
import { spendLedger } from '../kvStore.js';

/** Reject any request without a resolved identity (HTTP 401). */
export function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

export function getLedger(req) {
    return (req.app && req.app.locals && req.app.locals.ledger) || spendLedger;
}

/**
 * Reject when the project kill-switch has tripped (503) or the authenticated
 * user has exhausted their lifetime ceiling (402). Runs after `requireAuth`.
 */
export async function enforceQuota(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const ledger = getLedger(req);

        if (await ledger.isGlobalExceeded()) {
            return res.status(503).json({ error: 'Global service quota reached' });
        }

        const spent = await ledger.getSpend(req.user.sub);
        req.quota = { spent, limit: ledger.userLimit };
        if (spent >= ledger.userLimit) {
            return res.status(402).json({
                error: 'Quota exceeded',
                limit: ledger.userLimit,
                spent
            });
        }
        next();
    } catch (err) {
        next(err);
    }
}

/** Convenience array for LLM-touching routes. */
export const requireAuthAndQuota = [requireAuth, enforceQuota];
