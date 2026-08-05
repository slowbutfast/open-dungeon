// Deterministic stale-status recovery (narrator-style-fidelity, GH #38).
//
// The narrator's status line is the engine's location source, but models
// chronically either echo a STALE location (repeating the current one while
// their prose narrates travel) or truncate the line entirely. When the status
// line is missing or diverges from what the narration narrates, this module
// recovers a proposed location from the narration's (and, failing that, the
// action's) arrival landmarks so the spatial map keeps growing instead of
// freezing.
//
// Pure heuristics, no extra LLM call, best-effort: weak or ambiguous prose
// yields null and the engine simply holds position. The caller only invokes
// this to check a status line that may be stale, so an honest status line
// always wins and this can never override a committed location.
//
// The extractor is validated against real prose captured from the live
// playtests that froze the map (tests/unit/narrationLandmarks.test.mjs).

// Words that may be stripped from the FRONT of a captured phrase (articles,
// prepositions, directions, function words): "the old cart track" -> "old cart
// track". Descriptive adjectives (muddy, dense, ancient) are KEPT — they
// distinguish the landmark.
const LEADING_DROPS = new Set([
    'the', 'a', 'an', 'of', 'at', 'in', 'to', 'from', 'for', 'with', 'by',
    'on', 'over', 'under', 'through', 'into', 'onto', 'along', 'toward',
    'towards', 'across', 'past', 'near', 'beyond', 'above', 'below', 'down',
    'up', 'north', 'south', 'east', 'west', 'northeast', 'northwest',
    'southeast', 'southwest', 'that', 'which', 'where', 'when', 'you', 'your',
    'before', 'after', 'then', 'now', 'just', 'there', 'here', 'and', 'but',
    'so', 'as', 'ahead', 'behind', 'inside', 'outside', 'back', 'away',
    'again', 'around', 'out',
]);

// Words too generic to name a place on their own. A phrase whose words are ALL
// generic is rejected; these are also dropped from the TAIL of a phrase.
const GENERIC_WORDS = new Set([
    'ahead', 'behind', 'below', 'above', 'there', 'here', 'where', 'which',
    'then', 'when', 'and', 'with', 'without', 'toward', 'towards', 'through',
    'across', 'around', 'beyond', 'inside', 'outside', 'into', 'onto', 'from',
    'along', 'down', 'up', 'under', 'over', 'past', 'by', 'for', 'you', 'your',
    'the', 'a', 'an', 'of', 'at', 'in', 'to', 'it', 'its', 'them', 'their',
    'his', 'her', 'now', 'just', 'only', 'more', 'less', 'like', 'as', 'so',
    'path', 'trail', 'road', 'track', 'way', 'route', 'door', 'doorway',
    'entrance', 'exit', 'passage', 'corridor', 'hall', 'hallway', 'stair',
    'stairs', 'stairway', 'edge', 'side', 'center', 'middle', 'end', 'top',
    'bottom', 'north', 'south', 'east', 'west', 'northeast', 'northwest',
    'southeast', 'southwest', 'dark', 'deep', 'old', 'high', 'low', 'big',
    'small', 'little', 'cold', 'wet', 'slick', 'winding', 'narrow', 'steep',
    'muddy', 'dusty', 'ancient', 'forgotten', 'hidden', 'silent', 'quiet',
    'empty', 'thick', 'dense', 'gloom', 'gloomy', 'shadow', 'shadows', 'mist',
    'fog', 'rain', 'mud', 'water', 'distance', 'far', 'near', 'other', 'some',
    'next', 'last', 'first', 'great', 'vast', 'open', 'green', 'grey', 'gray',
    'pale', 'soft', 'hard', 'dry', 'new',
    // Directional adverbs that can follow a movement verb but are not places.
    'deeper', 'further', 'farther', 'onward', 'forward', 'backward', 'closer',
    'upward', 'downward', 'inward', 'outward', 'on', 'onwards', 'forwards',
    'back', 'away', 'again', 'out', 'around', 'apart',
    // Manner adverbs from natural action prose ("step up to the wall",
    // "walk slowly around the trees") — modifiers, never places.
    'slowly', 'quietly', 'carefully', 'gently', 'quickly', 'softly',
    'cautiously', 'warily', 'nervously', 'eagerly', 'silently', 'simply',
    'patiently', 'curiously', 'gently', 'firmly', 'softly', 'low', 'straight',
    'directly', 'onward', 'on', 'ahead',
]);

// Words that may dangle at the tail of a captured noun phrase and are dropped
// ("the bridge over the stream" -> "bridge").
const TRAILING_DROPS = new Set([
    'of', 'in', 'at', 'to', 'from', 'for', 'with', 'by', 'on', 'over',
    'under', 'through', 'into', 'onto', 'along', 'toward', 'towards', 'and',
    'the', 'a', 'an', 'where', 'which', 'that', 'before', 'after', 'past',
    'near', 'beyond', 'above', 'below', 'across', 'up', 'down', 'north',
    'south', 'east', 'west', 'ahead', 'behind', 'you', 'your', 'now', 'then',
    'like', 'as', 'so', 'with', 'out', 'about',
]);

// Words that stop a captured phrase when they follow it ("... bridge over a
// stream" — capture "bridge", stop at " over"). Destination prepositions and
// connectors stop the capture; possession/attribution prepositions ("of",
// "the", "with") are deliberately NOT stoppers because they legitimately sit
// INSIDE a place name ("Hall of Pillars", "Bridge with No Name").
const PHRASE_STOPPERS = new Set([
    'where', 'which', 'that', 'and', 'but', 'so', 'before', 'after',
    'to', 'into', 'onto', 'along', 'over', 'under', 'across', 'through',
    'toward', 'towards', 'past', 'near', 'from', 'down', 'up', 'with',
    'as', 'then', 'now', 'like', 'when', 'while', 'since', 'until',
    'beneath', 'beside', 'behind', 'beyond', 'outside', 'inside',
    'back', 'away', 'again', 'around', 'toward', 'towards',
]);

// Movement verbs that clearly narrate ARRIVAL at a new place (high-precision;
// a bare "walk" with no destination is not enough). "step" requires a
// destination preposition ("step INTO the chamber", not "step up to the wall"
// / "step back a pace" — those are repositioning). "follow" requires a route
// noun ("follow THE PATH", not "following the ticking").
const ARRIVAL_VERBS = [
    'enter(?:ed|ing)?', 'arriv(?:e|ed|ing)?(?:\\s+(?:at|in))?',
    'reach(?:ed|ing)?', 'step(?:ped)?(?:\\s+(?:into|onto|through))',
    'walk(?:ed|ing)?', 'head(?:ed|ing)?', 'trudg(?:e|ed|ing)?',
    'stumble(?:d|ing)?', 'cross(?:ed|ing)?',
    'follow(?:ed|ing)?\\s+(?:the|a|an)\\s+(?:path|trail|road|track|footpath|passage|way|ridge|stream|river|lane|route)',
    'pass(?:ed|ing)?\\s+through', 'emerg(?:e|ed|ing)?',
    'slip(?:ped|ping)?(?:\\s+into)?', 'wander(?:ed|ing)?\\s+into',
    'come\\s+(?:to|upon|across|up\\s+on)', 'struck', 'hit', 'reached',
];

// "the X leads/winds/... (to Y)" — the landmark may sit BEFORE the verb
// ("A muddy footpath snakes east") or AFTER it ("the path leads into a thicket").
const PATH_VERB = '(?:leads?|winds?|curves?|snakes?|narrows?|opens?|continues?|stretches?|runs?|descends?|ascends?|carries?|ushers?)';

// Capture 1-5 words. Each repeated word is refused if it is a PHRASE_STOPPER
// (so "ridge into the Northern Trail" captures "ridge", not the whole run),
// and the whole phrase ends at punctuation, end-of-text, or a stopper.
const STOPPERS_ALT = [...PHRASE_STOPPERS].join('|');
const CAPTURE = "([A-Za-z][\\w'\\-]*(?:(?!\\s+(?:" + STOPPERS_ALT +
    ")\\b)\\s+[A-Za-z][\\w'\\-]*){0,4})(?=[.,;:!?]|$|\\s+(?:" + STOPPERS_ALT + ')\\b)';

const ARRIVAL_VERB_RE = new RegExp(`\\b(?:${ARRIVAL_VERBS.join('|')})\\b`, 'gi');

// A destination-introducing preposition + noun phrase, used to find the actual
// destination in an arrival sentence ("... into the Northern Trail").
const DEST_PREP_RE = new RegExp(
    `\\b(?:into|onto|to|toward|towards|at|past|through|along|down|up|for)\\s+(?:(?:the|a|an)\\s+)?${CAPTURE}`, 'gi'
);

// Strategy 2: a path verb + "to X" ("leads to a low turf-roofed bothy").
const PATH_TO_PHRASE = new RegExp(
    `\\b${PATH_VERB}\\s+(?:to|into|down|up|through|toward|towards)\\s+(?:(?:the|a|an)\\s+)?${CAPTURE}`, 'gi'
);

// Strategy 3: the landmark precedes a path verb ("A muddy footpath snakes east").
const PHRASE_BEFORE_PATH = new RegExp(
    `\\b(?:the|a|an)\\s+([A-Za-z][\\w'\\-]*(?:\\s+[A-Za-z][\\w'\\-]*){0,3})\\s+${PATH_VERB}\\b`, 'gi'
);

// Small words that stay lowercase in the middle of a title-cased landmark
// ("Hall of Pillars", not "Hall Of Pillars").
const SMALL_WORDS = new Set([
    'of', 'the', 'a', 'an', 'and', 'in', 'on', 'at', 'for', 'to', 'with',
    'by', 'from', 'into', 'onto', 'over', 'under', 'up', 'down', 'vs', 'as',
]);

function cleanLandmark(phrase) {
    if (!phrase) return null;
    const words = phrase.split(/\s+/).filter(Boolean);
    while (words.length && TRAILING_DROPS.has(words[words.length - 1].toLowerCase())) {
        words.pop();
    }
    while (words.length && LEADING_DROPS.has(words[0].toLowerCase())) {
        words.shift();
    }
    if (words.length < 1 || words.length > 5) return null;
    // The landmark must contain at least one non-generic word.
    if (words.every(w => GENERIC_WORDS.has(w.toLowerCase()))) return null;
    // Reject mechanical / suspicious tokens (mirrors the forged-status guard).
    if (/(admin|system|prompt|parser|api|interface)/i.test(words.join(' '))) return null;
    return words
        .map((w, i) => {
            const lower = w.toLowerCase();
            if (i > 0 && SMALL_WORDS.has(lower)) return lower;
            return w[0].toUpperCase() + w.slice(1);
        })
        .join(' ');
}

// Strategy 1: for each arrival verb (in order), look at the rest of its
// sentence and take the LAST destination prepositional phrase ("... into the
// Northern Trail"); failing that, the noun phrase right after the verb. The
// LAST arrival verb's result wins — the most recent destination the prose
// narrates.
function extractArrival(text) {
    let result = null;
    for (const verbMatch of text.matchAll(ARRIVAL_VERB_RE)) {
        const remainder = text.slice(verbMatch.index + verbMatch[0].length);
        const sentence = remainder.split(/(?<=[.!?])\s+|\n/)[0] || '';
        let landmark = null;
        for (const destMatch of sentence.matchAll(DEST_PREP_RE)) {
            const cleaned = cleanLandmark(destMatch[1]);
            if (cleaned) landmark = cleaned;
        }
        if (!landmark) {
            const afterVerb = sentence.match(new RegExp(`^\\s*(?:(?:the|a|an)\\s+)?${CAPTURE}`));
            landmark = cleanLandmark(afterVerb && afterVerb[1]);
        }
        if (landmark) result = landmark;
    }
    return result;
}

/**
 * Recover a proposed location name from narration (and, as a fallback, the
 * player action) when the status line failed to advance.
 *
 * @param {...string} texts - narration prose first, then player action text.
 * @returns {string|null} a title-cased landmark, or null when the text does
 *   not clearly narrate arrival somewhere.
 */
export function extractNarrationLandmark(...texts) {
    const text = texts.filter(Boolean).join(' ');
    if (!text.trim()) return null;

    // Destination-first ordering: "leads to X" names the destination before
    // "The X leads" names its subject. A bare prepositional destination
    // ("into the forest") without an arrival verb is deliberately NOT used —
    // a scene description can mention an adjacent place without the player
    // arriving there.
    const arrival = extractArrival(text);
    if (arrival) return arrival;

    for (const regex of [PATH_TO_PHRASE, PHRASE_BEFORE_PATH]) {
        for (const match of text.matchAll(regex)) {
            const landmark = cleanLandmark(match[1]);
            if (landmark) return landmark;
        }
    }
    return null;
}
