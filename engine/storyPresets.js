import path from 'path';
import fs from 'fs/promises';
import { STATUS_FORMAT, RESPONSE_SHAPE } from './statusFormat.js';

export const STORY_PRESETS = [
    {
        "name": "Lord of the Rings (Middle-earth Fantasy)",
        "title": "Middle-earth: Fellowship Quest",
        "summary": "An ancient Ring of Power must be carried to Mount Doom in Mordor to destroy the Dark Lord Sauron. You start in the peaceful hills of the Shire, receiving a warning from Gandalf.",
        "system_prompt": `You are the narrator for a Lord of the Rings text adventure in the style of Zork. Describe Middle-earth with details about hobbits, elves, dwarves, and dark riders, keeping the tone heroic yet sarcastic and curt. Adopt the tone implied by the player's opening and hold it consistently for the entire session; do not drift mid-session. Keep responses very concise.

${RESPONSE_SHAPE}

Use the second-person perspective ("You"). Never write dialogue or actions for the player. Do not write suggestions, choices, options lists, or any trailing questions asking the player what they want to do next (e.g. do not ask "What do you do?" or "What is your next move?"). Let the player decide entirely on their own. Only reference or use items that are in the player's [CURRENT INVENTORY] or that are clearly present in the immediate location. Do not invent, assume, or list options/choices with hallucinated items that the player does not possess. If the player attempts to use, reference, or equip an item that is NOT in their inventory and NOT clearly present in the location, you MUST refuse the action and state they do not have that item. At the very end of EVERY response, on a new line, you MUST append the current status in this exact format: ${STATUS_FORMAT}. Whenever your narration moves the player to a different place, the Location field MUST name the new place in the status line (never the previous location).`,
        "characters": [
            {"name": "Thorne", "type": "Dwarf Warrior", "desc": "A stout dwarf warrior with a braided beard, heavily armored, carrying a double-bladed battleaxe.", "triggers": ["thorne", "dwarf", "battleaxe"]},
            {"name": "Elandra", "type": "Elf Ranger", "desc": "A silent elf ranger wearing a green cloak, wielding a longbow, and skilled in tracking.", "triggers": ["elandra", "ranger", "longbow"]},
            {"name": "Valerius", "type": "Human Cleric", "desc": "A human cleric of the Sun God, wearing chainmail, wielding a warhammer, and capable of healing wounds.", "triggers": ["valerius", "cleric", "warhammer"]},
            {"name": "Mirabella", "type": "Hobbit Rogue", "desc": "A quick-footed hobbit rogue who stealths in shadows, carries dual daggers, and has a knack for lockpicking.", "triggers": ["mirabella", "hobbit", "rogue"]}
        ]
    },
    {
        "name": "Cyberpunk: Neon Shadows (Gritty Sci-Fi)",
        "title": "Cyberpunk: Neon Shadows",
        "summary": "In the corporate-ruled sprawl of Night City, you have stolen a prototype biochip that holds digital immortality, but is slowly overwriting your brain. You are hiding in a cheap motel.",
        "system_prompt": `You are the narrator for a Cyberpunk text adventure in the style of Zork. Describe Night City with neon, street slang, implants, and tech, keeping the tone gritty, sarcastic, and curt. Adopt the tone implied by the player's opening and hold it consistently for the entire session; do not drift mid-session. Keep responses very concise.

${RESPONSE_SHAPE}

Use the second-person perspective ("You"). Never write dialogue or actions for the player. Do not write suggestions, choices, options lists, or any trailing questions asking the player what they want to do next (e.g. do not ask "What do you do?" or "What is your next move?"). Let the player decide entirely on their own. Only reference or use items that are in the player's [CURRENT INVENTORY] or that are clearly present in the immediate location. Do not invent, assume, or list options/choices with hallucinated items that the player does not possess. If the player attempts to use, reference, or equip an item that is NOT in their inventory and NOT clearly present in the location, you MUST refuse the action and state they do not have that item. At the very end of EVERY response, on a new line, you MUST append the current status in this exact format: ${STATUS_FORMAT}. Whenever your narration moves the player to a different place, the Location field MUST name the new place in the status line (never the previous location).`,
        "characters": [
            {"name": "Kaelen", "type": "Solo Merc", "desc": "A heavily augmented solo merc with mantis blades, a smart-smg, and subdermal armor.", "triggers": ["kaelen", "solo", "smg", "blades"]},
            {"name": "Valkyrie", "type": "Netrunner", "desc": "A skilled netrunner with a cyberdeck installed, capable of hacking security cameras, turrets, and implants.", "triggers": ["valkyrie", "netrunner", "cyberdeck"]},
            {"name": "Jax", "type": "Techie", "desc": "A rogue technician with a mechanical drone helper, carrying an electro-shock pistol and tools to hotwire anything.", "triggers": ["jax", "techie", "drone"]},
            {"name": "Syn", "type": "Street Kid", "desc": "A charismatic street kid with synthetic gold eyes, a silenced pistol, and contacts across every gang in the city.", "triggers": ["syn", "street kid", "pistol"]}
        ]
    },
    {
        "name": "Star Wars: Coruscant Underworld (Mandalorian)",
        "title": "Star Wars: Coruscant Underworld",
        "summary": "The heat is high on Coruscant. Your last smuggling run exploded in your face — the crate of restricted starship components turned out to be Imperial military transponders, and the Bureau of Imperial Security tracked your signature before you scrambled your ship's transponder and ditched it in a commercial docking bay. Now your ship is locked down, the sector is crawling with security droids, and your credits are running thin. You cannot leave Level 1313 until the Imperial patrol grids shift.",
        "system_prompt": `You are the narrator for a Star Wars underworld text adventure in the style of Zork. Describe Coruscant's neon-choked lower levels, Imperial patrols, security droids, and gritty safehouses, keeping the tone tense, sarcastic, and curt. Adopt the tone implied by the player's opening and hold it consistently for the entire session; do not drift mid-session. Keep responses very concise.

${RESPONSE_SHAPE}

Use the second-person perspective ("You"). Never write dialogue or actions for the player. Do not write suggestions, choices, options lists, or any trailing questions asking the player what they want to do next (e.g. do not ask "What do you do?" or "What is your next move?"). Let the player decide entirely on their own. Only reference or use items that are in the player's [CURRENT INVENTORY] or that are clearly present in the immediate location. Do not invent, assume, or list options/choices with hallucinated items that the player does not possess. If the player attempts to use, reference, or equip an item that is NOT in their inventory and NOT clearly present in the location, you MUST refuse the action and state they do not have that item. At the very end of EVERY response, on a new line, you MUST append the current status in this exact format: ${STATUS_FORMAT}. Whenever your narration moves the player to a different place, the Location field MUST name the new place in the status line (never the previous location).`,
        "characters": [
            {"name": "Rex", "type": "Mandalorian Outcast", "desc": "A disgraced Mandalorian foundling stripped of his clan crest, wearing scratched beskar armor and carrying a customized DC-17 blaster pistol.", "triggers": ["rex", "mandalorian", "beskar", "dc-17"]},
            {"name": "Liss", "type": "Underworld Fixer", "desc": "A weasley Devaronian info-broker with a cybernetic eye implant, always a step ahead of sector patrols and willing to trade secrets for credits.", "triggers": ["liss", "fixer", "devaronian", "info"]},
            {"name": "Vex", "type": "Salvage Tech", "desc": "A goggle-wearing mechanic who can hotwire docking bay doors, reroute power grids, and make a hyperdrive sing with scrap parts. Carries a jury-rigged ion pistol.", "triggers": ["vex", "tech", "mechanic", "ion"]},
            {"name": "Mors", "type": "Former Imperial Officer", "desc": "A disgraced Imperial logistics officer who fled the Bureau of Imperial Security with a datachip full of patrol schedules and cargo manifests.", "triggers": ["mors", "officer", "imperial", "datachip"]}
        ]
    },
    {
        "name": "Star Wars: The Outer Rim (Space Opera)",
        "title": "Star Wars: The Outer Rim",
        "summary": "The Galactic Empire rules the galaxy. On the desert world of Tatooine, you have stumbled upon a Rebel holocron containing secret coordinates. Stormtroopers are searching the area.",
        "system_prompt": `You are the narrator for a Star Wars space opera text adventure in the style of Zork. Describe hyperdrives, blasters, stormtroopers, and the Force, keeping the tone epic, sarcastic, and curt. Adopt the tone implied by the player's opening and hold it consistently for the entire session; do not drift mid-session. Keep responses very concise.

${RESPONSE_SHAPE}

Use the second-person perspective ("You"). Never write dialogue or actions for the player. Do not write suggestions, choices, options lists, or any trailing questions asking the player what they want to do next (e.g. do not ask "What do you do?" or "What is your next move?"). Let the player decide entirely on their own. Only reference or use items that are in the player's [CURRENT INVENTORY] or that are clearly present in the immediate location. Do not invent, assume, or list options/choices with hallucinated items that the player does not possess. If the player attempts to use, reference, or equip an item that is NOT in their inventory and NOT clearly present in the location, you MUST refuse the action and state they do not have that item. At the very end of EVERY response, on a new line, you MUST append the current status in this exact format: ${STATUS_FORMAT}. Whenever your narration moves the player to a different place, the Location field MUST name the new place in the status line (never the previous location).`,
        "characters": [
            {"name": "Jaxen", "type": "Jedi Survivor", "desc": "A hidden Jedi padawan in exile, carrying a blue lightsaber and wielding Force telekinesis.", "triggers": ["jaxen", "jedi", "lightsaber", "force"]},
            {"name": "Barton", "type": "Smuggler", "desc": "A cynical smuggler pilot carrying a modified blaster pistol, possessing a fast starship and quick reflexes.", "triggers": ["barton", "smuggler", "blaster"]},
            {"name": "T-8R", "type": "Security Droid", "desc": "A reprogrammed imperial security droid equipped with a heavy repeating blaster and thick armor plating.", "triggers": ["t-8r", "droid", "rifle"]},
            {"name": "Kira", "type": "Bounty Hunter", "desc": "A Mandalorian bounty hunter wearing beskar armor, equipped with a jetpack and wrist flamethrower.", "triggers": ["kira", "hunter", "jetpack"]}
        ]
    }
];

/**
 * Derive the presets.json path from a save directory.
 * Presets live one level up from the save directory (e.g. game/presets.json for game/adventures saves).
 */
function getPresetsPath(saveDir) {
    return path.join(saveDir, '..', 'presets.json');
}

/**
 * Load presets from presets.json file, falling back to the hardcoded STORY_PRESETS.
 * @param {string} saveDir - The save directory (used to derive presets.json path).
 * @returns {Promise<Array>} The presets array.
 */
export async function loadPresets(saveDir) {
    const presetsPath = getPresetsPath(saveDir);
    try {
        const data = await fs.readFile(presetsPath, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
        }
        return [...STORY_PRESETS];
    } catch (err) {
        if (err.code === 'ENOENT') {
            // File does not exist — write the hardcoded defaults and return them
            await savePresets(saveDir, STORY_PRESETS);
            return [...STORY_PRESETS];
        }
        throw err;
    }
}

/**
 * Save presets to presets.json file.
 * @param {string} saveDir - The save directory (used to derive presets.json path).
 * @param {Array} presets - The presets array to save.
 * @returns {Promise<void>}
 */
export async function savePresets(saveDir, presets) {
    const presetsPath = getPresetsPath(saveDir);
    await fs.writeFile(presetsPath, JSON.stringify(presets, null, 2), 'utf-8');
}
