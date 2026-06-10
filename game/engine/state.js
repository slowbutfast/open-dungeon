import fs from 'fs/promises';
import path from 'path';

export class AdventureState {
    constructor() {
        this.adventureId = null;
        this.title = "New Adventure";
        this.systemPrompt = "";
        this.summary = "";
        this.cards = [];
        this.history = [];
        this.archivedHistory = [];
        this.location = "West of House";
        this.score = 0;
        this.moves = 0;
        this.model = "local-model";
        this.temperature = 0.8;
        this.maxTokens = 300;
        this.summarizeThreshold = 8;
        this.autoSummarize = true;
    }

    async save(saveDir) {
        if (!this.adventureId) {
            throw new Error("No active adventure to save.");
        }
        const filepath = path.join(saveDir, `${this.adventureId}.json`);
        const data = {
            adventure_id: this.adventureId,
            title: this.title,
            system_prompt: this.systemPrompt,
            summary: this.summary,
            cards: this.cards,
            history: this.history,
            archived_history: this.archivedHistory,
            model: this.model,
            temperature: this.temperature,
            max_tokens: this.maxTokens,
            summarize_threshold: this.summarizeThreshold,
            auto_summarize: this.autoSummarize,
            location: this.location,
            score: this.score,
            moves: this.moves
        };
        await fs.writeFile(filepath, JSON.stringify(data, null, 4), 'utf-8');
    }

    async load(saveDir, adventureId, getLoadedModelFn) {
        const filepath = path.join(saveDir, `${adventureId}.json`);
        try {
            const fileData = await fs.readFile(filepath, 'utf-8');
            const state = JSON.parse(fileData);
            
            this.adventureId = state.adventure_id;
            this.title = state.title || "Loaded Adventure";
            this.systemPrompt = state.system_prompt;
            this.summary = state.summary || "";
            this.cards = (state.cards || []).map(card => ({
                id: card.id,
                name: card.name,
                type: card.type,
                description: card.description,
                trigger_words: card.trigger_words || card.triggers || [],
                triggers: card.triggers || card.trigger_words || [],
                enabled: card.enabled !== undefined ? card.enabled : (card.active !== undefined ? card.active : true),
                active: card.active !== undefined ? card.active : (card.enabled !== undefined ? card.enabled : true)
            }));
            this.history = state.history || [];
            this.archivedHistory = state.archived_history || [];
            
            const loadedModel = await getLoadedModelFn();
            if (loadedModel && loadedModel !== "local-model") {
                this.model = loadedModel;
            } else {
                this.model = state.model || "local-model";
            }
            
            this.temperature = state.temperature !== undefined ? state.temperature : 0.8;
            this.maxTokens = state.max_tokens !== undefined ? state.max_tokens : 300;
            this.summarizeThreshold = state.summarize_threshold !== undefined ? state.summarize_threshold : 8;
            this.autoSummarize = state.auto_summarize !== undefined ? state.auto_summarize : true;
            this.location = state.location || "West of House";
            this.score = state.score !== undefined ? state.score : 0;
            this.moves = state.moves !== undefined ? state.moves : 0;
        } catch (e) {
            throw new Error(`Adventure ${adventureId} not found.`);
        }
    }

    async list(saveDir) {
        const adventures = [];
        try {
            const files = await fs.readdir(saveDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const data = await fs.readFile(path.join(saveDir, file), 'utf-8');
                        const state = JSON.parse(data);
                        adventures.push({
                            id: state.adventure_id,
                            title: state.title || "Untitled Adventure",
                            turns: (state.history || []).length + (state.archived_history || []).length,
                            summary: state.summary || "",
                            location: state.location || "West of House",
                            score: state.score || 0,
                            moves: state.moves || 0
                        });
                    } catch (err) {
                        // Skip unreadable files
                    }
                }
            }
        } catch (e) {
            // Directory empty or missing
        }
        return adventures;
    }

    async delete(saveDir, adventureId) {
        const filepath = path.join(saveDir, `${adventureId}.json`);
        try {
            await fs.unlink(filepath);
            return true;
        } catch (e) {
            return false;
        }
    }

    undo() {
        if (this.history.length >= 2) {
            const assistantTurn = this.history.pop();
            const userTurn = this.history.pop();
            return { userTurn, assistantTurn };
        } else if (this.history.length === 1) {
            const userTurn = this.history.pop();
            return { userTurn, assistantTurn: null };
        }
        return { userTurn: null, assistantTurn: null };
    }

    editTurn(index, newText) {
        if (index >= 0 && index < this.history.length) {
            this.history[index].text = newText;
            return true;
        }
        return false;
    }
}
