import express from 'express';
import { engine, resetEngine } from '../engineInstance.js';
import { DEFAULT_SYSTEM_PROMPT } from '../../engine/index.js';
import { llmTracker, getDebugLogs } from '../../engine/llmTracker.js';
import { getBackendType, getTokenRange, sanitizeForHistory } from '../../engine/llm.js';
import { forceFlushBeforeRead } from '../../mcp/tools/memory.js';
import { OPENROUTER_MODELS } from '../openrouterModels.js';

const router = express.Router();

router.get('/presets', async (req, res) => {
    const presets = await engine.getPresets();
    res.json(presets);
});

router.post('/presets', async (req, res) => {
    try {
        const newPreset = req.body;
        if (!newPreset || !newPreset.name) {
            return res.status(400).json({ status: "error", message: "Preset must have a name." });
        }
        const presets = await engine.getPresets();
        presets.push(newPreset);
        await engine.savePresets(presets);
        res.json({ status: "success", preset: newPreset });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

router.put('/presets/:index', async (req, res) => {
    try {
        const index = parseInt(req.params.index, 10);
        const updatedPreset = req.body;
        if (!updatedPreset || !updatedPreset.name) {
            return res.status(400).json({ status: "error", message: "Preset must have a name." });
        }
        const presets = await engine.getPresets();
        if (index < 0 || index >= presets.length) {
            return res.status(404).json({ status: "error", message: "Preset not found." });
        }
        presets[index] = updatedPreset;
        await engine.savePresets(presets);
        res.json({ status: "success", preset: updatedPreset });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

router.delete('/presets/:index', async (req, res) => {
    try {
        const index = parseInt(req.params.index, 10);
        const presets = await engine.getPresets();
        if (index < 0 || index >= presets.length) {
            return res.status(404).json({ status: "error", message: "Preset not found." });
        }
        const removed = presets.splice(index, 1)[0];
        await engine.savePresets(presets);
        res.json({ status: "success", preset: removed });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

router.get('/ping', async (req, res) => {
    const backend = getBackendType();
    const tokenRange = getTokenRange();
    const cost = llmTracker.getSessionCost();

    if (backend === "mock") {
        return res.json({
            status: "mock",
            backend: "mock",
            host: "mock",
            port: "0",
            model: "mock-llm",
            embedding_model: "mock-embedding-model",
            models: ["mock-llm"],
            base_url: "mock://localhost",
            max_tokens_range: [tokenRange.min, tokenRange.max],
            cost: cost
        });
    }

    if (backend === "openrouter") {
        const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";
        const embedModel = process.env.OPENROUTER_EMBEDDING_MODEL || "nomic-embed-text";

        // Build models array: env model first, then curated models (deduplicated)
        const models = [model];
        const modelCaptions = [];

        // Find caption & cost for env model (or use generic if not in curated list)
        const envEntry = OPENROUTER_MODELS.find(m => m.id === model);
        if (envEntry) {
            modelCaptions.push(`${envEntry.caption} (${envEntry.cost})`);
        } else {
            modelCaptions.push("Custom model");
        }

        for (const curated of OPENROUTER_MODELS) {
            if (curated.id !== model) {
                models.push(curated.id);
                modelCaptions.push(`${curated.caption} (${curated.cost})`);
            }
        }

        return res.json({
            status: "online",
            backend: "openrouter",
            host: "openrouter.ai",
            port: "443",
            model: model,
            embedding_model: embedModel,
            models: models,
            modelCaptions: modelCaptions,
            base_url: "https://openrouter.ai/api/v1",
            max_tokens_range: [tokenRange.min, tokenRange.max],
            cost: cost
        });
    }

    // LM Studio backend
    const host = process.env.LM_STUDIO_HOST || "127.0.0.1";
    const port = process.env.LM_STUDIO_PORT || "1234";
    const baseURL = `http://${host}:${port}/v1`;

    try {
        const apiURL = `http://${host}:${port}/api/v1/models`;
        const response = await fetch(apiURL, { signal: AbortSignal.timeout(3000) });
        if (response.ok) {
            const body = await response.json();
            const modelsData = body.models || [];
            const modelIds = modelsData.map(m => m.key);

            let loadedModel = null;
            for (const m of modelsData) {
                if (m.type === "llm" && m.loaded_instances && m.loaded_instances.length > 0) {
                    loadedModel = m.key;
                    break;
                }
            }

            if (!loadedModel) {
                for (const m of modelsData) {
                    if (m.type === "llm") {
                        loadedModel = m.key;
                        break;
                    }
                }
            }

            if (!loadedModel && modelIds.length > 0) {
                loadedModel = modelIds[0];
            }

            let loadedEmbeddingModel = null;
            for (const m of modelsData) {
                if (m.type === "embedding" && m.loaded_instances && m.loaded_instances.length > 0) {
                    loadedEmbeddingModel = m.key;
                    break;
                }
            }

            return res.json({
                status: "online",
                backend: "lmstudio",
                host,
                port,
                model: loadedModel || "unknown",
                embedding_model: loadedEmbeddingModel,
                models: modelIds,
                base_url: baseURL,
                max_tokens_range: [tokenRange.min, tokenRange.max],
                cost: cost
            });
        }
    } catch (e) {
        try {
            const openAiURL = `http://${host}:${port}/v1/models`;
            const response = await fetch(openAiURL, { signal: AbortSignal.timeout(3000) });
            if (response.ok) {
                const body = await response.json();
                const modelsData = body.data || [];
                const modelIds = modelsData.map(m => m.id);
                const loadedModel = modelIds.length > 0 ? modelIds[0] : "unknown";

                let loadedEmbeddingModel = null;
                for (const id of modelIds) {
                    if (id.toLowerCase().includes("embed") || id.toLowerCase().includes("nomic")) {
                        loadedEmbeddingModel = id;
                        break;
                    }
                }

                return res.json({
                    status: "online",
                    backend: "lmstudio",
                    host,
                    port,
                    model: loadedModel,
                    embedding_model: loadedEmbeddingModel,
                    models: modelIds,
                    base_url: baseURL,
                    max_tokens_range: [tokenRange.min, tokenRange.max],
                    cost: cost
                });
            }
        } catch (err) {
            return res.json({
                status: "offline",
                backend: "lmstudio",
                host,
                port,
                model: null,
                embedding_model: null,
                models: [],
                error: err.message,
                max_tokens_range: [tokenRange.min, tokenRange.max],
                cost: cost
            });
        }
    }

    return res.json({
        status: "offline",
        backend: "lmstudio",
        host,
        port,
        model: null,
        embedding_model: null,
        models: [],
        error: "Failed to ping server",
        max_tokens_range: [tokenRange.min, tokenRange.max],
        cost: cost
    });
});

router.get('/state', async (req, res) => {
    const activeEngine = engine;

    // Score is engine-computed at extraction-flush time. Flush with engine
    // state before reading so `state.score` reflects the same freshness the
    // MCP surface (`dungeon_send_action` / `dungeon_inspect_state`) reports.
    await forceFlushBeforeRead(activeEngine);

    res.json({
        adventure_id: activeEngine.adventureId,
        title: activeEngine.title,
        location: activeEngine.location,
        score: activeEngine.score,
        moves: activeEngine.moves,
        history: activeEngine.history,
        cards: activeEngine.cards,
        summary: activeEngine.summary,
        system_prompt: activeEngine.systemPrompt,
        max_tokens: activeEngine.maxTokens,
        model: activeEngine.model
    });
});

router.post('/state', async (req, res) => {
    const data = req.body || {};
    const activeEngine = engine;

    if (data.history !== undefined) activeEngine.history = data.history;
    if (data.system_prompt !== undefined) activeEngine.systemPrompt = data.system_prompt;
    if (data.summary !== undefined) activeEngine.summary = data.summary;
    if (data.location !== undefined) activeEngine.location = data.location;
    if (data.score !== undefined) activeEngine.score = data.score;
    if (data.moves !== undefined) activeEngine.moves = data.moves;
    if (data.cards !== undefined) activeEngine.cards = data.cards;

    if (activeEngine.adventureId) {
        await activeEngine.save();
    }
    res.json({ status: "success" });
});

router.post('/init', async (req, res) => {
    const data = req.body || {};
    const presetIdx = data.preset_idx;
    const customTitle = data.title;
    const customSummary = data.summary;
    const customSystemPrompt = data.system_prompt;
    const charData = data.character || {};

    // Reset engine global instance
    const activeEngine = resetEngine();

    let title = "Custom Adventure";
    let summary = "You stand at the beginning of a mysterious custom quest.";
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;

    const allPresets = await engine.getPresets();
    if (presetIdx !== undefined && presetIdx !== null && presetIdx >= 0 && presetIdx < allPresets.length) {
        const preset = allPresets[presetIdx];
        title = preset.title;
        summary = preset.summary;
        systemPrompt = preset.system_prompt;
    }

    if (customTitle) title = customTitle;
    if (customSummary) summary = customSummary;
    if (customSystemPrompt) systemPrompt = customSystemPrompt;

    await activeEngine.newAdventure(title, systemPrompt);
    activeEngine.summary = summary;

    const charName = charData.name || "Eldrin";
    const charType = charData.type || "Mage";
    const charDesc = charData.desc || "A mysterious wizard.";
    let charTriggers = charData.triggers || [charName.toLowerCase()];
    if (typeof charTriggers === "string") {
        charTriggers = charTriggers.split(',').map(t => t.trim()).filter(Boolean);
    }

    const descNode = `You are ${charName}, a ${charType}. ${charDesc}`;
    activeEngine.history.push({
        role: "user",
        action_type: "story",
        text: `Character description: ${descNode}`
    });

    const prompt = `Write the opening scene for a text adventure game. Title: ${title}. Character: ${charName} (${charType}). Starting scenario: ${summary}`;
    const messages = [
        { role: "system", content: activeEngine.systemPrompt },
        { role: "user", content: prompt }
    ];
    const callId = llmTracker.startCall('opening_scene', messages);
    try {
        const response = await activeEngine.client.chat.completions.create({
            model: activeEngine.model,
            messages: messages,
            temperature: 0.8,
            max_tokens: activeEngine.maxTokens
        });

        const openingScene = response.choices[0].message.content.trim();
        llmTracker.endCall(callId, openingScene);
        activeEngine.history.push({
            role: "assistant",
            text: sanitizeForHistory(openingScene)
        });
    } catch (e) {
        llmTracker.failCall(callId, e);
        activeEngine.history.push({
            role: "assistant",
            text: sanitizeForHistory(`You wake up in the world of ${title}. ${summary}\n[Status: Starting Location | Score: 0 | Moves: 0]`)
        });
    }

    // Buffer the initial turn pair (turnIndex: 1) for immediate force-flush availability
    if (activeEngine.history.length >= 2) {
        activeEngine.memory.bufferTurnPair({
            turnIndex: 1,
            player: activeEngine.history[0].text,
            dm: activeEngine.history[1].text
        });
    }

    await activeEngine.save();

    activeEngine.location = "Starting Location";
    activeEngine.score = 0;
    activeEngine.moves = 1;

    res.json({ status: "success", adventure_id: activeEngine.adventureId });
});

router.post('/action', async (req, res) => {
    const data = req.body || {};
    const actionType = data.action_type || "do";
    const text = data.text || "";

    const activeEngine = engine;

    if (actionType === "undo") {
        try {
            await activeEngine.undo();
            return res.json({ status: "success", message: "Last action undone successfully." });
        } catch (e) {
            return res.status(400).json({ status: "error", message: e.message });
        }
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        let stream;
        if (actionType === "retry") {
            stream = activeEngine.regenerateLastResponse();
        } else {
            stream = activeEngine.generateResponseStream(actionType, text);
        }

        for await (const event of stream) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
    } catch (err) {
        res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
    } finally {
        res.end();
    }
});

router.post('/system', async (req, res) => {
    const data = req.body || {};
    const newPrompt = data.system_prompt;
    const activeEngine = engine;
    if (newPrompt) {
        activeEngine.systemPrompt = newPrompt;
        await activeEngine.save();
        return res.json({ status: "success", message: "System prompt updated." });
    }
    res.status(400).json({ status: "error", message: "Prompt cannot be blank." });
});

router.post('/summary', async (req, res) => {
    const data = req.body || {};
    const newSummary = data.summary;
    const activeEngine = engine;
    if (newSummary) {
        activeEngine.summary = newSummary;
        await activeEngine.save();
        return res.json({ status: "success", message: "Memory summary updated." });
    }
    res.status(400).json({ status: "error", message: "Summary cannot be blank." });
});

router.post('/settings', async (req, res) => {
    const data = req.body || {};
    const changed = [];
    const activeEngine = engine;
    const tokenRange = getTokenRange();

    if (data.max_tokens !== undefined) {
        let val = parseInt(data.max_tokens, 10);
        val = Math.max(tokenRange.min, Math.min(tokenRange.max, val));
        activeEngine.maxTokens = val;
        changed.push(`max_tokens=${val}`);
    }

    if (data.model !== undefined) {
        const val = String(data.model);
        activeEngine.model = val;
        changed.push(`model=${val}`);
    }

    if (activeEngine.adventureId) {
        await activeEngine.save();
    }

    res.json({ status: "success", changed });
});

router.get('/cost', (req, res) => {
    const cost = llmTracker.getSessionCost();
    res.json(cost);
});

// ─── Barter & Quest Goal Endpoints ─────────────────────────────────────────

router.post('/trade/offer', (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: 'No active adventure.' });
        }
        const { trader_name, required_item, offered_item, description } = req.body;
        if (!trader_name || !required_item || !offered_item) {
            return res.status(400).json({ error: 'trader_name, required_item, and offered_item are required.' });
        }
        const offer = engine.registerOffer(trader_name, required_item, offered_item, description);
        res.json({ status: 'success', offer });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/trade/offers', (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: 'No active adventure.' });
        }
        const trader = req.query.trader;
        const offers = engine.getOffers(trader || null);
        res.json(offers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/trade', async (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: 'No active adventure.' });
        }
        const { trader_name, required_item } = req.body;
        if (!trader_name || !required_item) {
            return res.status(400).json({ error: 'trader_name and required_item are required.' });
        }

        // Execute the barter
        const offer = engine.executeBarter(trader_name, required_item);

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Send system event for successful barter
        const systemEvent = `[SYSTEM EVENT: Barter successful! Traded '${offer.required_item}' for '${offer.offered_item}'.]`;
        res.write(`data: ${JSON.stringify({ type: 'system', content: systemEvent })}\n\n`);

        // Stream LLM narration about the trade
        const stream = engine.generateResponseStream('do', `trade ${offer.required_item} to ${offer.trader_name}`);
        for await (const event of stream) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
    } catch (err) {
        if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
        } else {
            return res.status(400).json({ error: err.message });
        }
    } finally {
        res.end();
    }
});

router.post('/goals', (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: 'No active adventure.' });
        }
        const { npc_name, goal_title, required_item, reward_item } = req.body;
        if (!npc_name || !goal_title || !required_item || !reward_item) {
            return res.status(400).json({ error: 'npc_name, goal_title, required_item, and reward_item are required.' });
        }
        const goal = engine.createGoal(npc_name, goal_title, required_item, reward_item);
        res.json({ status: 'success', goal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/goals', (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: 'No active adventure.' });
        }
        const goals = engine.getGoals();
        res.json(goals);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/goals/accept', (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: 'No active adventure.' });
        }
        const { goal_id } = req.body;
        if (!goal_id) {
            return res.status(400).json({ error: 'goal_id is required.' });
        }
        const goal = engine.acceptGoal(goal_id);
        res.json({ status: 'success', goal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/goals/fail', (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: 'No active adventure.' });
        }
        const { goal_id } = req.body;
        if (!goal_id) {
            return res.status(400).json({ error: 'goal_id is required.' });
        }
        const goal = engine.failGoal(goal_id);
        res.json({ status: 'success', goal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/goals/complete', async (req, res) => {
    try {
        if (!engine.adventureId) {
            return res.status(400).json({ error: 'No active adventure.' });
        }
        const { goal_id } = req.body;
        if (!goal_id) {
            return res.status(400).json({ error: 'goal_id is required.' });
        }

        const goal = engine.completeGoal(goal_id);

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Send system event for goal completion
        const systemEvent = `[SYSTEM EVENT: Goal '${goal.goal_title}' completed! Reward: ${goal.reward_item} granted.]`;
        res.write(`data: ${JSON.stringify({ type: 'system', content: systemEvent })}\n\n`);

        // Stream LLM narration about the goal completion
        const stream = engine.generateResponseStream('do', `complete quest: ${goal.goal_title}`);
        for await (const event of stream) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
    } catch (err) {
        if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
        } else {
            return res.status(400).json({ error: err.message });
        }
    } finally {
        res.end();
    }
});

router.get('/debug/info', (req, res) => {
    res.json({
        calls: llmTracker.getCalls(),
        logs: getDebugLogs()
    });
});

export default router;
