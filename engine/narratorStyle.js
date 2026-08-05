// Narrator style detection + pinned style directives (narrator-style-fidelity).
//
// The narrator is a flexible stylist: it leans into the tone implied by the
// player's opening and then holds that style for the whole session. The engine
// captures the adopted style once (from the player's opening signals) into
// state.narratorStyle, and the [NARRATOR STYLE] context block (contextBlocks.js)
// pins it into every later turn so the narrator does not drift (D2).
//
// Detection is a deterministic keyword classifier over the player's opening
// signals (title + system prompt + first player turn) — no second LLM call, no
// latency. The default label is `direct`, so every session is pinned to
// SOMETHING; the operative part of the pin is the "hold this tone" instruction,
// not the label itself.
export const STYLE_DIRECTIVES = {
    whimsical: 'Whimsical — fanciful, lighthearted, and playful.',
    grim: 'Grim — dark, terse, and foreboding.',
    terse: 'Terse — clipped, curt, and minimal.',
    florid: 'Florid — ornate, poetic, and richly descriptive.',
    heroic: 'Heroic — grand, legendary, and inspiring.',
    noir: 'Noir — moody, cynical, and shadow-drenched.',
    direct: 'Direct — plainspoken and matter-of-fact, matching the player\'s register.',
};

// Ordered by priority: the first style whose keywords appear wins, so a
// player's own opening tone outranks a themed preset's default tone when both
// are present in the signals (whimsical is checked before grim, etc.).
const STYLE_KEYWORDS = [
    { label: 'whimsical', words: ['whimsical', 'whimsy', 'playful', 'frolic', 'fairy tale', 'fairy-tale', 'magical', 'charming', 'giggle', 'giggles', 'silly', 'curious', 'dreamy', 'delightful', 'enchanted'] },
    { label: 'grim', words: ['grim', 'dark', 'bleak', 'dread', 'foreboding', 'horror', 'brutal', 'ruthless', 'gloomy', 'gritty'] },
    { label: 'terse', words: ['terse', 'curt', 'concise', 'brusque', 'clipped', 'laconic', 'brief replies'] },
    { label: 'florid', words: ['florid', 'flowery', 'poetic', 'eloquent', 'ornate', 'purple prose', 'verbose'] },
    { label: 'heroic', words: ['heroic', 'epic', 'legendary', 'glorious', 'valiant', 'noble'] },
    { label: 'noir', words: ['noir', 'detective', 'moody', 'smoky', 'cynical', 'hard-boiled', 'rain-slicked'] },
];

/**
 * Adopt a narrator style from the player's opening signals.
 *
 * @param {...string} signals - opening texts (title, system prompt, first
 *   player turn) whose combined tone determines the adopted style.
 * @returns {string} a style label from STYLE_DIRECTIVES (never null).
 */
export function detectNarratorStyle(...signals) {
    const haystack = signals.filter(Boolean).join(' ').toLowerCase();
    if (!haystack) return 'direct';
    for (const { label, words } of STYLE_KEYWORDS) {
        if (words.some(w => haystack.includes(w))) return label;
    }
    return 'direct';
}
