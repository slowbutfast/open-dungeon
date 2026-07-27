import OpenAI from 'openai';
import dotenv from 'dotenv';
import { MockOpenAI } from './mockOpenAI.js';
import { llmTracker, addDebugLog } from './llmTracker.js';

dotenv.config();

export function getBackendType() {
    if (process.env.MOCK_LLM === "1") return "mock";
    return process.env.LLM_BACKEND === "openrouter" ? "openrouter" : "lmstudio";
}

export function getTokenRange() {
    const range = process.env.MAX_TOKENS_RANGE || "50:300";
    const parts = range.split(':').map(Number);
    return { min: parts[0] || 50, max: parts[1] || 300 };
}

function buildClient() {
    const backend = getBackendType();

    if (backend === "openrouter") {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey || apiKey === 'sk-or-v1-your-api-key-here') {
            console.warn('[LLM] OPENROUTER_API_KEY is missing or still set to the placeholder. Falling back to mock mode.');
            return { client: new MockOpenAI(), isOpenRouter: false, reasoningEffort: null };
        }
        const client = new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: apiKey,
            defaultHeaders: {
                'HTTP-Referer': 'https://github.com/anomalyco/local-llm-testing',
                'X-Title': 'OpenDungeon'
            }
        });
        const effort = process.env.REASONING_EFFORT || "low";
        return { client, isOpenRouter: true, reasoningEffort: effort };
    }

    const host = process.env.LM_STUDIO_HOST || "127.0.0.1";
    const port = process.env.LM_STUDIO_PORT || "1234";
    const client = new OpenAI({
        baseURL: `http://${host}:${port}/v1`,
        apiKey: 'lm-studio'
    });
    return { client, isOpenRouter: false, reasoningEffort: null };
}

export class LlmOrchestrator {
    constructor() {
        const mockLlm = process.env.MOCK_LLM === "1";
        if (mockLlm) {
            this.client = new MockOpenAI();
            this.isOpenRouter = false;
            this.reasoningEffort = null;
        } else {
            const config = buildClient();
            this.client = config.client;
            this.isOpenRouter = config.isOpenRouter;
            this.reasoningEffort = config.reasoningEffort;
        }
    }

    async getLoadedModel() {
        if (process.env.MOCK_LLM === "1") {
            return "mock-gemma";
        }

        if (this.isOpenRouter) {
            const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";
            return model;
        }

        try {
            const baseUrlStr = this.client.baseURL;
            const parsed = new URL(baseUrlStr);
            const apiUrl = `${parsed.protocol}//${parsed.host}/api/v1/models`;

            const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(2000) });
            if (resp.ok) {
                const data = await resp.json();

                for (const m of data.models || []) {
                    if (m.type === "llm" && m.loaded_instances && m.loaded_instances.length > 0 && typeof m.key === "string") {
                        return m.key;
                    }
                }

                for (const m of data.models || []) {
                    if (m.type === "llm" && typeof m.key === "string") {
                        return m.key;
                    }
                }

                if (data.models && data.models.length > 0) {
                    const key = data.models[0].key;
                    if (typeof key === "string") return key;
                }
            }
        } catch (e) {
            // Ignore and try OpenAI list
        }

        try {
            const models = await this.client.models.list();
            if (models && models.data && models.data.length > 0) {
                for (const m of models.data) {
                    if (typeof m.id === "string" && !m.id.includes("embed")) {
                        return m.id;
                    }
                }
                if (typeof models.data[0].id === "string") {
                    return models.data[0].id;
                }
            }
        } catch (e) {
            // Ignore
        }

        return "local-model";
    }

    buildSystemMessage(state, activeCards = null, ragMemories = null, inventoryItems = null) {
        let systemContent = state.systemPrompt;
        systemContent += `\n\n[CURRENT STATUS]\n- Location: ${state.location}\n- Score: ${state.score}\n- Moves: ${state.moves}`;

        if (inventoryItems && inventoryItems.length > 0) {
            const itemsList = inventoryItems.map(item => `- ${item.item_name} (x${item.quantity}): ${item.description || 'No description'}`).join('\n');
            systemContent += `\n\n[CURRENT INVENTORY]\n${itemsList}`;
        } else {
            systemContent += `\n\n[CURRENT INVENTORY]\n- (Empty)`;
        }

        if (state.summary) {
            systemContent += `\n\n[ADVENTURE SUMMARY]\n${state.summary}`;
        }

        if (activeCards && activeCards.length > 0) {
            systemContent += "\n\n[WORLD INFO & LORE]";
            for (const card of activeCards) {
                const name = card.name;
                const cardType = (card.type || "lore").toUpperCase();
                const desc = card.description || "";
                systemContent += `\n- ${name} (${cardType}): ${desc}`;
            }
        }

        if (ragMemories && ragMemories.length > 0) {
            systemContent += "\n\n[RECALLED MEMORIES]";
            systemContent += "\nRelevant past events from your adventure:";
            for (const mem of ragMemories) {
                systemContent += `\n- (Turn ${mem.turnIndex}, ${mem.eventType}): ${mem.text}`;
            }
        }

        return { role: "system", content: systemContent };
    }

    async *generateResponseStream(state, actionType, text, contextManager, saveFn) {
        const formatUserInput = (type, val) => {
            if (type === "continue") return "";
            const cleaned = val.trim();
            if (type === "do" || type === "say" || type === "story") {
                if (cleaned.startsWith(">")) return cleaned;
                return `> ${cleaned}`;
            }
            return cleaned;
        };

        const formattedText = formatUserInput(actionType, text);
        state.history.push({
            role: "user",
            action_type: actionType,
            text: formattedText
        });


        let recentText = formattedText;
        if (state.history.length >= 2) {
            recentText = state.history[state.history.length - 2].text + " " + recentText;
        }

        const activeCards = contextManager.getActiveCards(state.cards, recentText);
        if (activeCards && activeCards.length > 0) {
            const triggeredNames = activeCards.map(c => c.name).join(", ");
            addDebugLog(`Context cards: active card triggers: ${triggeredNames}`);
            yield { type: "system", content: `LORE ACTIVATED: ${triggeredNames}` };
        }

        let ragMemories = [];
        try {
            ragMemories = await contextManager.getRAGContext(recentText, state.adventureId);
            if (ragMemories && ragMemories.length > 0) {
                addDebugLog(`RAG memory recall: query="${recentText.trim().substring(0, 45)}..." -> retrieved ${ragMemories.length} memories`);
                yield { type: "system", content: `MEMORY RECALL: ${ragMemories.length} relevant memories` };
            }
        } catch (e) {
            // Non-fatal: continue without RAG context
            addDebugLog(`RAG memory recall error: ${e.message}`);
        }

        let requestMaxTokens = state.maxTokens;
        let isSimpleAction = false;
        if (actionType === "do") {
            const cleanedCmd = text.trim().toLowerCase();
            const simpleVerbs = [
                "take", "get", "drop", "open", "close", "read", "examine",
                "inventory", "wear", "look at", "put", "push", "pull",
                "turn", "unlock", "lock", "use", "drink", "eat"
            ];
            if (simpleVerbs.some(verb => cleanedCmd.startsWith(verb))) {
                isSimpleAction = true;
                requestMaxTokens = Math.max(60, Math.floor(state.maxTokens / 3));
            }
        }

        const messages = [];
        let inventoryItems = [];
        if (contextManager && contextManager.memoryManager && state.adventureId) {
            try {
                inventoryItems = contextManager.memoryManager.getInventory(state.adventureId) || [];
            } catch (e) {
                // ignore
            }
        }
        const systemMsgObj = this.buildSystemMessage(state, activeCards, ragMemories, inventoryItems);
        if (isSimpleAction) {
            systemMsgObj.content += "\n(Reply with a single curt sentence of 15 words or less.)";
        }
        messages.push(systemMsgObj);

        for (const turn of state.history) {
            let content = turn.text;
            if (!content || !content.trim()) {
                content = "[Continue]";
            }
            messages.push({ role: turn.role, content });
        }

        yield { type: "status", content: "Querying model..." };

        const loadedModel = await this.getLoadedModel();
        if (loadedModel && loadedModel !== "local-model") {
            state.model = loadedModel;
            await saveFn();
        }

        let stream;
        const callId = llmTracker.startCall('narration', messages);
        try {
            try {
                const requestBody = {
                    model: state.model,
                    messages,
                    temperature: state.temperature,
                    max_tokens: requestMaxTokens,
                    stream: true
                };
                if (this.isOpenRouter) {
                    requestBody.reasoning = { effort: this.reasoningEffort };
                    requestBody.stream_options = { include_usage: true };
                }
                stream = await this.client.chat.completions.create(requestBody);
            } catch (err) {
                const errorMsg = String(err);
                if (errorMsg.includes("Failed to load model") || errorMsg.includes("400") || errorMsg.toLowerCase().includes("model") || errorMsg.includes("429")) {
                    yield { type: "system", content: `Failed with '${state.model}'. Attempting fallback...` };
                    addDebugLog(`Narration error: failed with '${state.model}'. Attempting fallback...`);
                    const fallbackModel = await this.getLoadedModel();
                    if (fallbackModel && fallbackModel !== state.model) {
                        yield { type: "system", content: `Falling back to model: '${fallbackModel}'` };
                        addDebugLog(`Narration info: falling back to model: '${fallbackModel}'`);
                        state.model = fallbackModel;
                        await saveFn();
                        const retryBody = {
                            model: state.model,
                            messages,
                            temperature: state.temperature,
                            max_tokens: requestMaxTokens,
                            stream: true
                        };
                        if (this.isOpenRouter) {
                            retryBody.reasoning = { effort: this.reasoningEffort };
                            retryBody.stream_options = { include_usage: true };
                        }
                        stream = await this.client.chat.completions.create(retryBody);
                    } else {
                        throw err;
                    }
                } else {
                    throw err;
                }
            }

            let assistantText = "";
            let buffer = "";
            let thinkingText = "";
            let usageData = null;

            for await (const chunk of stream) {
                const delta = chunk.choices?.[0]?.delta;

                if (delta?.reasoning) {
                    thinkingText += delta.reasoning;
                }

                if (chunk.usage) {
                    usageData = chunk.usage;
                }

                const content = delta?.content;
                if (content !== undefined && content !== null) {
                    assistantText += content;

                    if (!buffer && content.includes('[')) {
                        const idx = content.indexOf('[');
                        const before = content.substring(0, idx);
                        if (before) {
                            yield { type: "chunk", content: before };
                        }
                        buffer = content.substring(idx);
                    } else if (buffer) {
                        buffer += content;
                        if (buffer.length > 150) {
                            yield { type: "chunk", content: buffer };
                            buffer = "";
                        }
                    } else {
                        yield { type: "chunk", content: content };
                    }
                }
            }

            if (thinkingText) {
                addDebugLog(`[DeepSeek Thinking] ${thinkingText}`);
            }

            if (usageData) {
                llmTracker.recordUsage(callId, usageData);
                const cost = llmTracker.getSessionCost();
                yield {
                    type: "cost",
                    input_tokens: usageData.prompt_tokens || usageData.input_tokens || 0,
                    output_tokens: usageData.completion_tokens || usageData.output_tokens || 0,
                    session_input_tokens: cost.input_tokens,
                    session_output_tokens: cost.output_tokens,
                    session_cost: cost.estimated_cost_usd,
                    session_cost_display: cost.breakdown
                };
            }

            let cleanedText = assistantText.trim();
            if (buffer) {
                const statusMatch = buffer.trim().match(/^\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)(?:\s*\|\s*Moves:\s*(\d+))?\s*\]$/);
                if (statusMatch) {
                    state.location = statusMatch[1].trim();
                    state.score = parseInt(statusMatch[2].trim(), 10);
                    if (statusMatch[3] !== undefined && !isNaN(parseInt(statusMatch[3].trim(), 10))) {
                        state.moves = parseInt(statusMatch[3].trim(), 10);
                    } else {
                        state.moves += 1;
                    }
                    cleanedText = assistantText.substring(0, assistantText.length - buffer.length).trim();
                } else {
                    yield { type: "chunk", content: buffer };
                    state.moves += 1;
                }
            } else {
                const statusMatch = cleanedText.match(/\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)(?:\s*\|\s*Moves:\s*(\d+))?\s*\]$/);
                if (statusMatch) {
                    state.location = statusMatch[1].trim();
                    state.score = parseInt(statusMatch[2].trim(), 10);
                    if (statusMatch[3] !== undefined && !isNaN(parseInt(statusMatch[3].trim(), 10))) {
                        state.moves = parseInt(statusMatch[3].trim(), 10);
                    } else {
                        state.moves += 1;
                    }
                } else {
                    state.moves += 1;
                }
            }

            if (!cleanedText && assistantText.trim()) {
                cleanedText = "Done.";
            }

            state.history.push({
                role: "assistant",
                action_type: "narration",
                text: cleanedText
            });
            await saveFn();
            yield { type: "done", content: cleanedText };
            llmTracker.endCall(callId, cleanedText);

            if (contextManager.memoryManager) {
                const lastTurns = state.history.slice(-2);
                if (lastTurns.length === 2) {
                    contextManager.memoryManager.bufferTurnPair({
                        turnIndex: state.moves,
                        player: lastTurns[0].text,
                        dm: lastTurns[1].text
                    });
                }
            }

            // Run background tasks sequentially: memory extraction, then auto-summarization
            (async () => {
                try {
                    if (contextManager.memoryManager) {
                        await contextManager.memoryManager.flushIfReady(state, state.model, saveFn);
                    }
                    if (state.autoSummarize && state.history.length >= state.summarizeThreshold) {
                        await contextManager.summarizeOldTurns(state, this.client, state.model, saveFn);
                    }
                } catch (e) {
                    console.error("Async background task execution failed:", e.message);
                }
            })();

        } catch (err) {
            llmTracker.failCall(callId, err);
            state.history.pop();
            yield { type: "error", content: String(err) };
        }
    }

    async *regenerateLastResponse(state, contextManager, saveFn) {
        if (state.history.length === 0) {
            yield { type: "error", content: "No history to regenerate." };
            return;
        }

        if (state.history[state.history.length - 1].role === "assistant") {
            state.history.pop();
        }

        if (state.history.length === 0) {
            yield { type: "error", content: "No player turn to regenerate a response for." };
            return;
        }

        const lastUserTurn = state.history.pop();
        let rawText = lastUserTurn.text;

        if (rawText.startsWith("> You try to ")) {
            rawText = rawText.substring("> You try to ".length);
        } else if (rawText.startsWith("> You say, \"") && rawText.endsWith("\"")) {
            rawText = rawText.substring("> You say, \"".length, rawText.length - 1);
        } else if (rawText.startsWith("> ")) {
            rawText = rawText.substring(2);
        }

        const actionType = lastUserTurn.action_type || "story";

        for await (const event of this.generateResponseStream(state, actionType, rawText, contextManager, saveFn)) {
            yield event;
        }
    }

}