import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { AdventureState } from './state.js';
import { ContextManager } from './context.js';
import { LlmOrchestrator } from './llm.js';
import { MemoryManager } from './memory/memoryManager.js';
import { EmbeddingService } from './memory/embeddings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_SYSTEM_PROMPT = `You are the parser and narrator for a classic text-based adventure game in the style of Zork.
Describe the environment, characters, and results of actions in a sarcastic, conversational, and direct tone, similar to a Game Master in a tabletop RPG.
Keep your responses extremely concise and curt.
For simple physical actions, reply with a single short sentence or phrase (e.g., "Taken.", "Closed.", "You can't go that way.").
Only provide longer room descriptions (1-2 paragraphs) when the player enters a new location or explicitly types "look".
Use the second-person perspective ("You").
Do not write dialogue or actions for the player character ("You").
Never break character.
Do not write suggestions, choices, options lists, or any trailing questions asking the player what they want to do next (e.g. do not ask "What do you do?" or "What is your next move?"). Let the player decide entirely on their own.
Only reference or use items that are in the player's [CURRENT INVENTORY] or that are clearly present in the immediate location. Do not invent, assume, or list options/choices with hallucinated items that the player does not possess.

Example 1:
Player: open mailbox
Narrator: Opening the small mailbox reveals a leaflet.
[Status: West of House | Score: 0]

Example 2:
Player: take leaflet
Narrator: Taken.
[Status: West of House | Score: 0]

Example 3:
Player: go north
Narrator: North of House
You are facing the north side of a white house. A forest stretches to the north.
[Status: North of House | Score: 0]

At the very end of EVERY response, you MUST append the current status on a new line in this exact format:
[Status: <Location Name> | Score: <Current Score>]
Do not write anything else on the status line.`;

export class AdventureEngine {
    constructor(saveDir = null) {
        if (!saveDir) {
            if (process.env.SAVE_DIR) {
                this.saveDir = path.resolve(process.env.SAVE_DIR);
            } else {
                this.saveDir = path.join(__dirname, '..', 'game', 'adventures');
            }
        } else {
            this.saveDir = saveDir;
        }
        
        fs.mkdir(this.saveDir, { recursive: true }).catch(() => {});

        this.state = new AdventureState();
        this.context = new ContextManager();
        this.llm = new LlmOrchestrator();

        const dataDir = path.join(this.saveDir, '..', 'data');
        const embeddingService = new EmbeddingService(this.llm.client);
        this.memory = new MemoryManager(dataDir, this.llm.client, embeddingService);
        this.context.memoryManager = this.memory;
    }

    // Proxy getters and setters to maintain exactly the same public property access
    get adventureId() { return this.state.adventureId; }
    set adventureId(val) { this.state.adventureId = val; }

    get title() { return this.state.title; }
    set title(val) { this.state.title = val; }

    get systemPrompt() { return this.state.systemPrompt; }
    set systemPrompt(val) { this.state.systemPrompt = val; }

    get summary() { return this.state.summary; }
    set summary(val) { this.state.summary = val; }

    get cards() { return this.state.cards; }

    set cards(val) { this.state.cards = val; }

    get history() { return this.state.history; }
    set history(val) { this.state.history = val; }

    get archivedHistory() { return this.state.archivedHistory; }
    set archivedHistory(val) { this.state.archivedHistory = val; }


    get location() { return this.state.location; }
    set location(val) { this.state.location = val; }

    get score() { return this.state.score; }
    set score(val) { this.state.score = val; }

    get moves() { return this.state.moves; }
    set moves(val) { this.state.moves = val; }

    get model() { return this.state.model; }
    set model(val) { this.state.model = val; }

    get temperature() { return this.state.temperature; }
    set temperature(val) { this.state.temperature = val; }

    get maxTokens() { return this.state.maxTokens; }
    set maxTokens(val) { this.state.maxTokens = val; }

    get summarizeThreshold() { return this.state.summarizeThreshold; }
    set summarizeThreshold(val) { this.state.summarizeThreshold = val; }

    get autoSummarize() { return this.state.autoSummarize; }
    set autoSummarize(val) { this.state.autoSummarize = val; }

    // client expose
    get client() { return this.llm.client; }

    async getLoadedModel() {
        return this.llm.getLoadedModel();
    }

    async newAdventure(title = "New Adventure", systemPrompt = null) {
        const { v4: uuidv4 } = await import('uuid');
        this.state.adventureId = uuidv4().substring(0, 8);
        this.state.title = title;
        this.state.systemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
        this.state.summary = "";
        this.state.cards = [];
        this.state.history = [];
        this.state.archivedHistory = [];
        this.state.location = "West of House";
        this.state.score = 0;
        this.state.moves = 0;
        
        const resolved = await this.getLoadedModel();
        this.state.model = typeof resolved === "string" ? resolved : "local-model";
        
        await this.memory.initialize(this.state.adventureId);
        await this.save();
        return this.state.adventureId;
    }

    async save() {
        await this.state.save(this.saveDir);
    }

    async load(adventureId) {
        await this.state.load(this.saveDir, adventureId, () => this.getLoadedModel());
        await this.memory.initialize(adventureId);
    }

    async listAdventures() {
        return this.state.list(this.saveDir);
    }

    async deleteAdventure(adventureId) {
        try {
            await this.memory.vectorStore.deleteIndex(adventureId);
            this.memory.structuredStore.deleteAdventureData(adventureId);
        } catch (e) {
            console.error(`Error deleting memory indexes for ${adventureId}:`, e);
        }
        return this.state.delete(this.saveDir, adventureId);
    }

    async undo() {
        const result = this.state.undo();
        await this.save();
        return result;
    }

    async editTurn(index, newText) {
        const result = this.state.editTurn(index, newText);
        if (result) await this.save();
        return result;
    }

    getActiveCards(textContext) {
        return this.context.getActiveCards(this.state.cards, textContext);
    }

    buildSystemMessage(activeCards = null) {
        return this.llm.buildSystemMessage(this.state, activeCards);
    }

    formatUserInput(actionType, text) {
        if (actionType === "continue") return "";
        const cleaned = text.trim();
        if (actionType === "do" || actionType === "say" || actionType === "story") {
            if (cleaned.startsWith(">")) return cleaned;
            return `> ${cleaned}`;
        }
        return cleaned;
    }

    generateResponseStream(actionType, text) {
        return this.llm.generateResponseStream(
            this.state,
            actionType,
            text,
            this.context,
            () => this.save()
        );
    }

    regenerateLastResponse() {
        return this.llm.regenerateLastResponse(
            this.state,
            this.context,
            () => this.save()
        );
    }

    async getInventory() {
        return this.memory.getInventory(this.state.adventureId);
    }

    async getEventLog(limit = 20) {
        return this.memory.getEventLog(this.state.adventureId, limit);
    }

    async searchMemories(query, topK = 5) {
        return this.memory.recallRelevantMemories(query, this.state.adventureId, topK);
    }

    async summarizeOldTurns() {
        await this.context.summarizeOldTurns(
            this.state,
            this.client,
            this.state.model,
            () => this.save()
        );
    }

    async autoGenerateCards() {
        return this.context.autoGenerateCards(
            this.state,
            this.client,
            this.state.model,
            () => this.save()
        );
    }

    async addManualCard(name, cardType, description, triggerWords) {
        const { v4: uuidv4 } = await import('uuid');
        const cardId = uuidv4().substring(0, 6);
        const card = {
            id: cardId,
            name: name,
            type: cardType,
            description: description,
            trigger_words: triggerWords.map(w => w.trim()).filter(Boolean),
            triggers: triggerWords.map(w => w.trim()).filter(Boolean),
            enabled: true,
            active: true
        };
        this.state.cards.push(card);
        await this.save();
        return card;
    }

    async deleteCard(cardId) {
        const originalLen = this.state.cards.length;
        this.state.cards = this.state.cards.filter(c => c.id !== cardId);
        if (this.state.cards.length < originalLen) {
            await this.save();
            return true;
        }
        return false;
    }
}
