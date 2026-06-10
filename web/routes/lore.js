import express from 'express';
import { engine } from '../engineInstance.js';

const router = express.Router();

router.post('/lore', async (req, res) => {
    const data = req.body || {};
    const action = data.action;
    const cardIdx = data.index;
    const cardData = data.card || {};

    const activeEngine = engine;

    try {
        if (action === "add") {
            const name = (cardData.name || "").trim();
            const desc = (cardData.description || "").trim();
            let triggers = cardData.triggers || [];
            if (typeof triggers === "string") {
                triggers = triggers.split(',').map(t => t.trim()).filter(Boolean);
            }
            const ctype = cardData.type || "character";
            
            await activeEngine.addManualCard(name, ctype, desc, triggers);
            
        } else if (action === "update" && cardIdx !== undefined && cardIdx >= 0 && cardIdx < activeEngine.cards.length) {
            const card = activeEngine.cards[cardIdx];
            card.name = (cardData.name || card.name).trim();
            card.description = (cardData.description || card.description || "").trim();
            card.type = cardData.type || card.type || "character";
            
            let triggers = cardData.triggers || card.trigger_words || [];
            if (typeof triggers === "string") {
                triggers = triggers.split(',').map(t => t.trim()).filter(Boolean);
            }
            card.trigger_words = triggers;
            await activeEngine.save();
            
        } else if (action === "delete" && cardIdx !== undefined && cardIdx >= 0 && cardIdx < activeEngine.cards.length) {
            const card = activeEngine.cards[cardIdx];
            await activeEngine.deleteCard(card.id);
            
        } else if (action === "toggle" && cardIdx !== undefined && cardIdx >= 0 && cardIdx < activeEngine.cards.length) {
            activeEngine.cards[cardIdx].enabled = !activeEngine.cards[cardIdx].enabled;
            await activeEngine.save();
        }

        res.json({ status: "success", cards: activeEngine.cards });
    } catch (e) {
        res.status(400).json({ status: "error", message: e.message });
    }
});

router.post('/scan', async (req, res) => {
    const activeEngine = engine;
    try {
        const newCards = await activeEngine.autoGenerateCards();
        if (newCards && newCards.length > 0) {
            const names = newCards.map(c => c.name).join(", ");
            return res.json({ status: "success", message: `Scan complete. Found cards: ${names}`, cards: activeEngine.cards });
        }
        res.json({ status: "success", message: "Scan complete. No new cards identified.", cards: activeEngine.cards });
    } catch (e) {
        res.status(400).json({ status: "error", message: e.message });
    }
});

export default router;
