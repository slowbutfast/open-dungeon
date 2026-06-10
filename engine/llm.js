import OpenAI from 'openai';
import dotenv from 'dotenv';
import { MockOpenAI } from './mockOpenAI.js';

dotenv.config();

export class LlmOrchestrator {
    constructor() {
        const mockLlm = process.env.MOCK_LLM === "1";
        if (mockLlm) {
            this.client = new MockOpenAI();
        } else {
            const host = process.env.LM_STUDIO_HOST || "127.0.0.1";
            const port = process.env.LM_STUDIO_PORT || "1234";
            this.client = new OpenAI({
                baseURL: `http://${host}:${port}/v1`,
                apiKey: 'lm-studio'
            });
        }
    }

    async getLoadedModel() {
        if (process.env.MOCK_LLM === "1") {
            return "mock-gemma";
        }
        
        try {
            const baseUrlStr = this.client.baseURL;
            const parsed = new URL(baseUrlStr);
            const apiUrl = `${parsed.protocol}//${parsed.host}/api/v1/models`;
            
            const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(2000) });
            if (resp.ok) {
                const data = await resp.json();
                
                // 1. Look for a loaded LLM
                for (const m of data.models || []) {
                    if (m.type === "llm" && m.loaded_instances && m.loaded_instances.length > 0 && typeof m.key === "string") {
                        return m.key;
                    }
                }
                
                // 2. Look for any LLM
                for (const m of data.models || []) {
                    if (m.type === "llm" && typeof m.key === "string") {
                        return m.key;
                    }
                }
                
                // 3. Fallback
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

    buildSystemMessage(state, activeCards = null, ragMemories = null) {
        let systemContent = state.systemPrompt;
        systemContent += `\n\n[CURRENT STATUS]\n- Location: ${state.location}\n- Score: ${state.score}\n- Moves: ${state.moves}`;
        
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
            yield { type: "system", content: `LORE ACTIVATED: ${triggeredNames}` };
        }

        let ragMemories = [];
        try {
            ragMemories = await contextManager.getRAGContext(recentText, state.adventureId);
            if (ragMemories && ragMemories.length > 0) {
                yield { type: "system", content: `MEMORY RECALL: ${ragMemories.length} relevant memories` };
            }
        } catch (e) {
            // Non-fatal: continue without RAG context
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
        const systemMsgObj = this.buildSystemMessage(state, activeCards, ragMemories);
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
        try {
            try {
                stream = await this.client.chat.completions.create({
                    model: state.model,
                    messages,
                    temperature: state.temperature,
                    max_tokens: requestMaxTokens,
                    stream: true
                });
            } catch (err) {
                const errorMsg = String(err);
                if (errorMsg.includes("Failed to load model") || errorMsg.includes("400") || errorMsg.toLowerCase().includes("model")) {
                    yield { type: "system", content: `Failed to load '${state.model}'. Attempting fallback...` };
                    const fallbackModel = await this.getLoadedModel();
                    if (fallbackModel && fallbackModel !== state.model) {
                        yield { type: "system", content: `Falling back to model: '${fallbackModel}'` };
                        state.model = fallbackModel;
                        await saveFn();
                        stream = await this.client.chat.completions.create({
                            model: state.model,
                            messages,
                            temperature: state.temperature,
                            max_tokens: requestMaxTokens,
                            stream: true
                        });
                    } else {
                        throw err;
                    }
                } else {
                    throw err;
                }
            }

            let assistantText = "";
            let buffer = "";

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
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

            let cleanedText = assistantText.trim();
            if (buffer) {
                const statusMatch = buffer.trim().match(/^\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\]$/);
                if (statusMatch) {
                    state.location = statusMatch[1].trim();
                    state.score = parseInt(statusMatch[2].trim(), 10);
                    state.moves += 1;
                    cleanedText = assistantText.substring(0, assistantText.length - buffer.length).trim();
                } else {
                    yield { type: "chunk", content: buffer };
                    state.moves += 1;
                }
            } else {
                const statusMatch = cleanedText.match(/\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\]$/);
                if (statusMatch) {
                    state.location = statusMatch[1].trim();
                    state.score = parseInt(statusMatch[2].trim(), 10);
                    state.moves += 1;
                    cleanedText = cleanedText.substring(0, statusMatch.index).trim();
                } else {
                    state.moves += 1;
                }
            }

            state.history.push({
                role: "assistant",
                action_type: "narration",
                text: cleanedText
            });
            await saveFn();
            yield { type: "done", content: cleanedText };

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
