import OpenAI from 'openai';
import { MockOpenAI } from '../mockOpenAI.js';

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

    buildSystemMessage(state, activeCards = null) {
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

        let summarizedAny = false;
        if (state.autoSummarize && state.history.length >= state.summarizeThreshold) {
            yield { type: "system", content: "COMPRESSING CONTEXT AND RUNNING AUTO-SUMMARIZATION..." };
            await contextManager.summarizeOldTurns(state, this.client, state.model, saveFn);
            summarizedAny = true;
        }

        let recentText = formattedText;
        if (state.history.length >= 2) {
            recentText = state.history[state.history.length - 2].text + " " + recentText;
        }

        const activeCards = contextManager.getActiveCards(state.cards, recentText);
        if (activeCards && activeCards.length > 0) {
            const triggeredNames = activeCards.map(c => c.name).join(", ");
            yield { type: "system", content: `LORE ACTIVATED: ${triggeredNames}` };
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
        const systemMsgObj = this.buildSystemMessage(state, activeCards);
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

    async generateSuggestions(state) {
        const messages = [];
        messages.push({
            role: "system",
            content: "You are the Dungeon Master. Based on the story history, generate exactly 3 brief action suggestions of what the player could attempt next. The suggestions must be active, short (less than 10 words each), and starting with a verb (e.g. 'Search the room', 'Talk to the merchant', 'Draw your sword'). Output them ONLY as a numbered list from 1 to 3, with no introductory or concluding text."
        });
        
        for (const turn of state.history) {
            messages.push({ role: turn.role, content: turn.text });
        }
        
        messages.push({
            role: "user",
            content: "Based on the scene above, list exactly 3 short, active suggestion actions for what I can do next. Format as a numbered list (1., 2., 3.). Do not write anything else."
        });
        
        try {
            const response = await this.client.chat.completions.create({
                model: state.model,
                messages,
                temperature: 0.7,
                max_tokens: 64,
                stream: false
            });
            
            const text = response.choices[0].message.content.trim();
            const suggestions = [];
            const lines = text.split('\n');
            for (let line of lines) {
                line = line.trim();
                if (!line) continue;
                const match = line.match(/^\s*(?:\d+[\.\)\:-]?|[\-\*\•])\s*(.*)/);
                if (match) {
                    const cleaned = match[1].trim().replace(/^['"]|['"]$/g, '');
                    if (cleaned) suggestions.push(cleaned);
                }
            }
            
            if (suggestions.length === 0) {
                for (let line of lines) {
                    const cleaned = line.trim().replace(/^['"]|['"]$/g, '');
                    if (cleaned) suggestions.push(cleaned);
                }
            }
            
            const fallbacks = ["Proceed forward", "Look around", "Examine your surroundings"];
            while (suggestions.length < 3) {
                suggestions.push(fallbacks[suggestions.length]);
            }
            return suggestions.slice(0, 3);
        } catch (e) {
            return ["Proceed forward", "Look around", "Examine your surroundings"];
        }
    }
}
