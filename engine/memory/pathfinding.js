// Deterministic route planning over the spatial room graph
// (spatial-map-visualization-pathfinding, D1/D2/D3).
//
// Pure module mirroring roomMap.js: `findRoute(rooms, edges, fromId, toId)`
// takes the raw store-row shapes `computeRegions` consumes (rooms with `id`;
// edges with `from_room`/`direction`/`to_room`/`kind`/`inferred`), holds no
// store handle, and is unit-testable without an LLM or a live store.
//
// Contract (architecture D4):
//   found:      { found: true, from_room_id, to_room_id, step_count,
//                 steps: [{ from_room_id, direction, to_room_id, kind, inferred }] }
//   not found:  { found: false, from_room_id, to_room_id, step_count: 0,
//                 steps: [], reason: 'no_route' | 'different_region' }
//   unknown id: null
//
// The pure module returns ids only — room names are resolved at the payload
// boundary (the engine proxy).
import { computeRegions } from './roomMap.js';

// Direction label surfaced for a recorded walk edge with a null direction
// (directionless one-way walks are real connectivity and must still yield a
// readable step). The exact label is an implementation detail; the contract
// only pins that it is a non-empty string.
export const FALLBACK_DIRECTION = 'onward';

/**
 * Plan the shortest directed walk route between two rooms.
 *
 * BFS over unweighted `kind='walk'` edges in the recorded direction only:
 * portal/time edges are never traversed, inferred reverse edges and
 * null-direction walks are. Adjacency is sorted by `(direction ?? '', to_room)`
 * before the sweep because `getEdges` is an unsorted `SELECT *` — route
 * determinism is a requirement, so input row order must not matter.
 *
 * @param {Array<{id: string}>} rooms - raw room rows (or any objects with `id`)
 * @param {Array<{from_room: string, direction: string|null, to_room: string, kind: string, inferred: number}>} edges - raw edge rows
 * @param {string} fromId
 * @param {string} toId
 * @returns {object|null} the route payload, or null when either id is unknown
 */
export function findRoute(rooms, edges, fromId, toId) {
    const roomIds = new Set(rooms.map(r => r.id));
    if (!roomIds.has(fromId) || !roomIds.has(toId)) return null;

    // A self-route is a found zero-step route, not a search.
    if (fromId === toId) {
        return {
            found: true,
            from_room_id: fromId,
            to_room_id: toId,
            step_count: 0,
            steps: [],
        };
    }

    // ─── adjacency: walk edges only, deterministically ordered ─────────────
    const adjacency = new Map();
    for (const edge of edges) {
        if (edge.kind !== 'walk') continue;
        if (!roomIds.has(edge.from_room) || !roomIds.has(edge.to_room)) continue;
        if (!adjacency.has(edge.from_room)) adjacency.set(edge.from_room, []);
        adjacency.get(edge.from_room).push(edge);
    }
    for (const list of adjacency.values()) {
        list.sort((a, b) => {
            const da = a.direction ?? '';
            const db = b.direction ?? '';
            if (da !== db) return da < db ? -1 : 1;
            const ta = a.to_room ?? '';
            const tb = b.to_room ?? '';
            if (ta !== tb) return ta < tb ? -1 : 1;
            return 0;
        });
    }

    // ─── directed BFS (shortest-hop by construction) ───────────────────────
    const visited = new Set([fromId]);
    const queue = [fromId];
    const predecessor = new Map(); // room id -> { prevRoom, edge }
    let reached = false;

    while (queue.length > 0) {
        const current = queue.shift();
        if (current === toId) {
            reached = true;
            break;
        }
        for (const edge of adjacency.get(current) || []) {
            const next = edge.to_room;
            if (visited.has(next)) continue;
            visited.add(next);
            predecessor.set(next, { prevRoom: current, edge });
            queue.push(next);
        }
    }

    if (reached) {
        const steps = [];
        let cursor = toId;
        while (cursor !== fromId) {
            const { prevRoom, edge } = predecessor.get(cursor);
            steps.push({
                from_room_id: prevRoom,
                direction: edge.direction ?? FALLBACK_DIRECTION,
                to_room_id: edge.to_room,
                kind: edge.kind,
                inferred: edge.inferred ?? 0,
            });
            cursor = prevRoom;
        }
        steps.reverse();
        return {
            found: true,
            from_room_id: fromId,
            to_room_id: toId,
            step_count: steps.length,
            steps,
        };
    }

    // ─── failure classification via walk-connected components (D3) ─────────
    const regions = computeRegions(rooms, edges);
    const fromRegion = regions.find(r => r.room_ids.includes(fromId));
    const toRegion = regions.find(r => r.room_ids.includes(toId));
    const sameRegion = Boolean(fromRegion) && fromRegion === toRegion;

    return {
        found: false,
        from_room_id: fromId,
        to_room_id: toId,
        step_count: 0,
        steps: [],
        reason: sameRegion ? 'no_route' : 'different_region',
    };
}
