import { v4 as uuidv4 } from 'uuid';
import { llmTracker, addDebugLog } from './llmTracker.js';

export class ContextManager {
    constructor() {
        this.memoryManager = null;
    }

    getActiveCards(cards, textContext) {
        const activeCards = [];
        for (const card of cards) {
            const triggers = card.trigger_words || card.triggers || [];
            for (const word of triggers) {
                const escaped = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(`\\b${escaped}\\b`, 'i');
                if (regex.test(textContext)) {
                    activeCards.push(card);
                    break;
                }
            }
        }
        return activeCards;
    }

    async summarizeOldTurns(state, client, model, saveFn) {
        if (state.history.length < 4) return;
        const turnsToSummarize = state.history.slice(0, 4);
        state.history = state.history.slice(4);

        addDebugLog(`Context manager: starting background auto-summarization/compression (history length: ${state.history.length + 4} -> ${state.history.length} turns)`);

        if (this.memoryManager) {
            let startTurnIndex = Math.floor(state.archivedHistory.length / 2) + 1;
            for (let i = 0; i < turnsToSummarize.length; i += 2) {
                const userTurn = turnsToSummarize[i];
                const assistantTurn = turnsToSummarize[i + 1];
                if (userTurn && assistantTurn) {
                    this.memoryManager.bufferTurnPair({
                        turnIndex: startTurnIndex,
                        player: userTurn.text,
                        dm: assistantTurn.text
                    });
                }
                startTurnIndex++;
            }
            this.memoryManager.flushIfReady(state, model, saveFn)
                .catch(e => {
                    console.error('Event extraction during summarization failed:', e.message);
                    addDebugLog(`Memory manager error (during summarization flush): ${e.message}`);
                });
        }
        
        let eventsText = "";
        for (const turn of turnsToSummarize) {
            const roleLabel = turn.role === "user" ? "Player" : "Dungeon Master";
            eventsText += `${roleLabel}: ${turn.text}\n`;
        }
        
        const prompt = `You are the chronicler of a fantasy text adventure.
Your job is to update the adventure's running summary.
Incorporate the new events in the LOG into the EXISTING SUMMARY.
Produce a single, concise summary (1-2 paragraphs) in the third person. Keep track of characters met, inventory items acquired/lost, locations visited, and the current goal.

EXISTING SUMMARY:
${state.summary || "The adventure has just begun."}

LOG OF NEW EVENTS:
${eventsText}

Provide ONLY the updated summary text. Do not write introductory words like "Here is the summary" or use markdown code blocks. Just print the summary.`;

        const messages = [
            { role: "system", content: "You are a concise summarizer for a text adventure game." },
            { role: "user", content: prompt }
        ];
        const callId = llmTracker.startCall('summarization', messages);

        try {
            const response = await client.chat.completions.create({
                model: model,
                messages,
                temperature: 0.5,
                max_tokens: 250
            });
            
            let summaryContent = response.choices[0].message.content.trim();
            summaryContent = summaryContent.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
            
            state.summary = summaryContent;
            state.archivedHistory.push(...turnsToSummarize);
            await saveFn();
            llmTracker.endCall(callId, summaryContent);
            addDebugLog("Context manager: auto-summarization completed. Updated memory summary.");
        } catch (e) {
            llmTracker.failCall(callId, e);
            state.history = [...turnsToSummarize, ...state.history];
            addDebugLog(`Context manager error: summarization failed: ${e.message}`);
            throw new Error(`Summarization failed: ${e.message}`);
        }
    }

    async autoGenerateCards(state, client, model, saveFn) {
        if (state.history.length === 0 && state.archivedHistory.length === 0) return [];
        const combinedTurns = [...state.archivedHistory.slice(-4), ...state.history];
        
        let logText = "";
        for (const turn of combinedTurns) {
            const roleLabel = turn.role === "user" ? "Player" : "DM";
            logText += `${roleLabel}: ${turn.text}\n`;
        }
        
        const prompt = `You are an AI assistant analyzing a text adventure log.
Identify any key characters, locations, items, or lore elements introduced or described in the log below.
Create a Context Card for each entity.

Output MUST be a valid JSON array of objects. Do not wrap the JSON in markdown code blocks. Do not write any explanations before or after the JSON.
Each object in the JSON array must have exactly these keys:
- "name": the entity's name (string)
- "type": one of "character", "location", "item", "lore" (string)
- "description": a concise 1-2 sentence description of their appearance, personality, or properties (string)
- "trigger_words": a list of 2-4 keywords or aliases that, when mentioned, should trigger this card (array of strings, case-insensitive)

Adventure Log:
${logText}

JSON Output:`;

        const messages = [
            { role: "system", content: "You are an assistant that outputs structured data in pure JSON." },
            { role: "user", content: prompt }
        ];
        const callId = llmTracker.startCall('card_extraction', messages);
        try {
            const response = await client.chat.completions.create({
                model: model,
                messages,
                temperature: 0.3,
                max_tokens: 800
            });
            
            let rawOutput = response.choices[0].message.content.trim();
            llmTracker.endCall(callId, rawOutput);
            rawOutput = rawOutput.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
            
            const startIdx = rawOutput.indexOf('[');
            const endIdx = rawOutput.lastIndexOf(']');
            let jsonStr = rawOutput;
            if (startIdx !== -1 && endIdx !== -1) {
                jsonStr = rawOutput.substring(startIdx, endIdx + 1);
            }
            
            const newCards = JSON.parse(jsonStr);
            const addedCards = [];
            const existingNames = new Set(state.cards.map(c => c.name.toLowerCase()));
            
            for (const card of newCards) {
                if (card.name && !existingNames.has(card.name.toLowerCase())) {
                    card.id = uuidv4().substring(0, 6);
                    card.trigger_words = card.trigger_words || card.triggers || [];
                    card.triggers = card.triggers || card.trigger_words || [];
                    card.enabled = true;
                    card.active = true;
                    state.cards.push(card);
                    addedCards.push(card);
                }
            }
            
            if (addedCards.length > 0) {
                await saveFn();
            }
            return addedCards;
        } catch (e) {
            llmTracker.failCall(callId, e);
            throw new Error(`Lore extraction failed: ${e.message}`);
        }
    }

    async getRAGContext(queryText, adventureId, topK = 5) {
        if (!this.memoryManager) return [];
        return this.memoryManager.recallRelevantMemories(queryText, adventureId, topK);
    }
}
