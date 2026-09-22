// In-flight turn concurrency lock (vercel-deployment-and-auth, task 3.3).
//
// Acquires `user:lock:<sub>` with SET NX EX 30 for the lifetime of the
// request, rejecting overlapping turns for the same account with HTTP 429.
// The lock is released when the response finishes or the connection closes.
import { kvStore, acquireLock, releaseLock, lockKey } from '../kvStore.js';

export const LOCK_TTL_SECONDS = 30;

export function createTurnLockMiddleware({ ttlSeconds = LOCK_TTL_SECONDS } = {}) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const kv = (req.app && req.app.locals && req.app.locals.kv) || kvStore;
        const key = lockKey(req.user.sub);

        try {
            const acquired = await acquireLock(kv, key, ttlSeconds);
            if (!acquired) {
                return res.status(429).json({ error: 'A turn is already in progress for this account.' });
            }
        } catch (err) {
            return next(err);
        }

        req.lockKey = key;
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            Promise.resolve(releaseLock(kv, key)).catch(() => {});
        };
        res.on('finish', release);
        res.on('close', release);
        next();
    };
}
