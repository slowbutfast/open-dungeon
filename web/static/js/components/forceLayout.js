// Gravitational force layout (gravitational-node-map, 2.1).
//
// Pure, DOM-free ESM module: no fetch, no window, no Math.random. The panel
// feeds it the `/api/map` payload and receives settled world coordinates.
//
// The simulation is deliberately small (1–200 rooms): O(N²) pairwise
// repulsion per tick is well under a millisecond at that scale, and running it
// synchronously keeps the renderer deterministic and easy to unit-test.

export const MAX_PRESETTLE_TICKS = 120;
export const MIN_ALPHA = 0.02;
export const ALPHA_DECAY = 0.82;

const MIN_RADIUS = 10;
const MAX_RADIUS = 30;
const RADIUS_SCALE = 4;
const REPULSION = 3000;
const GRAVITY = 0.012;
const VELOCITY_DAMPING = 0.55;
const COLLISION_PADDING = 2;
const MAX_COLLISION_ITERATIONS = 220;

const COMPASS = {
    north: [0, -1], n: [0, -1], up: [0, -1],
    south: [0, 1], s: [0, 1], down: [0, 1],
    east: [1, 0], e: [1, 0], right: [1, 0],
    west: [-1, 0], w: [-1, 0], left: [-1, 0],
    northeast: [0.7, -0.7], ne: [0.7, -0.7],
    northwest: [-0.7, -0.7], nw: [-0.7, -0.7],
    southeast: [0.7, 0.7], se: [0.7, 0.7],
    southwest: [-0.7, 0.7], sw: [-0.7, 0.7],
};

// Deterministic PRNG (mulberry32). Exported so the determinism contract is
// directly testable; the layout never calls Math.random.
export function createRng(seed) {
    let state = (Number(seed) >>> 0) || 0x9e3779b9;
    return function next() {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Weighted degree: walk confirmed = 1.0, inferred = 0.5, portal/time = 1.0.
// Self-loops never contribute to degree (they are decoration, not connectivity).
export function weightedDegree(edges = []) {
    const degrees = new Map();
    const bump = (id, value) => {
        if (!id) return;
        degrees.set(id, (degrees.get(id) || 0) + value);
    };
    for (const edge of edges) {
        if (!edge || !edge.from || !edge.to || edge.from === edge.to) continue;
        const weight = edge.inferred ? 0.5 : 1;
        bump(edge.from, weight);
        bump(edge.to, weight);
    }
    return degrees;
}

// Radius and mass both scale monotonically with weighted degree so hubs read
// as larger, heavier orbs.
export function nodeRadius(degree = 0) {
    return Math.min(MAX_RADIUS, MIN_RADIUS + Math.sqrt(Math.max(0, degree)) * RADIUS_SCALE);
}

export function nodeMass(degree = 0) {
    return 1 + Math.max(0, degree) * 0.6;
}

// Walk edges pull harder and sit closer than portal/time edges.
export function springForEdge(edge = {}) {
    if (edge.kind === 'portal' || edge.kind === 'time') {
        return { length: 190, strength: 0.018 };
    }
    return { length: 98, strength: 0.09 };
}

function compassOffset(direction) {
    if (typeof direction !== 'string') return null;
    return COMPASS[direction.trim().toLowerCase()] || null;
}

function edgeKeyOf(edge) {
    return `${edge.from}|${edge.direction ?? ''}|${edge.to}`;
}

export function createForceLayout({
    rooms = [],
    edges = [],
    width = 800,
    height = 600,
    seed = 1,
} = {}) {
    let canvasWidth = width;
    let canvasHeight = height;
    let nextSeed = Number(seed) >>> 0 || 1;
    const rng = createRng(nextSeed);

    const nodes = new Map();
    const homeAnchors = new Map();

    let state = 'idle';
    let hoveredId = null;
    let draggedId = null;
    let dragStart = null;
    let alpha = 1;
    let edgeList = [];
    let degreeMap = new Map();

    function center() {
        return { x: canvasWidth / 2, y: canvasHeight / 2 };
    }

    function seedPosition(id) {
        const { x: cx, y: cy } = center();
        // Prefer a neighbour with a known position, biased by the recorded
        // compass direction so newly discovered rooms land on the correct side.
        for (const edge of edgeList) {
            if (edge.from !== id && edge.to !== id) continue;
            const otherId = edge.from === id ? edge.to : edge.from;
            const other = nodes.get(otherId);
            if (!other) continue;
            const offset = compassOffset(edge.direction);
            let dx;
            let dy;
            if (offset) {
                // Direction reads from `from` to `to`; invert when we are `from`.
                const sign = edge.from === id ? -1 : 1;
                dx = offset[0] * sign;
                dy = offset[1] * sign;
            } else {
                const angle = rng() * Math.PI * 2;
                dx = Math.cos(angle);
                dy = Math.sin(angle);
            }
            const spread = 90 + rng() * 40;
            return {
                x: other.x + dx * spread + (rng() - 0.5) * 18,
                y: other.y + dy * spread + (rng() - 0.5) * 18,
            };
        }
        const angle = rng() * Math.PI * 2;
        const radius = 90 + rng() * Math.min(canvasWidth, canvasHeight) * 0.3;
        return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    }

    function makeNode(room, id, seedPos) {
        const degree = degreeMap.get(id) || 0;
        return {
            id,
            name: room.name ?? id,
            x: seedPos.x,
            y: seedPos.y,
            vx: 0,
            vy: 0,
            radius: nodeRadius(degree),
            mass: nodeMass(degree),
            degree,
            pinned: false,
            fx: null,
            fy: null,
        };
    }

    function applyGraph({ rooms: nextRooms = [], edges: nextEdges = [] }) {
        const incomingIds = new Set(nextRooms.map(room => room.id));
        const removed = [];
        for (const id of [...nodes.keys()]) {
            if (!incomingIds.has(id)) {
                nodes.delete(id);
                homeAnchors.delete(id);
                removed.push(id);
            }
        }

        edgeList = nextEdges.filter(Boolean).slice();
        degreeMap = weightedDegree(edgeList);

        const added = [];
        for (const room of nextRooms) {
            if (!room || !room.id) continue;
            const existing = nodes.get(room.id);
            if (existing) {
                const degree = degreeMap.get(room.id) || 0;
                existing.name = room.name ?? room.id;
                existing.degree = degree;
                existing.radius = nodeRadius(degree);
                existing.mass = nodeMass(degree);
                const anchor = homeAnchors.get(room.id);
                if (anchor) {
                    existing.pinned = true;
                    existing.fx = anchor.x;
                    existing.fy = anchor.y;
                    existing.x = anchor.x;
                    existing.y = anchor.y;
                }
                continue;
            }
            const node = makeNode(room, room.id, seedPosition(room.id));
            nodes.set(room.id, node);
            added.push(room.id);
        }

        return { added, removed, retained: nextRooms.filter(room => !added.includes(room.id)).map(room => room.id) };
    }

    function resolveCollisions(iterations = MAX_COLLISION_ITERATIONS) {
        const list = [...nodes.values()];
        for (let pass = 0; pass < iterations; pass += 1) {
            let moved = false;
            for (let i = 0; i < list.length; i += 1) {
                for (let j = i + 1; j < list.length; j += 1) {
                    const a = list[i];
                    const b = list[j];
                    let dx = b.x - a.x;
                    let dy = b.y - a.y;
                    let distance = Math.hypot(dx, dy);
                    const minimum = a.radius + b.radius + COLLISION_PADDING;
                    if (distance >= minimum) continue;
                    if (distance < 1e-6) {
                        // Deterministic separation for coincident nodes.
                        dx = 1;
                        dy = 0;
                        distance = 1;
                    }
                    const overlap = minimum - distance;
                    const nx = dx / distance;
                    const ny = dy / distance;
                    const aFixed = a.pinned || (state === 'drag' && a.id === draggedId);
                    const bFixed = b.pinned || (state === 'drag' && b.id === draggedId);
                    if (aFixed && bFixed) continue;
                    const aShare = aFixed ? 0 : (bFixed ? 1 : 0.5);
                    const bShare = bFixed ? 0 : (aFixed ? 1 : 0.5);
                    a.x -= nx * overlap * aShare;
                    a.y -= ny * overlap * aShare;
                    b.x += nx * overlap * bShare;
                    b.y += ny * overlap * bShare;
                    moved = true;
                }
            }
            if (!moved) break;
        }
    }

    function tick() {
        const list = [...nodes.values()];
        const { x: cx, y: cy } = center();

        if (state === 'drag' && draggedId) {
            const dragged = nodes.get(draggedId);
            if (dragged) {
                dragged.vx = 0;
                dragged.vy = 0;
                dragged.x = dragged.fx ?? dragged.x;
                dragged.y = dragged.fy ?? dragged.y;
            }
        }

        for (let i = 0; i < list.length; i += 1) {
            const a = list[i];
            if (a.pinned || (state === 'drag' && a.id === draggedId)) continue;
            for (let j = i + 1; j < list.length; j += 1) {
                const b = list[j];
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let distance = Math.hypot(dx, dy);
                if (distance < 1e-6) {
                    dx = 1;
                    dy = 0;
                    distance = 1;
                }
                const nx = dx / distance;
                const ny = dy / distance;
                const force = REPULSION / Math.max(distance * distance, 64);
                if (!(b.pinned || (state === 'drag' && b.id === draggedId))) {
                    b.vx += nx * force / b.mass;
                    b.vy += ny * force / b.mass;
                }
                a.vx -= nx * force / a.mass;
                a.vy -= ny * force / a.mass;
            }
        }

        for (const edge of edgeList) {
            if (edge.from === edge.to) continue;
            const a = nodes.get(edge.from);
            const b = nodes.get(edge.to);
            if (!a || !b) continue;
            const spring = springForEdge(edge);
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            const distance = Math.hypot(dx, dy) || 1;
            const nx = dx / distance;
            const ny = dy / distance;
            const force = (distance - spring.length) * spring.strength;
            if (!(b.pinned || (state === 'drag' && b.id === draggedId))) {
                b.vx -= nx * force / b.mass;
                b.vy -= ny * force / b.mass;
            }
            if (!(a.pinned || (state === 'drag' && a.id === draggedId))) {
                a.vx += nx * force / a.mass;
                a.vy += ny * force / a.mass;
            }
        }

        for (const node of list) {
            if (node.pinned) {
                node.x = node.fx;
                node.y = node.fy;
                node.vx = 0;
                node.vy = 0;
                continue;
            }
            if (state === 'drag' && node.id === draggedId) {
                node.x = node.fx;
                node.y = node.fy;
                node.vx = 0;
                node.vy = 0;
                continue;
            }
            node.vx += (cx - node.x) * GRAVITY;
            node.vy += (cy - node.y) * GRAVITY;
            node.vx *= VELOCITY_DAMPING;
            node.vy *= VELOCITY_DAMPING;
            node.x += node.vx;
            node.y += node.vy;
        }

        resolveCollisions(18);
        alpha *= ALPHA_DECAY;
        if (state === 'coasting' && alpha <= MIN_ALPHA) {
            state = 'idle';
        }
    }

    function settle(maxTicks = MAX_PRESETTLE_TICKS) {
        let ticks = 0;
        while (alpha > MIN_ALPHA && ticks < maxTicks) {
            tick();
            ticks += 1;
        }
        resolveCollisions(MAX_COLLISION_ITERATIONS);
        if (state === 'coasting') state = 'idle';
        return ticks;
    }

    function setGraph(data = {}) {
        const result = applyGraph(data);
        alpha = Math.max(alpha, result.added.length > 0 ? 1 : 0.5);
        return result;
    }

    function startHover(id) {
        if (state === 'drag' || state === 'coasting') return false;
        if (!nodes.has(id)) return false;
        state = 'hover';
        hoveredId = id;
        return true;
    }

    function endHover() {
        if (state === 'hover') state = 'idle';
        hoveredId = null;
    }

    function startDrag(id) {
        const node = nodes.get(id);
        if (!node) return false;
        state = 'drag';
        hoveredId = null;
        draggedId = id;
        dragStart = { x: node.x, y: node.y, wasPinned: homeAnchors.has(id) };
        node.fx = node.x;
        node.fy = node.y;
        node.vx = 0;
        node.vy = 0;
        return true;
    }

    function dragTo(x, y) {
        if (state !== 'drag' || !draggedId) return false;
        const node = nodes.get(draggedId);
        if (!node) return false;
        node.fx = x;
        node.fy = y;
        node.x = x;
        node.y = y;
        node.vx = 0;
        node.vy = 0;
        return true;
    }

    function dragEnd({ cancel = false } = {}) {
        if (state !== 'drag' || !draggedId) return false;
        const node = nodes.get(draggedId);
        const start = dragStart;
        draggedId = null;
        dragStart = null;
        if (!node) {
            state = 'idle';
            return false;
        }
        if (cancel) {
            if (start && !start.wasPinned) {
                node.x = start.x;
                node.y = start.y;
                node.pinned = false;
                node.fx = null;
                node.fy = null;
            }
            node.vx = 0;
            node.vy = 0;
            state = 'idle';
            return true;
        }
        homeAnchors.set(node.id, { x: node.x, y: node.y });
        node.pinned = true;
        node.fx = node.x;
        node.fy = node.y;
        alpha = Math.max(alpha, 0.35);
        state = alpha > MIN_ALPHA ? 'coasting' : 'idle';
        return true;
    }

    function unpin(id) {
        const node = nodes.get(id);
        if (!node) return false;
        homeAnchors.delete(id);
        node.pinned = false;
        node.fx = null;
        node.fy = null;
        alpha = Math.max(alpha, 0.4);
        return true;
    }

    function setViewport(nextWidth, nextHeight) {
        canvasWidth = Math.max(1, nextWidth);
        canvasHeight = Math.max(1, nextHeight);
    }

    applyGraph({ rooms, edges });

    return {
        nodes,
        homeAnchors,
        get state() { return state; },
        get hoveredId() { return hoveredId; },
        get draggedId() { return draggedId; },
        get alpha() { return alpha; },
        get edges() { return edgeList; },
        getNode(id) { return nodes.get(id) || null; },
        getSnapshot() {
            return [...nodes.values()].map(node => ({
                id: node.id,
                x: node.x,
                y: node.y,
                radius: node.radius,
                pinned: node.pinned,
            }));
        },
        setGraph,
        setViewport,
        tick,
        settle,
        resolveCollisions,
        startHover,
        endHover,
        startDrag,
        dragTo,
        dragEnd,
        unpin,
    };
}
