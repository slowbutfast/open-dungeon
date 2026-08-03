import express from 'express';
import { engine } from '../engineInstance.js';

const router = express.Router();

router.get('/memory/inventory', async (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: "No active adventure." });
        }
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

router.post('/memory/inventory/add', async (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: "No active adventure." });
        }
        const item = req.body;
        if (!item || !item.item_name) {
            return res.status(400).json({ error: "item_name is required." });
        }
        engine.memory.structuredStore.upsertInventoryItem(engine.adventureId, {
            item_name: item.item_name,
            item_type: item.item_type || 'misc',
            description: item.description || null,
            quantity: item.quantity !== undefined ? item.quantity : 1,
            status: item.status || 'held'
        });
        res.json({ status: "success", item });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/memory/stats', async (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: "No active adventure." });
        }
        const stats = await engine.memory.getStats(engine.adventureId);
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
