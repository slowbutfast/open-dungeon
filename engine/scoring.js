/**
 * Engine-driven scoring rule (fix-score-progression, D1/D3).
 *
 * Score is the engine's deterministic measure of progression over extracted
 * milestone events. It is NOT the narrator's `Score:` status-line claim (D2:
 * that value is advisory and ignored). Only the four milestone event types
 * below contribute, at fixed per-type weights.
 *
 * The rule is a pure function so it can be unit-tested without an LLM or a
 * store. `MemoryManager.computeScore` recomputes the full score from the
 * store's distinct events (which are already deduplicated by event id), making
 * the computation idempotent: running it again over the same events returns
 * the same total, and rolling a turn back removes its rows so a recompute
 * naturally drops its score contribution.
 */

/** Deterministic per-type milestone weights. Only these four types score. */
export const MILESTONE_WEIGHTS = { discovery: 2, quest: 10, combat: 5, trade: 3 };

/** The event types that contribute to score (useful for consumers/checks). */
export const scoringEventTypes = Object.keys(MILESTONE_WEIGHTS);

/**
 * Normalize a milestone to a dedup key: case-insensitive, trimmed
 * `type:summary`. Two milestones with the same normalized key count once.
 */
function milestoneKey(type, summary) {
    const t = String(type || '').trim().toLowerCase();
    const s = String(summary || '').trim().toLowerCase();
    return `${t}:${s}`;
}

/**
 * Compute the score for a list of events.
 *
 * @param {Array<{type?: string, event_type?: string, summary?: string}>} events
 *   Extracted milestone events. Store rows use the snake_case `event_type`
 *   column; extractor output uses `type` — both are accepted.
 * @param {number} [priorScore=0] Running total to add the increment to.
 * @returns {number} `priorScore + increment`, where increment is the sum of the
 *   per-type weight of each DISTINCT milestone. Movement/dialogue/death/unknown
 *   types contribute 0; repeated milestones are never double-counted.
 */
export function scoreRule(events, priorScore = 0) {
    const seen = new Set();
    let increment = 0;

    for (const event of events || []) {
        const type = event.event_type ?? event.type ?? '';
        const weight = MILESTONE_WEIGHTS[String(type).trim().toLowerCase()];
        if (weight === undefined) {
            continue;
        }
        const key = milestoneKey(type, event.summary);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        increment += weight;
    }

    return priorScore + increment;
}
