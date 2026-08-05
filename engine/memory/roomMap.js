// Room graph reconciliation (spatial-map-region-graph, D2/D3).
//
// Pure module: transition classification, direction parsing, canonical room
// name matching, and the `reconcile` decision function. No LLM, no store
// handle — all store access flows through the injected `ctx` (the same shape
// the engine builds over StructuredStore for the turn-commit path). The engine
// is authoritative over room identity: the narrator's status-line location is
// a *proposal* this module reconciles against the persisted graph.
//
// The decision table (architecture.md D3):
//
//   walk + direction + edge lookup
//     edge exists, inferred=0 → adopt target (first visit wins, canonicalize drift)
//     edge exists, inferred=1 → adopt if names match, else RETRACT + GROW (self-heal)
//     no edge + name matches known room → add walk edge to it
//     no edge + no match              → new room + walk edge
//     → reversible direction also gets an inferred reverse edge
//   portal → labeled mechanism edge, NO reverse
//   time   → edge, NO reverse (world-state boundary)
//   unknown → resolve room, NO edge at all (never fabricate connectivity)
import { stemItemName } from './itemNames.js';

// ─── canonical room name matching (same regime as item names, D3) ──────────

export function normalizeRoomName(name) {
    if (!name || typeof name !== 'string') return "";
    return name
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^the\s+/, "")
        .replace(/^an\s+/, "")
        .replace(/^a\s+/, "")
        .replace(/[.,!?;:'"]+$/g, "")
        .trim();
}

// Room-appropriate derivational stem rules. Deliberately distinct from the
// item rules: room names pluralize far more often ("Northern Caves" vs
// "Northern Cave"), so the trailing `s` strip fires before the item rules'
// aggressive `es`/`ves`/`oes` suffix replacements.
const ROOM_STEM_SUFFIX_RULES = [
    ["ies", "y"],   // cities -> city
    ["ses", "se"],  // houses -> house
    ["ing", ""],    // landing -> land
    ["ed", ""],     // forested -> forest
    ["s", ""],      // caves -> cave, pits -> pit, temples -> temple
];

// Never strip the trailing `s` from sibilant/singular-looking words: "glass",
// "campus", "status", "iris", "canvas" (an `ss`/`us`/`is`/`as` ending). The
// `-os` class is deliberately NOT guarded (8.3): genuine `-os` plurals
// ("grottos" -> "grotto", "volcanos" -> "volcano") must collapse onto their
// singular, and true singular `-os` words that matter here end in `ss`/`us`
// anyway. The `rootLength >= 3` check below is the guard against stripping a
// lone/short root.
const SIBILANT_OR_SINGULAR = /(ss|us|is|as)$/;

function stemRoomWord(word) {
    if (SIBILANT_OR_SINGULAR.test(word)) return word;
    for (const [suffix, replacement] of ROOM_STEM_SUFFIX_RULES) {
        const rootLength = word.length - suffix.length + replacement.length;
        if (rootLength >= 3 && word.endsWith(suffix)) {
            return word.slice(0, -suffix.length) + replacement;
        }
    }
    return word;
}

export function stemRoomName(name) {
    const normalized = normalizeRoomName(name);
    if (!normalized) return "";
    return normalized.split(" ").map(stemRoomWord).join(" ");
}

export function roomNamesMatch(a, b) {
    const na = normalizeRoomName(a);
    const nb = normalizeRoomName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // Stem fallback so equivalent surface forms resolve to the same node
    // (northern caves / northern cave, deep pit / deep pits).
    return stemRoomName(na) === stemRoomName(nb);
}

// ─── transition classification ─────────────────────────────────────────────

// Labeled mechanisms crossing a seam (spec: archway, ship, gate). The matched
// token doubles as the portal edge's direction label.
const PORTAL_MECHANISM_RE = /(archway|portal|gate|ship|boat|ferry|teleporter|stargate|rift|mirror|wardrobe|painting)/i;

// Temporal passage signals (duration literals, sleep/rest/wait, night falling).
const TIME_SIGNAL_RE =
    /(\b\d+\s+(year|years|day|days|week|weeks|month|months|hour|hours|decade|decades)\b|\b(a|an)\s+(year|day|week|month|hour|decade)\b|\b(years|days|weeks|months)\s+pass\b|time\s+(passes|passes by|flows|flow)|night\s+falls|\b(sleep|rest)\b|\bwait\b)/i;

// Movement verbs (including one-way verbs like slide/fall/teleport — they are
// still traversals, just not reversible). Command-style match: verb first.
const WALK_VERBS = /^(go|walk|head|run|step|move|travel|journey|venture|march|crawl|climb|descend|ascend|enter|exit|leave|return|follow|cross|traverse|slip|slide|fall|tumble|plunge|dive|drop|jump|leap|fly|ride|sail|drive|wander|approach|arrive|flee|sneak|tiptoe|dash|hurry|rush|stroll|hike|trek|stumble|squeeze|swim|row|sprint|stride|wade|vault|teleport)\b/i;

// Natural-play verbs (GH #39): first-person prose adds verbs like turn/cut/push
// that command-style play never used. Only used in NATURAL_PROSE_WALK below,
// so "push the button" stays unknown (no direction signal).
const NATURAL_PLAY_VERBS =
    'go|walk|head|run|step|move|travel|journey|venture|march|crawl|climb|descend|ascend|enter|exit|leave|return|follow|cross|traverse|slip|slide|fall|tumble|plunge|dive|drop|jump|leap|fly|ride|sail|drive|wander|approach|arrive|flee|sneak|tiptoe|dash|hurry|rush|stroll|hike|trek|stumble|squeeze|swim|row|sprint|stride|wade|vault|teleport|cut|push|veer|duck|turn';

// Direction / destination signal required for the natural-prose match, so a
// first-person sentence that merely mentions a verb ("I look for a way out")
// is not a traversal, but "I push deeper into the pines" is.
const NATURAL_DIRECTION_SIGNAL =
    'north|south|east|west|northeast|northwest|southeast|southwest|up|down|in|out|into|onto|toward|towards|through|along|across|inside|outside|past|deeper|further|back';

// "I follow the winding copper path up the hill" — a first-person subject + a
// movement verb anywhere + a direction/destination signal anywhere. The verb
// need not sit right after the subject: "I turn south and follow the bend"
// and "I look around and walk north" are both traversals.
const NATURAL_PROSE_WALK = new RegExp(
    `\\b(?:i|i've|i'm|i'd|i'll|we|we've|we're|you)\\b.*` +
    `\\b(?:${NATURAL_PLAY_VERBS})\\b.*` +
    `\\b(?:${NATURAL_DIRECTION_SIGNAL})\\b`,
    'i'
);

/**
 * Classify a player action's spatial transition kind.
 *
 * Priority: time > portal > walk > unknown. A labeled mechanism wins over a
 * movement verb ("step through the glowing archway" is a portal crossing, not
 * a walk); a pure reposition with no signal is `unknown` and records no edge.
 *
 * @param {string} actionText - raw player action text
 * @returns {'walk'|'portal'|'time'|'unknown'}
 */
export function classifyTransition(actionText) {
    const text = String(actionText || '').trim();
    if (!text) return 'unknown';
    if (TIME_SIGNAL_RE.test(text)) return 'time';
    if (PORTAL_MECHANISM_RE.test(text)) return 'portal';
    if (WALK_VERBS.test(text) || NATURAL_PROSE_WALK.test(text)) return 'walk';
    return 'unknown';
}

// ─── direction parsing ─────────────────────────────────────────────────────

const CARDINALS = {
    north: 'north', n: 'north', northward: 'north',
    south: 'south', s: 'south', southward: 'south',
    east: 'east', e: 'east', eastward: 'east',
    west: 'west', w: 'west', westward: 'west',
    northeast: 'northeast', ne: 'northeast',
    northwest: 'northwest', nw: 'northwest',
    southeast: 'southeast', se: 'southeast',
    southwest: 'southwest', sw: 'southwest',
};

const NON_DIRECTIONAL = { up: 'up', down: 'down', in: 'in', out: 'out', inside: 'in', outside: 'out' };

// Verb-phrases without an obvious inverse: sliding, falling, teleporting,
// squeezing. These get NO reverse inference (spec Reverse Inference).
const ONE_WAY_VERBS = /^(slide|slip|fall|tumble|plunge|dive|drop|leap|vault|teleport|squeeze|squirm|slither|crash)\b/i;

/**
 * Extract a direction label from a player action, or null.
 *
 * - Portal mechanisms return the mechanism label (the portal edge's
 *   "direction" per D3).
 * - Cardinal / up / down / in / out words map to a label.
 * - Verb-phrases with an implied direction (ascend/descend/enter/exit/climb)
 *   map to a label.
 * - One-way verbs (slide/fall/teleport/...) return null so the traversal gets
 *   no reverse edge.
 *
 * @param {string} actionText - raw player action text
 * @returns {string|null} direction label or null
 */
export function directionFromAction(actionText) {
    const text = String(actionText || '').trim();
    if (!text) return null;
    const lower = text.toLowerCase();

    const mechanism = lower.match(PORTAL_MECHANISM_RE);
    if (mechanism) return mechanism[1];

    if (ONE_WAY_VERBS.test(lower)) return null;

    const words = lower.split(/[^a-z]+/).filter(Boolean);
    for (const word of words) {
        if (CARDINALS[word]) return CARDINALS[word];
        if (NON_DIRECTIONAL[word]) return NON_DIRECTIONAL[word];
    }

    if (/\bascend\b/.test(lower) || /\bclimb\b/.test(lower)) return 'up';
    if (/\bdescend\b/.test(lower)) return 'down';
    if (/\benter\b/.test(lower)) return 'in';
    if (/\bexit\b/.test(lower) || /\bleave\b/.test(lower)) return 'out';

    return null;
}

// ─── reversibility lexicon ─────────────────────────────────────────────────

const REVERSIBLE_DIRECTIONS = {
    north: 'south', south: 'north',
    east: 'west', west: 'east',
    northeast: 'southwest', southwest: 'northeast',
    northwest: 'southeast', southeast: 'northwest',
    up: 'down', down: 'up',
    in: 'out', out: 'in',
};

export function isReversibleDirection(direction) {
    return direction in REVERSIBLE_DIRECTIONS;
}

export function reverseDirection(direction) {
    return REVERSIBLE_DIRECTIONS[direction] || null;
}

// ─── reconciliation (D3) ───────────────────────────────────────────────────

/**
 * Build the store-lookup context the engine hands to `reconcile`.
 *
 * Every method is a thin pass-through over the structured store, scoped to
 * `adventureId`, stamping spatial rows with `turn` (D6: the same index
 * bufferTurnPair uses after the moves increment).
 *
 * @param {import('./structuredStore.js').StructuredStore} store
 * @param {string} adventureId
 * @param {number} turn - the stamping turn index (state.moves at commit time)
 * @param {function} [log] - debug logger; defaults to console.warn
 * @returns {object} the ctx reconcile consumes
 */
export function makeRoomMapContext(store, adventureId, turn, log = console.warn) {
    return {
        resolve(proposedName) {
            const known = store.findRoomByName(adventureId, proposedName);
            if (known) return known;
            return store.upsertRoom(adventureId, fallbackId(), proposedName, null, turn);
        },
        getRoom(roomId) {
            return store.getRoom(adventureId, roomId);
        },
        getEdge(fromRoomId, direction) {
            return store.getEdge(adventureId, fromRoomId, direction);
        },
        recordEdge(fromRoomId, direction, toRoomId, kind = 'walk', inferred = 0) {
            return store.recordEdge(adventureId, fromRoomId, direction, toRoomId, kind, inferred, turn);
        },
        retractEdge(fromRoomId, direction) {
            return store.retractEdge(adventureId, fromRoomId, direction);
        },
        recordVisit(roomId) {
            return store.recordVisit(adventureId, roomId, turn);
        },
        log,
    };
}

function fallbackId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Group rooms into connected components over WALK edges only (union-find).
 * Portal/time edges cross region boundaries, so a room reachable only through
 * a portal/time edge starts its own region. Pure: no store access.
 *
 * @param {Array<{id: string}>} rooms
 * @param {Array<{from_room: string, to_room: string, kind: string}>} edges
 * @returns {Array<{room_ids: string[]}>}
 */
export function computeRegions(rooms, edges) {
    const parent = new Map(rooms.map(r => [r.id, r.id]));
    const find = (x) => {
        let root = x;
        while (parent.get(root) !== root) root = parent.get(root);
        while (parent.get(x) !== root) {
            const next = parent.get(x);
            parent.set(x, root);
            x = next;
        }
        return root;
    };
    const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    };

    for (const edge of edges) {
        if (edge.kind !== 'walk') continue;
        if (!parent.has(edge.from_room) || !parent.has(edge.to_room)) continue;
        union(edge.from_room, edge.to_room);
    }

    const groups = new Map();
    for (const room of rooms) {
        const root = find(room.id);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(room.id);
    }
    return [...groups.values()].map(roomIds => ({ room_ids: roomIds }));
}

/**
 * Reconcile the narrator's proposed location against the persisted room graph
 * and return the canonical location + room id to commit (D3).
 *
 * NEVER throws: any store-write failure degrades to the proposed location
 * (the turn must complete; the map is advisory to the status contract).
 *
 * @param {string|null} prevRoomId - the player's room id before this turn
 *   (state.currentRoomId), or null on the first turn / old saves
 * @param {string} actionText - raw player action text
 * @param {string} proposedName - the narrator's proposed location name
 * @param {object} ctx - store-lookup context (see makeRoomMapContext)
 * @returns {{location: string, roomId: string|null}} canonical location + room id
 */
export function reconcile(prevRoomId, actionText, proposedName, ctx) {
    if (!ctx || typeof ctx.resolve !== 'function') {
        return { location: proposedName, roomId: prevRoomId || null };
    }
    const kind = classifyTransition(actionText);
    const direction = directionFromAction(actionText);

    try {
        // Walk with an existing edge in that direction resolves from the edge,
        // NOT from the proposed name — first-visit-wins must never fabricate a
        // node for a drifted narrator name.
        if (kind === 'walk' && prevRoomId && direction) {
            const edge = ctx.getEdge(prevRoomId, direction);
            if (edge) {
                const targetRoom = ctx.getRoom(edge.to_room);
                if (edge.inferred === 1) {
                    // Self-heal: a contradiction on an inferred edge retracts
                    // it and grows the new edge/room from the actual traversal.
                    const matches = targetRoom && roomNamesMatch(targetRoom.name, proposedName);
                    if (matches) {
                        ctx.recordVisit(edge.to_room);
                        return { location: targetRoom.name, roomId: edge.to_room };
                    }
                    const target = ctx.resolve(proposedName);
                    // 8.4: a directional proposal that resolves BACK to the
                    // current room must never fabricate a room--dir-->room
                    // self-loop plus its inferred reverse. The traversal
                    // landed nowhere new (blocked/kept-in-place narration):
                    // record the visit and return the current room without
                    // touching the contradicted edge.
                    if (target.id === prevRoomId) {
                        ctx.recordVisit(target.id);
                        return { location: target.name, roomId: target.id };
                    }
                    ctx.retractEdge(prevRoomId, direction);
                    ctx.recordEdge(prevRoomId, direction, target.id, 'walk', 0);
                    if (isReversibleDirection(direction)) {
                        ctx.recordEdge(target.id, reverseDirection(direction), prevRoomId, 'walk', 1);
                    }
                    ctx.recordVisit(target.id);
                    return { location: target.name, roomId: target.id };
                }
                // Confirmed edge: adopt the known target even on a drifted name.
                ctx.recordVisit(edge.to_room);
                return { location: targetRoom ? targetRoom.name : proposedName, roomId: edge.to_room };
            }
        }

        // All remaining cases resolve the proposed name to a node.
        const target = ctx.resolve(proposedName);

        // First turn (no previous room) or no actual movement: resolve the
        // node and record the visit, but never fabricate an edge.
        if (!prevRoomId || target.id === prevRoomId) {
            ctx.recordVisit(target.id);
            return { location: target.name, roomId: target.id };
        }

        if (kind === 'portal') {
            ctx.recordEdge(prevRoomId, direction || 'portal', target.id, 'portal', 0);
            ctx.recordVisit(target.id);
            return { location: target.name, roomId: target.id };
        }

        if (kind === 'time') {
            ctx.recordEdge(prevRoomId, 'time', target.id, 'time', 0);
            ctx.recordVisit(target.id);
            return { location: target.name, roomId: target.id };
        }

        if (kind === 'unknown') {
            ctx.recordVisit(target.id);
            return { location: target.name, roomId: target.id };
        }

        // kind === 'walk', no existing edge in that direction: grow it (to a
        // known room or a new one).
        if (direction) {
            ctx.recordEdge(prevRoomId, direction, target.id, 'walk', 0);
            if (isReversibleDirection(direction)) {
                ctx.recordEdge(target.id, reverseDirection(direction), prevRoomId, 'walk', 1);
            }
            ctx.recordVisit(target.id);
            return { location: target.name, roomId: target.id };
        }

        // Walk with no direction signal (one-way verb): record the forward
        // edge so the connection is visible, but no reverse inference.
        ctx.recordEdge(prevRoomId, null, target.id, 'walk', 0);
        ctx.recordVisit(target.id);
        return { location: target.name, roomId: target.id };
    } catch (e) {
        if (typeof ctx.log === 'function') {
            ctx.log(`Spatial reconciliation failed; keeping proposed location '${proposedName}': ${e.message}`);
        }
        // Degrade path (8.1) must never desync location/currentRoomId: even
        // when an edge write fails, still resolve the destination node and
        // record the visit so the room identity advances to the committed
        // location instead of dangling on the previous room. Best-effort —
        // if the node resolution itself fails the turn still completes with
        // the proposed location and the previous room id.
        try {
            const target = ctx.resolve(proposedName);
            ctx.recordVisit(target.id);
            return { location: target.name, roomId: target.id };
        } catch (e2) {
            if (typeof ctx.log === 'function') {
                ctx.log(`Spatial degrade resolve also failed; keeping previous room: ${e2.message}`);
            }
            return { location: proposedName, roomId: prevRoomId || null };
        }
    }
}
