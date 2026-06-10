import express from 'express';
import { engine } from '../engineInstance.js';

const router = express.Router();

router.get('/saves', async (req, res) => {
    const saves = await engine.listAdventures();
    res.json(saves);
});

router.post('/saves/:save_id', async (req, res) => {
    const saveId = req.params.save_id;
    try {
        await engine.load(saveId);
        res.json({ status: "success", message: `Loaded adventure: ${engine.title}` });
    } catch (e) {
        res.status(400).json({ status: "error", message: e.message });
    }
});

router.delete('/saves/:save_id', async (req, res) => {
    const saveId = req.params.save_id;
    try {
        await engine.deleteAdventure(saveId);
        res.json({ status: "success", message: `Deleted adventure slot ${saveId}.` });
    } catch (e) {
        res.status(400).json({ status: "error", message: e.message });
    }
});

export default router;
