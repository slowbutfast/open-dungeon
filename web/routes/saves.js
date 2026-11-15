import express from 'express';
import { resolveEngine } from '../../engine/sessionManager.js';

const router = express.Router();

router.get('/saves', resolveEngine, async (req, res) => {
    const saves = await req.engine.listAdventures();
    res.json(saves);
});

// Bulk prune must be registered before `/saves/:save_id`, otherwise Express
// captures "prune" as a save id.
router.post('/saves/prune', resolveEngine, async (req, res) => {
    const maxMoves = Number(req.body?.max_moves);
    if (!Number.isInteger(maxMoves) || maxMoves < 1) {
        return res.status(400).json({
            status: 'error',
            message: 'max_moves must be an integer >= 1'
        });
    }
    try {
        const result = await req.engine.pruneAdventures(maxMoves, {
            dryRun: Boolean(req.body?.dry_run)
        });
        res.json({ status: 'success', ...result });
    } catch (e) {
        res.status(400).json({ status: 'error', message: e.message });
    }
});

router.post('/saves/:save_id', resolveEngine, async (req, res) => {
    const saveId = req.params.save_id;
    const engine = req.engine;
    try {
        await engine.load(saveId);
        res.json({ status: "success", message: `Loaded adventure: ${engine.title}` });
    } catch (e) {
        res.status(400).json({ status: "error", message: e.message });
    }
});

router.delete('/saves/:save_id', resolveEngine, async (req, res) => {
    const saveId = req.params.save_id;
    const engine = req.engine;
    try {
        await engine.deleteAdventure(saveId);
        res.json({ status: "success", message: `Deleted adventure slot ${saveId}.` });
    } catch (e) {
        res.status(400).json({ status: "error", message: e.message });
    }
});

export default router;
