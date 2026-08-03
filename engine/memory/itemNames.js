// Canonical item-name normalization and matching.
//
// Shared with the validate-memory-extraction change: narrated item references
// ("rusty gear", "the Gem", "2 coppers") must resolve to the same inventory row
// that an offer or the player's own narration used. Normalization strips the
// usual surface noise (case, whitespace, leading articles/quantities, trailing
// punctuation); matching compares normalized forms.

export function normalizeItemName(name) {
    if (!name || typeof name !== "string") return "";
    return name
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^the\s+/, "")
        .replace(/^an\s+/, "")
        .replace(/^a\s+/, "")
        .replace(/^(\d+)\s+/, "")
        .replace(/[.,!?;:]+$/g, "")
        .trim();
}

// Light derivational suffix stripping so equivalent surface forms ("rusty gear"
// vs "rusted gear", "gem" vs "gems") reduce to the same root. Each rule only
// fires when the root would be at least 3 characters, so short words ("key")
// are left alone rather than over-stemmed ("ke").
const STEM_SUFFIX_RULES = [
    ["ies", "y"],   // coppies -> coppy
    ["ves", "f"],   // wolves -> wolf
    ["oes", "o"],   // heroes -> hero
    ["ing", ""],    // fishing -> fish
    ["ed", ""],     // rusted -> rust
    ["es", ""],     // boxes -> box, gems -> gem
    ["s", ""],      // gears -> gear, keys -> key
    ["y", ""],      // rusty -> rust
];

function stemWord(word) {
    for (const [suffix, replacement] of STEM_SUFFIX_RULES) {
        const rootLength = word.length - suffix.length + replacement.length;
        if (rootLength >= 3 && word.endsWith(suffix)) {
            return word.slice(0, -suffix.length) + replacement;
        }
    }
    return word;
}

/**
 * Stem-normalize a full item name (per-word) for equivalent-name matching.
 *
 * @param {string} name
 * @returns {string} the stemmed, normalized form ("" for empty input)
 */
export function stemItemName(name) {
    const normalized = normalizeItemName(name);
    if (!normalized) return "";
    return normalized.split(" ").map(stemWord).join(" ");
}

export function itemNamesMatch(a, b) {
    const na = normalizeItemName(a);
    const nb = normalizeItemName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // Fall back to stem comparison so minor surface differences ("Rusty Gear"
    // vs "Rusted Gear", "Gear" vs "Gears") still resolve to the same item.
    return stemItemName(na) === stemItemName(nb);
}
