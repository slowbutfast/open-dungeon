import express from 'express';
import { engine, resetEngine } from '../engineInstance.js';
import { STORY_PRESETS } from '../../engine/storyPresets.js';
import { DEFAULT_SYSTEM_PROMPT } from '../../engine/index.js';
import { llmTracker, getDebugLogs } from '../../engine/llmTracker.js';

const router = express.Router();

router.get('/presets', (req, res) => {
    res.json(STORY_PRESETS);
});

router.get('/ping', async (req, res) => {
    const host = process.env.LM_STUDIO_HOST || "127.0.0.1";
    const port = process.env.LM_STUDIO_PORT || "1234";
    const baseURL = `http://${host}:${port}/v1`;

    if (process.env.MOCK_LLM === "1") {
        return res.json({
            status: "mock",
            host,
            port,
            model: "mock-llm",
            embedding_model: "mock-embedding-model",
            models: ["mock-llm"],
            base_url: baseURL
        });
    }

    try {
        // Try LM Studio native API first
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
                host,
                port,
                model: loadedModel || "unknown",
                embedding_model: loadedEmbeddingModel,
                models: modelIds,
                base_url: baseURL
            });
        }
    } catch (e) {
        // Fallback to standard OpenAI compatible /v1/models
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
                    host,
                    port,
                    model: loadedModel,
                    embedding_model: loadedEmbeddingModel,
                    models: modelIds,
                    base_url: baseURL
                });
            }
        } catch (err) {
            return res.json({
                status: "offline",
                host,
                port,
                model: null,
                embedding_model: null,
                models: [],
                error: err.message
            });
        }
    }
    
    return res.json({
        status: "offline",
        host,
        port,
        model: null,
        embedding_model: null,
        models: [],
        error: "Failed to ping server"
    });
});

router.get('/state', async (req, res) => {
    const activeEngine = engine;

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

    if (presetIdx !== undefined && presetIdx !== null && presetIdx >= 0 && presetIdx < STORY_PRESETS.length) {
        const preset = STORY_PRESETS[presetIdx];
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
            text: openingScene
        });
    } catch (e) {
        llmTracker.failCall(callId, e);
        activeEngine.history.push({
            role: "assistant",
            text: `You wake up in the world of ${title}. ${summary}\n[Status: Starting Location | Score: 0]`
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

    if (data.max_tokens !== undefined) {
        let val = parseInt(data.max_tokens, 10);
        val = Math.max(50, Math.min(300, val));
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

router.get('/debug/info', (req, res) => {
    res.json({
        calls: llmTracker.getCalls(),
        logs: getDebugLogs()
    });
});

export default router;
