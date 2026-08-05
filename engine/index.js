import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { AdventureState } from './state.js';
import { ContextManager } from './context.js';
import { LlmOrchestrator } from './llm.js';
import { MemoryManager } from './memory/memoryManager.js';
import { EmbeddingService } from './memory/embeddings.js';
import { loadPresets, savePresets as savePresetsFile } from './storyPresets.js';
import { STATUS_FORMAT } from './statusFormat.js';
import { formatUserInput } from './llmAdapter.js';
import { computeRegions } from './memory/roomMap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_SYSTEM_PROMPT = `You are the parser and narrator for a classic text-based adventure game in the style of Zork.
Describe the environment, characters, and results of actions in a sarcastic, conversational, and direct tone, similar to a Game Master in a tabletop RPG.
Adopt the tone implied by the player's opening and hold it consistently for the entire session; do not drift mid-session.
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
Whenever your narration moves the player to a different place, the Location field MUST name the new place in the status line (never the previous location).
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
        // Single BarterEngine instance (memory-schema-boundary): MemoryManager
        // constructs it over its structured store; the engine exposes the same
        // object so `engine.barter === engine.memory.barter` and
        // `engine.barter.store === engine.memory.structuredStore`.
        this.barter = this.memory.barter;
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

    get currentRoomId() { return this.state.currentRoomId; }
    set currentRoomId(val) { this.state.currentRoomId = val; }

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

    // Narrator style override (narrator-style-fidelity, 3.2): an explicit
    // style label pins the session style without auto-detection. Pass a label
    // from engine/narratorStyle.js STYLE_DIRECTIVES, or null to let the next
    // turn auto-detect (detection only fires when the style is unpinned).
    setNarratorStyle(style) {
        this.state.narratorStyle = style;
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
        this.state.currentRoomId = null;
        this.state.score = 0;
        this.state.moves = 0;
        // Stale-status tracking is session-scoped (narrator-style-fidelity,
        // GH #38): a reused engine (the MCP server's single instance) must not
        // carry the previous session's narrator status line into this one.
        this.llm.lastStatusLocation = null;
        
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
        this.llm.lastStatusLocation = null;
        this._initCurrentRoomFromLocation();
    }

    // D4 / task 4.4 (spatial-map-region-graph): an old save (or any save
    // without a persisted current_room_id) resolves its current room from the
    // stored location — reusing a matching room node if one exists, otherwise
    // establishing one (first_turn 0 keeps it off the rollback surface, since
    // only turns >= 1 ever roll back). Best-effort: a broken spatial store
    // must not break load.
    _initCurrentRoomFromLocation() {
        if (this.state.currentRoomId != null || !this.state.location) return;
        const store = this.memory?.structuredStore;
        if (!store || !this.state.adventureId) return;
        try {
            const known = store.findRoomByName(this.state.adventureId, this.state.location);
            if (known) {
                this.state.currentRoomId = known.id;
                return;
            }
            const roomId = `rm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            const room = store.upsertRoom(this.state.adventureId, roomId, this.state.location, null, 0);
            store.recordVisit(this.state.adventureId, room.id, 0);
            this.state.currentRoomId = room.id;
        } catch (e) {
            console.warn(`Failed to initialize the current room from location: ${e.message}`);
        }
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
        // D5 (spatial-map-region-graph): capture the pre-turn room BEFORE the
        // rollback removes the undone turn's rows. The room the player was in
        // before this turn is the last room_visits row at or before
        // preUndoMoves - 1 (the visits trail is the authoritative re-anchor
        // source and doubles as the room graph's undo trail).
        const preTurnRoomId = this._findPreTurnRoom(preUndoMoves);
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
            // Undo restores the room identity (D5): currentRoomId + the
            // canonical location revert to the pre-turn room, and the undone
            // turn's spatial rows are already gone (rollbackTurns above).
            this._restorePreTurnRoom(preTurnRoomId, preUndoMoves);
        }

        await this.save();
        return result;
    }

    // D5: the room the player was in before the undone turn — the last visit
    // row at or before preUndoMoves - 1. Null when there is no prior visit
    // (undoing the first turn, or no spatial rows yet).
    _findPreTurnRoom(preUndoMoves) {
        const store = this.memory?.structuredStore;
        if (!store || !this.state.adventureId) return null;
        try {
            const visit = store.getLastVisitAtOrBefore(this.state.adventureId, preUndoMoves - 1);
            return visit ? visit.room_id : null;
        } catch (e) {
            return null;
        }
    }

    // D5: restore currentRoomId/location to the pre-turn room AFTER rollback.
    // Undoing the very first turn (no prior visit) resets to the initial
    // "West of House". 8.2: when the undone turn was NOT the very first but
    // still has no prior visit trail (the web flow buffers its greeting at
    // moves=1 without spatially reconciling it, so the first action is turn 2
    // with an empty trail), the stale currentRoomId must not survive —
    // rollback deleted the room it points at. Null the id and restore the
    // pre-turn location captured at turn-commit time.
    _restorePreTurnRoom(preTurnRoomId, preUndoMoves) {
        const store = this.memory?.structuredStore;
        if (preTurnRoomId) {
            const room = store?.getRoom(this.state.adventureId, preTurnRoomId);
            if (room) {
                this.state.currentRoomId = room.id;
                this.state.location = room.name;
                // 8.7: rewind the location stack past the undone turn so the
                // NEXT undo restores the correct pre-turn location (the single
                // previousLocation slot went stale after a middle undo).
                this.state.locationHistory.pop();
                this.state.previousLocation =
                    this.state.locationHistory.length > 0
                        ? this.state.locationHistory[this.state.locationHistory.length - 1]
                        : null;
            }
            return;
        }
        this.state.currentRoomId = null;
        // 8.7: pop the undone turn's pushed location. When restoring to a
        // pre-turn room this already happened above; when there's no trail
        // (first-action undo in the web flow) pop here and use the popped value.
        const popped = this.state.locationHistory.pop();
        if (popped !== undefined) {
            this.state.location = popped;
            this.state.previousLocation =
                this.state.locationHistory.length > 0
                    ? this.state.locationHistory[this.state.locationHistory.length - 1]
                    : null;
        } else if (this.state.previousLocation) {
            this.state.location = this.state.previousLocation;
        } else if (preUndoMoves <= 1) {
            // newAdventure flow, very first turn: back to the initial default.
            this.state.location = "West of House";
        }
        // else: no turn ever committed a location (suspicious-status turns
        // only) — the current location is already the pre-turn one. Leave it.
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
        // Single shared definition (llm-adapter-unification): the same
        // formatter the live turn path in engine/llm.js uses.
        return formatUserInput(actionType, text);
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

    // ─── Spatial map proxies (spatial-map-region-graph, 6.1) ────────────────

    /**
     * The adventure's spatial map: rooms (id, canonical name, visit counts),
     * edges (from, direction, to, kind, inferred flag), the current room id,
     * and region groupings of walk-connected rooms. Callers that need
     * read-through freshness flush first (MCP tools reuse forceFlushBeforeRead).
     */
    async getMap() {
        const store = this.memory?.structuredStore;
        const adventureId = this.state.adventureId;
        if (!store || !adventureId) return null;

        const rooms = store.getRooms(adventureId);
        const edges = store.getEdges(adventureId);

        let currentRoomId = this.state.currentRoomId;
        if (!currentRoomId) {
            const byName = store.findRoomByName(adventureId, this.state.location);
            currentRoomId = byName ? byName.id : null;
        }

        return {
            rooms: rooms.map(r => ({
                id: r.id,
                name: r.name,
                first_turn: r.first_turn,
                last_visit_turn: r.last_visit_turn,
                visit_count: r.visit_count
            })),
            edges: edges.map(e => ({
                from: e.from_room,
                direction: e.direction,
                to: e.to_room,
                kind: e.kind,
                inferred: e.inferred
            })),
            current_room_id: currentRoomId,
            regions: computeRegions(rooms, edges)
        };
    }

    /**
     * A single room's detail: canonical name, description/lore link,
     * outgoing + incoming edges with their kinds, and the last visit turn.
     * Returns null for an unknown room id.
     */
    async getRoom(roomId) {
        const store = this.memory?.structuredStore;
        const adventureId = this.state.adventureId;
        if (!store || !adventureId || !roomId) return null;

        const room = store.getRoom(adventureId, roomId);
        if (!room) return null;

        const outgoing = store.getExits(adventureId, roomId);
        const incoming = store.getIncomingExits(adventureId, roomId);
        const lastVisit = store.getLastVisit(adventureId, roomId);

        return {
            id: room.id,
            name: room.name,
            description: room.description || null,
            first_turn: room.first_turn,
            visit_count: room.visit_count,
            last_visit_turn: lastVisit ? lastVisit.turn : null,
            exits_out: outgoing.map(e => ({
                direction: e.direction,
                to_room: e.to_room,
                kind: e.kind,
                inferred: e.inferred
            })),
            exits_in: incoming.map(e => ({
                from_room: e.from_room,
                direction: e.direction,
                kind: e.kind,
                inferred: e.inferred
            }))
        };
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
