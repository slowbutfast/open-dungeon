import express from 'express';
import { engine } from '../engineInstance.js';

const router = express.Router();

async function forceFlushBeforeRead() {
    if (engine.memory && engine.state && engine.adventureId) {
        await engine.memory.flushIfReady(engine.state, engine.model, () => engine.save(), { force: true });
    }
}

router.get('/memory/inventory', async (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: "No active adventure." });
        }
        await forceFlushBeforeRead();
        const items = await engine.getInventory();
        res.json(items);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/memory/events', async (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: "No active adventure." });
        }
        await forceFlushBeforeRead();
        const limit = parseInt(req.query.limit, 10) || 20;
        const events = await engine.getEventLog(limit);
        res.json(events);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/memory/search', async (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: "No active adventure." });
        }
        await forceFlushBeforeRead();
        const { query, topK } = req.body;
        if (!query) {
            return res.status(400).json({ error: "Query is required." });
        }
        const k = parseInt(topK, 10) || 5;
        const results = await engine.searchMemories(query, k);
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/memory/stats', async (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: "No active adventure." });
        }
        await forceFlushBeforeRead();
        const stats = engine.memory.getStats(engine.adventureId);
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
