import { llmTracker } from '../llmTracker.js';

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
            const result = { events: [], inventory_changes: [], lore_facts: [] };

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
2. Inventory changes (items acquired, dropped, used, equipped, lost).
3. Lore facts (new characters encountered, locations discovered, factions introduced, world rules revealed).

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
      "action": "acquire" | "drop" | "use" | "equip" | "destroy",
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
  ]
}`;

        const messages = [
            { role: "system", content: "You extract structured data from text and return only raw JSON." },
            { role: "user", content: prompt }
        ];
        const callId = llmTracker.startCall('extraction', messages);
        try {
            const response = await this.client.chat.completions.create({
                model: modelName,
                messages,
                temperature: 0.1,
                max_tokens: 2048
            });

            const text = response.choices[0].message.content;
            llmTracker.endCall(callId, text);
            return this.parseExtractedJson(text);
        } catch (e) {
            llmTracker.failCall(callId, e);
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
                lore_facts: Array.isArray(parsed.lore_facts) ? parsed.lore_facts : []
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
                        lore_facts: Array.isArray(parsed.lore_facts) ? parsed.lore_facts : []
                    };
                } catch (attemptErr) {
                    // Continue trying next salvage attempt
                }
            }
            console.error("Failed to parse extracted events JSON. Raw output was:", text);
            return { events: [], inventory_changes: [], lore_facts: [] };
        }
    }
}
