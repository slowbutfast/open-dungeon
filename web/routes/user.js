// User profile + quota inspection routes (vercel-deployment-and-auth, 3.5/5.1).
import express from 'express';
import { requireAuth, getLedger } from '../middleware/quota.js';

const round = (n) => Math.round(n * 1e6) / 1e6;

const router = express.Router();

router.get('/user/quota', requireAuth, async (req, res, next) => {
    try {
        const ledger = getLedger(req);
        const spent = await ledger.getSpend(req.user.sub);
        const remaining = Math.max(0, ledger.userLimit - spent);
        res.json({
            authenticated: true,
            spent: round(spent),
            remaining: round(remaining),
            limit: ledger.userLimit
        });
    } catch (err) {
        next(err);
    }
});

router.get('/user/me', requireAuth, (req, res) => {
    res.json({
        authenticated: true,
        user: {
            sub: req.user.sub,
            email: req.user.email ?? null,
            name: req.user.name ?? null
        }
    });
});

export default router;
