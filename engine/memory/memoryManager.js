import crypto from 'crypto';
import { VectorStore } from './vectorStore.js';
import { StructuredStore } from './structuredStore.js';
import { EventExtractor, validateExtractorOutput } from './eventExtractor.js';
import { BarterEngine } from './barterEngine.js';
import { normalizeItemName, itemNamesMatch } from './itemNames.js';
import { scoreRule } from '../scoring.js';
import { addDebugLog } from '../llmTracker.js';

export class MemoryManager {
    constructor(dataDir, llmClient, embeddingService) {
        this.dataDir = dataDir;
        this.llmClient = llmClient;
        this.embeddingService = embeddingService;

        this.vectorStore = new VectorStore(dataDir);
        this.structuredStore = new StructuredStore(dataDir);
        this.eventExtractor = new EventExtractor(llmClient);
        this.barter = new BarterEngine(this.structuredStore);

        this.turnBuffer = [];
        this.batchSize = 3;
        this.currentAdventureId = null;
        this.lastExtractedTurnIndex = 0;
        this.isFlushing = false;
        this.activeFlushPromise = null;
    }

    async initialize(adventureId) {
        this.currentAdventureId = adventureId;
        this.structuredStore.initAdventure(adventureId);
        this.lastExtractedTurnIndex = this.structuredStore.getLastExtractedTurnIndex(adventureId);
        this.turnBuffer = [];
    }

    bufferTurnPair(turnPair) {
        if (!this.currentAdventureId) return;

        // Skip turns already extracted
        if (turnPair.turnIndex <= this.lastExtractedTurnIndex) {
            return;
        }

        // Avoid adding duplicate turnIndex to the buffer
        const exists = this.turnBuffer.some(t => t.turnIndex === turnPair.turnIndex);
        if (!exists) {
            this.turnBuffer.push(turnPair);
            this.turnBuffer.sort((a, b) => a.turnIndex - b.turnIndex);
        }
    }

    async flushIfReady(state, modelName = "local-model", saveFn, options = {}) {
        const adventureId = state.adventureId;
        if (adventureId !== this.currentAdventureId) {
            await this.initialize(adventureId);
        }

        // If a flush is already in progress, return the existing promise so callers wait for it
        if (this.isFlushing && this.activeFlushPromise) {
            return this.activeFlushPromise;
        }

        // Without force, only flush when buffer reaches batch size
        if (!options.force && this.turnBuffer.length < this.batchSize) {
            return;
        }

        // If buffer is empty, nothing to flush
        if (this.turnBuffer.length === 0) {
            return;
        }

        this.isFlushing = true;
        this.activeFlushPromise = this._doFlush(state, modelName, saveFn);

        try {
            return await this.activeFlushPromise;
        } finally {
            this.isFlushing = false;
            this.activeFlushPromise = null;
        }
    }

    async _doFlush(state, modelName, saveFn) {
        const batch = this.turnBuffer.slice(0, this.batchSize);
        addDebugLog(`Memory manager: flushing queue buffer for turns ${batch.map(t => t.turnIndex).join(', ')}`);

        try {
            await this._extractAndStore(batch, state, modelName, saveFn);
        } catch (e) {
            console.error(`Error flushing memory buffer:`, e);
            addDebugLog(`Memory manager error: extraction failed: ${e.message}`);
        } finally {
            this.turnBuffer = this.turnBuffer.slice(this.batchSize);
        }
    }

    async _extractAndStore(batch, state, modelName, saveFn) {
        const adventureId = state.adventureId;
        const endTurnIndex = batch[batch.length - 1].turnIndex;

        const turnsForExtraction = [];
        for (const pair of batch) {
            turnsForExtraction.push({ role: 'user', text: pair.player });
            turnsForExtraction.push({ role: 'assistant', text: pair.dm });
        }

        const rawExtracted = await this.eventExtractor.extractEvents(turnsForExtraction, modelName);
        // Schema-check the raw extractor output before anything touches SQLite:
        // malformed events/inventory changes/lore facts are skipped (counted in
        // the debug log), valid rows flow on. This applies to the mock fixtures
        // and the real LLM path alike.
        const extracted = validateExtractorOutput(rawExtracted);
        addDebugLog(`Memory manager: extracted ${extracted.events.length} events, ${extracted.inventory_changes.length} inventory changes, and ${extracted.lore_facts.length} lore facts; rejected ${extracted.rejected.events} events, ${extracted.rejected.inventory_changes} inventory changes, and ${extracted.rejected.lore_facts} lore facts.`);

        // 1. Process events
        if (extracted.events && extracted.events.length > 0) {
            const ids = [];
            const documents = [];
            const embeddings = [];
            const metadatas = [];

            for (const event of extracted.events) {
                const entities = event.entities || [];
                const payload = `${adventureId}:${event.type}:${event.summary}:${entities.sort().join(',')}`;
                const eventId = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);

                this.structuredStore.insertEvent(
                    adventureId,
                    eventId,
                    endTurnIndex,
                    event.type,
                    event.summary,
                    event.entities,
                    event.location
                );

                ids.push(eventId);
                documents.push(event.summary);
                metadatas.push({
                    adventureId,
                    turnIndex: endTurnIndex,
                    eventType: event.type,
                    entities: JSON.stringify(entities),
                    location: event.location || ""
                });
            }

            if (documents.length > 0) {
                try {
                    const eventEmbeddings = await this.embeddingService.embedBatch(documents);
                    await this.vectorStore.upsertDocuments(
                        adventureId,
                        ids,
                        documents,
                        eventEmbeddings,
                        metadatas
                    );
                } catch (embErr) {
                    console.error("Failed to generate or store vector embeddings for events, skipping vector store insertion:", embErr);
                    addDebugLog(`Memory manager error: failed vector database sync for ${documents.length} events: ${embErr.message}`);
                }
            }
        }

        // 2. Process trade offers extracted from narration (an NPC proposing a
        //    trade, e.g. "bring me X and I'll give you Y"). Registered before
        //    inventory changes so a trade extracted in the same batch can resolve
        //    through executeBarter.
        if (extracted.offers && extracted.offers.length > 0) {
            for (const offer of extracted.offers) {
                try {
                    this.barter.registerOffer(
                        adventureId,
                        offer.trader_name || 'Unknown Trader',
                        offer.required_item,
                        offer.offered_item,
                        offer.description || null
                    );
                } catch (e) {
                    addDebugLog(`Memory manager: failed to register narrated offer: ${e.message}`);
                }
            }
        }

        // 3. Process inventory changes. A classified trade is routed through
        //    executeBarter (possession check + atomic swap); a refused or
        //    ambiguous trade logs a refusal and applies neither side.
        if (extracted.inventory_changes && extracted.inventory_changes.length > 0) {
            const grantedBySwap = new Set();
            const blockedByRefusal = new Set();

            for (const change of extracted.inventory_changes) {
                if (change.action === 'traded') {
                    const resolution = this._resolveNarratedTrade(adventureId, change.item_name);
                    if (resolution && resolution.offer) {
                        // Atomic swap already released the sold item and granted
                        // the offered item; skip the matching acquisition side.
                        grantedBySwap.add(normalizeItemName(resolution.offer.offered_item));
                        continue;
                    }
                    if (resolution && resolution.refused) {
                        // Refusal already logged; apply neither side of the trade.
                        for (const item of resolution.blockedItems || []) {
                            blockedByRefusal.add(item);
                        }
                        continue;
                    }
                    // No registered offer: apply deterministic removal directly.
                    this.structuredStore.upsertInventoryItem(adventureId, {
                        item_name: change.item_name,
                        item_type: change.item_type || 'misc',
                        description: change.description || null,
                        quantity: change.quantity !== undefined ? change.quantity : 1,
                        acquired_at: change.location || null,
                        acquired_turn: endTurnIndex,
                        status: 'traded'
                    });
                    continue;
                }

                if (grantedBySwap.has(normalizeItemName(change.item_name))) {
                    continue;
                }
                if (blockedByRefusal.has(normalizeItemName(change.item_name))) {
                    continue;
                }

                let status = 'held';
                const qty = change.quantity !== undefined ? change.quantity : 1;

                if (change.action === 'drop') status = 'dropped';
                if (change.action === 'use') status = 'used';
                if (change.action === 'destroy') status = 'destroyed';
                if (change.action === 'equip') status = 'equipped';
                if (change.action === 'traded') status = 'traded';
                if (change.action === 'consume') status = 'used';

                this.structuredStore.upsertInventoryItem(adventureId, {
                    item_name: change.item_name,
                    item_type: change.item_type || 'misc',
                    description: change.description || null,
                    quantity: qty,
                    acquired_at: change.location || null,
                    acquired_turn: endTurnIndex,
                    status: status
                });
            }
        }

        // 4. Process quest goals extracted from narration (an NPC stating an
        //    objective). Narrated goals start IN_PROGRESS (the objective is live).
        if (extracted.goals && extracted.goals.length > 0) {
            for (const goal of extracted.goals) {
                try {
                    const existing = this.structuredStore.db.prepare(
                        'SELECT id FROM quest_goals WHERE adventure_id = ? AND LOWER(npc_name) = LOWER(?) AND LOWER(goal_title) = LOWER(?)'
                    ).get(adventureId, goal.npc_name || '', goal.goal_title || '');
                    if (!existing) {
                        this.barter.createGoal(
                            adventureId,
                            goal.npc_name || 'Unknown NPC',
                            goal.goal_title || 'Untitled objective',
                            goal.required_item || '',
                            goal.reward_item || '',
                            'IN_PROGRESS'
                        );
                    }
                } catch (e) {
                    addDebugLog(`Memory manager: failed to create narrated goal: ${e.message}`);
                }
            }
        }

        // 5. Process lore facts
        if (extracted.lore_facts && extracted.lore_facts.length > 0) {
            for (const fact of extracted.lore_facts) {
                const name = fact.name;
                const type = fact.type || 'lore';
                const description = fact.description || "";
                const triggerWords = fact.trigger_words || [];

                const payload = `${adventureId}:${type}:${name.toLowerCase()}`;
                const loreId = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);

                this.structuredStore.upsertLore(
                    adventureId,
                    loreId,
                    name,
                    type,
                    description,
                    triggerWords,
                    'auto'
                );
            }
            // Sync new lore to state cards
            await this.syncLoreToStateCards(adventureId, state);
        }

        // 6. Score: recompute from the store's distinct events so state.score
        //    tracks milestone progression deterministically (D1/D2). The full
        //    recompute is idempotent (dedup by event id + normalized milestone)
        //    and undo-safe (engine.undo recomputes after rollback). Persist
        //    even when this batch extracted no lore, so the saved score always
        //    reflects the latest store state.
        state.score = this.computeScore(adventureId);
        if (saveFn) {
            await saveFn();
        }

        // Update extraction watermark
        this.lastExtractedTurnIndex = endTurnIndex;
        this.structuredStore.setLastExtractedTurnIndex(adventureId, endTurnIndex);
    }

    // Resolve a narrated trade through the barter engine. Returns:
    //   { offer }                     when the atomic swap succeeded (possession validated)
    //   { refused, blockedItems }     when refused (ambiguous, or the player no longer
    //                                holds the item) — blockedItems names the acquisition
    //                                side(s) that must NOT be applied
    //   null                          when no offer exists at all (caller applies removal directly)
    _resolveNarratedTrade(adventureId, tradedItemName) {
        const offers = this.barter.getAllOffers(adventureId);
        const matches = offers.filter(o => itemNamesMatch(o.required_item, tradedItemName));

        if (matches.length === 0) {
            return null;
        }

        if (matches.length > 1) {
            addDebugLog(`Memory manager: ambiguous narrated trade for ${tradedItemName}; refusing.`);
            return { refused: true, blockedItems: matches.map(o => normalizeItemName(o.offered_item)) };
        }

        const offer = matches[0];
        try {
            this.barter.executeBarter(adventureId, offer.trader_name, offer.required_item);
            return { offer };
        } catch (e) {
            addDebugLog(`Memory manager: narrated trade refused (${e.message}); not applying acquisition.`);
            return { refused: true, blockedItems: [normalizeItemName(offer.offered_item)] };
        }
    }

    async syncLoreToStateCards(adventureId, state) {
        const loreEntries = this.structuredStore.getLore(adventureId);
        const existingNames = new Set(state.cards.map(c => c.name.toLowerCase()));

        for (const entry of loreEntries) {
            if (!existingNames.has(entry.name.toLowerCase())) {
                let triggerWords = [];
                try {
                    triggerWords = JSON.parse(entry.trigger_words);
                } catch (e) {
                    triggerWords = [entry.name.toLowerCase()];
                }

                state.cards.push({
                    id: entry.id,
                    name: entry.name,
                    type: entry.type,
                    description: entry.description,
                    trigger_words: triggerWords,
                    triggers: triggerWords,
                    enabled: entry.enabled === 1,
                    active: entry.enabled === 1
                });
                existingNames.add(entry.name.toLowerCase());
            }
        }
    }

    async recallRelevantMemories(queryText, adventureId, topK = 5) {
        if (process.env.MOCK_LLM === "1") {
            const dbCount = await this.vectorStore.count(adventureId);
            if (dbCount === 0) {
                return [
                    {
                        text: "You found a glowing blue crystal in the merchant's stall.",
                        relevanceScore: 0.9,
                        turnIndex: 1,
                        eventType: "discovery"
                    }
                ];
            }
        }

        try {
            const queryEmbedding = await this.embeddingService.embed(queryText);
            const results = await this.vectorStore.query(adventureId, queryEmbedding, topK);

            return results.map(r => ({
                text: r.document,
                relevanceScore: r.score,
                turnIndex: r.metadata?.turnIndex || 0,
                eventType: r.metadata?.eventType || 'event'
            }));
        } catch (e) {
            console.error("Failed to recall memories:", e);
            return [];
        }
    }

    getInventory(adventureId) {
        return this.structuredStore.getInventory(adventureId);
    }

    getEventLog(adventureId, limit = 20) {
        return this.structuredStore.getEvents(adventureId, limit);
    }

    /**
     * Recompute the engine's score for an adventure from the store's distinct
     * events (D1). A full recompute over all rows with priorScore 0 makes the
     * result idempotent: the store already dedups events by id, and scoreRule
     * additionally dedups by normalized type:summary, so repeated extraction
     * of the same milestone never inflates the total. Undo rolls rows back and
     * callers (engine.undo) recompute to stay consistent.
     *
     * @param {string} adventureId
     * @returns {number} engine-computed score
     */
    computeScore(adventureId) {
        if (!adventureId) return 0;
        const allEvents = this.structuredStore.getEvents(adventureId, 100000);
        return scoreRule(allEvents, 0);
    }

    getStats(adventureId) {
        return this.structuredStore.getStats(adventureId);
    }

    /**
     * Roll back memory for an undone turn (turnIndex = the moves value the turn
     * held when it was buffered). Removes structured rows + vector embeddings
     * for turns >= turnIndex, rewinds the extraction watermark to turnIndex-1
     * in both memory and the store, and drops pending buffered turns being
     * undone so a later flush cannot resurrect them.
     *
     * Awaits any in-flight flush first so rows it writes cannot reappear after
     * the rollback.
     */
    async rollbackTurns(turnIndex) {
        if (!this.currentAdventureId || turnIndex <= 0) return;

        if (this.activeFlushPromise) {
            try {
                await this.activeFlushPromise;
            } catch (e) {
                addDebugLog(`Memory manager warning: in-flight flush failed during rollback: ${e.message}`);
            }
        }

        const adventureId = this.currentAdventureId;
        const eventIds = this.structuredStore.rollbackTurn(adventureId, turnIndex);

        if (eventIds.length > 0) {
            try {
                await this.vectorStore.deleteItems(adventureId, eventIds);
            } catch (e) {
                addDebugLog(`Memory manager warning: failed to delete vector items during rollback: ${e.message}`);
            }
        }

        // Never advance the in-memory watermark; rewind only as far as needed.
        this.lastExtractedTurnIndex = Math.min(this.lastExtractedTurnIndex, Math.max(0, turnIndex - 1));

        this.turnBuffer = this.turnBuffer.filter(t => t.turnIndex < turnIndex);
    }
}
