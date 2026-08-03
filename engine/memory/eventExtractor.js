import { llmCall } from '../llmAdapter.js';

// ─── Extractor output validation ────────────────────────────────────────────
//
// The extractor's raw model output is written straight into permanent SQLite
// state, so every row is schema-checked here BEFORE it reaches the store
// (validate-memory-extraction). Malformed rows are rejected and counted, valid
// rows pass through. Trigger tokens are filtered in the same pass: single
// common words, sub-length tokens, and game-mechanical vocabulary are dropped
// so a lore card cannot auto-fire on nearly every turn.

// Game-system vocabulary that would over-trigger if accepted as a lore trigger
// token (`score` on any "check my score", `inventory` on the current-inventory
// block, `system prompt` on prompt echoes, ...). Matches are made on the
// lowercased word, and a token containing any stop-listed word is rejected.
const MECHANICAL_TRIGGER_WORDS = new Set([
    'score', 'inventory', 'status', 'admin', 'system', 'prompt',
    'location', 'moves', 'summary', 'quantity', 'trigger', 'current',
    'history', 'events', 'item', 'items', 'card', 'cards',
    // Single common words observed over-triggering in live play (GH #14).
    'trade', 'north', 'door',
]);

const VALID_EVENT_TYPES = new Set([
    'combat', 'dialogue', 'discovery', 'quest', 'death', 'trade', 'movement',
]);

const VALID_INVENTORY_ACTIONS = new Set([
    'acquire', 'drop', 'use', 'equip', 'destroy', 'traded', 'consume',
]);

// The documented lore-card types from the extraction prompt.
const VALID_LORE_TYPES = new Set([
    'character', 'location', 'item', 'lore', 'faction',
]);

/**
 * Filter a lore card's trigger tokens. A token is rejected when it is:
 *  - not a string, or empty after trimming;
 *  - shorter than 3 characters;
 *  - a single common word or game-mechanical vocabulary (its lowercase form
 *    matches the stop-list, or any of its space-separated words does).
 *
 * @param {*} tokens - raw trigger_words value from the extractor
 * @returns {string[]} the valid trigger tokens
 */
export function filterTriggerTokens(tokens) {
    if (!Array.isArray(tokens)) return [];
    const kept = [];
    for (const token of tokens) {
        if (typeof token !== 'string') continue;
        const trimmed = token.trim();
        if (trimmed.length < 3) continue;
        const words = trimmed.toLowerCase().split(/\s+/);
        if (words.some(w => MECHANICAL_TRIGGER_WORDS.has(w))) continue;
        kept.push(trimmed);
    }
    return kept;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isValidEvent(event) {
    if (!event || typeof event !== 'object') return false;
    if (!isNonEmptyString(event.type) || !VALID_EVENT_TYPES.has(event.type)) return false;
    if (!isNonEmptyString(event.summary)) return false;
    if (event.entities !== undefined && event.entities !== null && !Array.isArray(event.entities)) {
        return false;
    }
    return true;
}

function isValidInventoryChange(change) {
    if (!change || typeof change !== 'object') return false;
    if (!isNonEmptyString(change.item_name)) return false;
    if (!isNonEmptyString(change.action) || !VALID_INVENTORY_ACTIONS.has(change.action)) return false;
    if (change.quantity !== undefined && change.quantity !== null) {
        if (typeof change.quantity !== 'number' || !Number.isFinite(change.quantity) || change.quantity < 0) {
            return false;
        }
    }
    return true;
}

/**
 * Validate and sanitize a single lore fact. The card's trigger tokens are
 * filtered; a card whose entire trigger list is rejected (or missing) is
 * invalid and must not be stored — the system SHALL NOT auto-inject a card
 * whose trigger list is empty or invalid.
 *
 * @param {*} fact - raw lore_fact row from the extractor
 * @returns {{name: string, type: string, description: string, trigger_words: string[]}|null}
 */
function validateLoreFact(fact) {
    if (!fact || typeof fact !== 'object') return null;
    if (!isNonEmptyString(fact.name)) return null;
    if (!isNonEmptyString(fact.type) || !VALID_LORE_TYPES.has(fact.type)) return null;
    const triggerWords = filterTriggerTokens(fact.trigger_words);
    if (triggerWords.length === 0) return null;
    return {
        name: fact.name,
        type: fact.type,
        description: typeof fact.description === 'string' ? fact.description : "",
        trigger_words: triggerWords
    };
}

/**
 * Schema-check the extractor's parsed output before it touches SQLite.
 *
 * Malformed `events` / `inventory_changes` / `lore_facts` rows are rejected
 * (skipped, never persisted) and counted in `result.rejected`; valid rows flow
 * through. `offers` and `goals` are passed through unchanged — only the three
 * ground-truth sections are validated.
 *
 * @param {object} output - the parsed extractor output
 * @returns {{
 *   events: object[], inventory_changes: object[], lore_facts: object[],
 *   offers: object[], goals: object[],
 *   rejected: { events: number, inventory_changes: number, lore_facts: number }
 * }}
 */
export function validateExtractorOutput(output) {
    const result = {
        events: [],
        inventory_changes: [],
        lore_facts: [],
        offers: [],
        goals: [],
        rejected: { events: 0, inventory_changes: 0, lore_facts: 0 }
    };
    if (!output || typeof output !== 'object') return result;

    for (const event of Array.isArray(output.events) ? output.events : []) {
        if (isValidEvent(event)) {
            result.events.push(event);
        } else {
            result.rejected.events += 1;
        }
    }

    for (const change of Array.isArray(output.inventory_changes) ? output.inventory_changes : []) {
        if (isValidInventoryChange(change)) {
            result.inventory_changes.push(change);
        } else {
            result.rejected.inventory_changes += 1;
        }
    }

    for (const fact of Array.isArray(output.lore_facts) ? output.lore_facts : []) {
        const valid = validateLoreFact(fact);
        if (valid) {
            result.lore_facts.push(valid);
        } else {
            result.rejected.lore_facts += 1;
        }
    }

    result.offers = Array.isArray(output.offers) ? output.offers : [];
    result.goals = Array.isArray(output.goals) ? output.goals : [];
    return result;
}

export class EventExtractor {
    constructor(client) {
        this.client = client;
    }

    async extractEvents(turns, modelName = "local-model") {
        const formattedHistory = turns.map(t => {
            const roleName = t.role === 'user' ? 'Player' : 'Dungeon Master';
            return `[${roleName}]: ${t.text}`;
        }).join('\n');

        if (process.env.MOCK_LLM === "1") {
            const historyText = formattedHistory.toLowerCase();
            const result = { events: [], inventory_changes: [], lore_facts: [], offers: [], goals: [] };

            if (historyText.includes("sword") || historyText.includes("blade")) {
                result.inventory_changes.push({
                    action: "acquire",
                    item_name: "Rusty Sword",
                    item_type: "weapon",
                    description: "A rusty iron sword.",
                    quantity: 1
                });
                result.events.push({
                    type: "discovery",
                    summary: "Found a rusty iron sword.",
                    entities: ["rusty sword"],
                    location: "Dungeon"
                });
            }
            if (historyText.includes("key")) {
                result.inventory_changes.push({
                    action: "acquire",
                    item_name: "Iron Key",
                    item_type: "key",
                    description: "A heavy iron key.",
                    quantity: 1
                });
                result.events.push({
                    type: "discovery",
                    summary: "Found an iron key.",
                    entities: ["iron key"],
                    location: "Dungeon"
                });
            }
            if (historyText.includes("cantina") || historyText.includes("korr")) {
                result.lore_facts.push({
                    name: "Korr",
                    type: "character",
                    description: "A smuggler who frequents the cantina.",
                    trigger_words: ["korr", "smuggler"]
                });
                result.events.push({
                    type: "dialogue",
                    summary: "Encountered Korr the smuggler.",
                    entities: ["Korr"],
                    location: "Cantina"
                });
            }

            // Contract-card mock triggers (deterministic). Keyed on the LATEST
            // player turn so re-extraction of already-flushed turns cannot
            // re-fire an acquisition and resurrect a traded item.
            const playerTurns = turns.filter(t => t.role === 'user');
            const latestPlayer = playerTurns.length > 0
                ? String(playerTurns[playerTurns.length - 1].text || "").toLowerCase()
                : "";

            if (/(take|get)\s+.*leaflet/.test(latestPlayer)) {
                result.inventory_changes.push({
                    action: "acquire",
                    item_name: "Leaflet",
                    item_type: "misc",
                    description: "A crumpled leaflet.",
                    quantity: 1
                });
            }
            if (latestPlayer.includes("bring me") && latestPlayer.includes("leaflet")) {
                result.offers.push({
                    trader_name: "Korr",
                    required_item: "Leaflet",
                    offered_item: "Gem",
                    description: "Bring me a leaflet and I'll give you a gem."
                });
            }
            if (latestPlayer.includes("find my daughter") && latestPlayer.includes("locket")) {
                result.goals.push({
                    npc_name: "Korr",
                    goal_title: "Find the locket",
                    required_item: "Locket",
                    reward_item: "Gem"
                });
            }
            if (latestPlayer.includes("trade") && latestPlayer.includes("leaflet") && latestPlayer.includes("gem")) {
                result.inventory_changes.push({
                    action: "traded",
                    item_name: "Leaflet",
                    item_type: "misc",
                    description: null,
                    quantity: 1
                });
                result.inventory_changes.push({
                    action: "acquire",
                    item_name: "Gem",
                    item_type: "misc",
                    description: "A small sparkling gem.",
                    quantity: 1
                });
                result.events.push({
                    type: "trade",
                    summary: "Traded the leaflet to Korr for a gem.",
                    entities: ["Korr", "leaflet", "gem"],
                    location: "Cantina"
                });
            }

            if (result.events.length === 0) {
                result.events.push({
                    type: "movement",
                    summary: "Travelled through the area.",
                    entities: [],
                    location: "Unknown"
                });
            }
            return result;
        }

        const prompt = `You are an expert system that extracts structured gameplay records, inventory changes, and lore from a section of an AI Dungeon game history.
Analyze the following gameplay turns (which include player actions and DM narration) and extract:
1. Significant events or plot developments (combat, dialogue, discovery, quest, movement, etc.).
2. Inventory changes (items acquired, dropped, used, equipped, consumed, traded away).
3. Lore facts (new characters encountered, locations discovered, factions introduced, world rules revealed).
4. Trade offers (an NPC explicitly proposes a trade, e.g. "bring me X and I'll give you Y").
5. Quest goals (an NPC states an objective the player can act on, e.g. "find my daughter's locket").

Game history section:
---
${formattedHistory}
---

You must output a single JSON object with the following structure. Do not output any other text, reasoning, or markdown code blocks. Output valid JSON.

{
  "events": [
    {
      "type": "combat" | "dialogue" | "discovery" | "quest" | "death" | "trade" | "movement",
      "summary": "Clear, concise summary of what occurred",
      "entities": ["entity1", "entity2"],
      "location": "location name where this happened"
    }
  ],
  "inventory_changes": [
    {
      "action": "acquire" | "drop" | "use" | "equip" | "destroy" | "traded" | "consume",
      "item_name": "Name of the item",
      "item_type": "weapon" | "armor" | "consumable" | "key" | "quest" | "misc",
      "description": "Short description of the item if any, or null",
      "quantity": 1
    }
  ],
  "lore_facts": [
    {
      "name": "Name of character/place/item/faction",
      "type": "character" | "location" | "item" | "lore" | "faction",
      "description": "Detailed description of the entity or lore fact",
      "trigger_words": ["word1", "word2"]
    }
  ],
  "offers": [
    {
      "trader_name": "Name of the NPC proposing the trade",
      "required_item": "Item the NPC wants in exchange",
      "offered_item": "Item the NPC gives in return",
      "description": "Short offer text if any, or null"
    }
  ],
  "goals": [
    {
      "npc_name": "Name of the NPC stating the objective",
      "goal_title": "Short objective title",
      "required_item": "Item needed to complete the objective",
      "reward_item": "Item granted on completion"
    }
  ]
}

Only include an offer when an NPC explicitly proposes a trade in the narration, and only include a goal when an NPC states an objective the player is asked to fulfill. For a trade where the player gave an item away, use "traded" as the inventory change action for the given-away item and "acquire" for the item received.`;

        const messages = [
            { role: "system", content: "You extract structured data from text and return only raw JSON." },
            { role: "user", content: prompt }
        ];
        try {
            const response = await llmCall(this.client, 'extraction', {
                messages,
                model: modelName,
                temperature: 0.1,
                maxTokens: 2048
            });

            const text = response.choices[0].message.content;
            return this.parseExtractedJson(text);
        } catch (e) {
            console.error("EventExtractor error during API call:", e);
            return { events: [], inventory_changes: [], lore_facts: [] };
        }
    }

    parseExtractedJson(text) {
        let cleaned = text.trim();
        if (cleaned.startsWith('```')) {
            const lines = cleaned.split('\n');
            if (lines[0].startsWith('```')) {
                lines.shift();
            }
            if (lines[lines.length - 1].startsWith('```')) {
                lines.pop();
            }
            cleaned = lines.join('\n').trim();
        }

        const startIdx = cleaned.indexOf('{');
        const endIdx = cleaned.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            cleaned = cleaned.substring(startIdx, endIdx + 1);
        }

        try {
            const parsed = JSON.parse(cleaned);
            return {
                events: Array.isArray(parsed.events) ? parsed.events : [],
                inventory_changes: Array.isArray(parsed.inventory_changes) ? parsed.inventory_changes : [],
                lore_facts: Array.isArray(parsed.lore_facts) ? parsed.lore_facts : [],
                offers: Array.isArray(parsed.offers) ? parsed.offers : [],
                goals: Array.isArray(parsed.goals) ? parsed.goals : []
            };
        } catch (e) {
            // Try to salvage truncated JSON by adding missing closing brackets
            const closings = [']', ']', ']', ']', ']', '}]', ']}]', '"]}]}', '", "value": {}}'];
            for (const suffix of closings) {
                try {
                    const parsed = JSON.parse(cleaned + suffix);
                    return {
                        events: Array.isArray(parsed.events) ? parsed.events : [],
                        inventory_changes: Array.isArray(parsed.inventory_changes) ? parsed.inventory_changes : [],
                        lore_facts: Array.isArray(parsed.lore_facts) ? parsed.lore_facts : [],
                        offers: Array.isArray(parsed.offers) ? parsed.offers : [],
                        goals: Array.isArray(parsed.goals) ? parsed.goals : []
                    };
                } catch (attemptErr) {
                    // Continue trying next salvage attempt
                }
            }
            console.error("Failed to parse extracted events JSON. Raw output was:", text);
            return { events: [], inventory_changes: [], lore_facts: [], offers: [], goals: [] };
        }
    }
}
