import express from 'express';
import { resolveEngine } from '../../engine/sessionManager.js';

const router = express.Router();

router.get('/saves', resolveEngine, async (req, res) => {
    const saves = await req.engine.listAdventures();
    res.json(saves);
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
