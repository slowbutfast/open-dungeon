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

export function itemNamesMatch(a, b) {
    const na = normalizeItemName(a);
    const nb = normalizeItemName(b);
    if (!na || !nb) return false;
    return na === nb;
}
