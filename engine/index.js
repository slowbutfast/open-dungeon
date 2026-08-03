import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { AdventureState } from './state.js';
import { ContextManager } from './context.js';
import { LlmOrchestrator } from './llm.js';
import { MemoryManager } from './memory/memoryManager.js';
import { EmbeddingService } from './memory/embeddings.js';
import { BarterEngine } from './memory/barterEngine.js';
import { loadPresets, savePresets as savePresetsFile } from './storyPresets.js';
import { STATUS_FORMAT } from './statusFormat.js';

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
[Status: West of House | Score: 0 | Moves: 0]

Example 2:
Player: take leaflet
Narrator: Taken.
[Status: West of House | Score: 0 | Moves: 1]

Example 3:
Player: go north
Narrator: North of House
You are facing the north side of a white house. A forest stretches to the north.
[Status: North of House | Score: 0 | Moves: 2]

At the very end of EVERY response, you MUST append the current status on a new line in this exact format:
${STATUS_FORMAT}
If the player attempts to use, reference, or equip an item that is NOT listed in [CURRENT INVENTORY] and NOT clearly present in the immediate location description, you MUST refuse the action with a short explanation that they do not have that item.
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
        this.barter = new BarterEngine(this.memory.structuredStore);
        this.memory.barter = this.barter;
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
        this.memory.modelName = this.state.model;
        
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
        this.memory.modelName = this.state.model;
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
        const preUndoMoves = this.state.moves;
        const result = this.state.undo();

        if (result.userTurn || result.assistantTurn) {
            // Roll back memory for the undone turn (indexed by the moves value
            // it held when buffered) before decrementing moves. rollbackTurns
            // awaits any in-flight flush so it cannot resurrect rolled-back rows.
            if (preUndoMoves > 0) {
                await this.memory.rollbackTurns(preUndoMoves);
            }
            this.state.moves = Math.max(0, this.state.moves - 1);
            // Score derives from the store's distinct events; the rollback just
            // removed the undone turn's milestones, so recompute to keep score
            // consistent with memory (fix-score-progression, D1).
            this.state.score = this.memory.computeScore(this.state.adventureId);
        }

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

    registerOffer(traderName, requiredItem, offeredItem, description = null) {
        return this.barter.registerOffer(this.state.adventureId, traderName, requiredItem, offeredItem, description);
    }

    getOffers(traderName = null) {
        if (traderName) {
            return this.barter.getOffersForTrader(this.state.adventureId, traderName);
        }
        return this.barter.getAllOffers(this.state.adventureId);
    }

    executeBarter(traderName, requiredItem) {
        return this.barter.executeBarter(this.state.adventureId, traderName, requiredItem);
    }

    createGoal(npcName, goalTitle, requiredItem, rewardItem) {
        return this.barter.createGoal(this.state.adventureId, npcName, goalTitle, requiredItem, rewardItem);
    }

    getGoals() {
        return this.barter.getActiveGoals(this.state.adventureId);
    }

    acceptGoal(goalId) {
        return this.barter.acceptGoal(this.state.adventureId, goalId);
    }

    failGoal(goalId) {
        return this.barter.failGoal(this.state.adventureId, goalId);
    }

    completeGoal(goalId) {
        return this.barter.completeGoal(this.state.adventureId, goalId);
    }

    async searchMemories(query, topK = 5) {
        return this.memory.recallRelevantMemories(query, this.state.adventureId, topK);
    }

    async summarizeOldTurns() {
        await this.context.summarizeOldTurns(
            this.state,
            this.llm.client,
            this.state.model,
            () => this.save()
        );
    }

    async autoGenerateCards() {
        return this.context.autoGenerateCards(
            this.state,
            this.llm.client,
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
        // The recovery path for a poisoned/unwanted card (GH #15): delete the
        // store row (so `dungeon_inspect_lore` and a later re-sync cannot
        // resurrect it) AND remove it from the in-memory cards list (so its
        // triggers stop auto-injecting). `state.cards` is the firing source;
        // the store is the persistent record. Deleting either counts as a
        // removal so a card in only one location is still fully removable.
        let removed = false;
        if (this.state.adventureId) {
            try {
                removed = this.memory.structuredStore.deleteLore(this.state.adventureId, cardId) || removed;
            } catch (e) {
                // Row may not exist; continue to the in-memory removal.
            }
        }
        const originalLen = this.state.cards.length;
        this.state.cards = this.state.cards.filter(c => c.id !== cardId);
        if (this.state.cards.length < originalLen) {
            removed = true;
        }
        if (removed) {
            await this.save();
        }
        return removed;
    }

    async getPresets() {
        return loadPresets(this.saveDir);
    }

    async savePresets(presets) {
        await savePresetsFile(this.saveDir, presets);
    }
}
