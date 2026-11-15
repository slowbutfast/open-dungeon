// Pure map geometry (gravitational-node-map, 2.2).
//
// DOM-free ESM module shared by rendering, hit testing, obstacle snapshots and
// popover anchoring: compact naming, camera math, antiparallel curves,
// circle-border arrowhead trimming and route edge-key matching.

export const COMPACT_NAME_MAX = 16;
export const ELLIPSIS = '…';

const LEADING_ARTICLE = /^(the|an|a)\s+/i;

/**
 * Two-tier naming: the canvas orb shows a compact title (<= 16 chars), the
 * hover card and inspector show the full `room.name`.
 */
// Build `prefix…lastToken` while keeping distinguishing middle words when the
// budget allows. Returns null when the tail plus ellipsis cannot fit.
function compactWithTail(withoutArticle, maxLength) {
    const tokens = withoutArticle.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return null;
    const lastToken = tokens[tokens.length - 1];
    const budget = maxLength - 1 - lastToken.length;
    if (budget < 1) return null;

    let prefix = '';
    for (let i = 0; i < tokens.length - 1; i += 1) {
        const candidate = prefix ? `${prefix} ${tokens[i]}` : tokens[i];
        if (candidate.length <= budget) {
            prefix = candidate;
            continue;
        }
        const remaining = budget - prefix.length - 1;
        if (prefix && remaining >= 1) {
            // Include an initial from the first omitted distinguishing word so
            // shared prefixes don't collapse to the same label.
            prefix = `${prefix} ${tokens[i].slice(0, remaining)}`.trimEnd();
        } else if (!prefix) {
            prefix = tokens[i].slice(0, budget).trimEnd();
        }
        break;
    }
    return prefix ? `${prefix}${ELLIPSIS}${lastToken}` : null;
}

export function formatCompactRoomName(name, maxLength = COMPACT_NAME_MAX) {
    const full = String(name ?? '').trim();
    if (!full) return '';
    if (full.length <= maxLength) return full;

    const withoutArticle = full.replace(LEADING_ARTICLE, '');
    if (withoutArticle.length <= maxLength) return withoutArticle;

    const tokens = withoutArticle.split(/\s+/).filter(Boolean);
    const lastToken = tokens[tokens.length - 1];

    // Numbered rooms keep their trailing number so dense sets stay
    // distinguishable ("Winding Passage 23" -> "Winding Passa…23").
    if (tokens.length > 1 && /\d/.test(lastToken)) {
        const withTail = compactWithTail(withoutArticle, maxLength);
        if (withTail) return withTail;
    }

    // Non-numbered names: truncate on a word boundary, never mid-word.
    const budget = maxLength - 1;
    let prefix = '';
    for (const token of tokens) {
        const candidate = prefix ? `${prefix} ${token}` : token;
        if (candidate.length <= budget) {
            prefix = candidate;
        } else {
            break;
        }
    }
    if (prefix) return `${prefix}${ELLIPSIS}`;
    return `${withoutArticle.slice(0, budget)}${ELLIPSIS}`;
}

/**
 * Render-time label dedupe. `formatCompactRoomName` is intentionally
 * context-free, so two distinct rooms can still share a compact label
 * ("Chapel of Quiet Bells" / "Chapel of Quiet Waters" both -> "Chapel of…").
 * This pass expands the distinguishing tail per colliding room, then applies a
 * minimal `~N` suffix as a final uniqueness guarantee. Returns `Map<id,label>`.
 */
export function dedupeCompactLabels(rooms, maxLength = COMPACT_NAME_MAX) {
    const list = (rooms || []).filter(room => room && room.id);
    const labels = new Map();
    const groups = new Map();

    for (const room of list) {
        const full = String(room.name ?? room.id).trim() || room.id;
        const label = formatCompactRoomName(full, maxLength);
        labels.set(room.id, label);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push({ room, full });
    }

    for (const ids of groups.values()) {
        if (ids.length < 2) continue;
        for (const { room, full } of ids) {
            const withoutArticle = full.replace(LEADING_ARTICLE, '');
            const withTail = compactWithTail(withoutArticle, maxLength);
            if (withTail) labels.set(room.id, withTail);
        }
    }

    // Final pass: guarantee every visible label is unique and within budget.
    const used = new Set();
    for (const room of list) {
        let candidate = labels.get(room.id);
        if (!used.has(candidate)) {
            used.add(candidate);
            continue;
        }
        let counter = 2;
        while (true) {
            const suffix = `~${counter}`;
            const head = candidate.replace(/…$/u, '').slice(0, Math.max(1, maxLength - suffix.length));
            const next = `${head}${suffix}`;
            if (!used.has(next)) {
                labels.set(room.id, next);
                used.add(next);
                break;
            }
            counter += 1;
        }
    }

    return labels;
}

// ─── camera ───────────────────────────────────────────────────────────────
// A camera is `{ x, y, zoom }` with `screen = world * zoom + (x, y)`, which
// matches a CSS transform of `translate(x, y) scale(zoom)` with origin 0 0.

export function worldToScreen(point, camera) {
    return {
        x: point.x * camera.zoom + camera.x,
        y: point.y * camera.zoom + camera.y,
    };
}

export function screenToWorld(point, camera) {
    return {
        x: (point.x - camera.x) / camera.zoom,
        y: (point.y - camera.y) / camera.zoom,
    };
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/** Zoom around a screen point, keeping the world point under the cursor fixed. */
export function zoomAtPoint(camera, factor, point, { min = 0.2, max = 2.5 } = {}) {
    const zoom = clamp(camera.zoom * factor, min, max);
    const world = screenToWorld(point, camera);
    return {
        x: point.x - world.x * zoom,
        y: point.y - world.y * zoom,
        zoom,
    };
}

export function computeBounds(nodes, padding = 0) {
    const list = [...nodes];
    if (list.length === 0) {
        return { minX: -padding, minY: -padding, maxX: padding, maxY: padding };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of list) {
        const radius = node.radius || 0;
        minX = Math.min(minX, node.x - radius);
        minY = Math.min(minY, node.y - radius);
        maxX = Math.max(maxX, node.x + radius);
        maxY = Math.max(maxY, node.y + radius);
    }
    return {
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding,
    };
}

/** Pan/zoom to frame `bounds` inside the viewport. */
export function computeFitViewport(bounds, viewport, { padding = 28, minZoom = 0.2, maxZoom = 2.5 } = {}) {
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const availableWidth = Math.max(1, viewport.width - padding * 2);
    const availableHeight = Math.max(1, viewport.height - padding * 2);
    const zoom = clamp(Math.min(availableWidth / width, availableHeight / height), minZoom, maxZoom);
    const centreX = (bounds.minX + bounds.maxX) / 2;
    const centreY = (bounds.minY + bounds.maxY) / 2;
    return {
        x: viewport.width / 2 - centreX * zoom,
        y: viewport.height / 2 - centreY * zoom,
        zoom,
    };
}

// ─── edge geometry ────────────────────────────────────────────────────────

/**
 * SVG path for a directed edge. `bend` picks the side of the straight line
 * (+1 / -1); antiparallel pairs pass opposite signs so the arcs mirror.
 */
export function edgeCurve(from, to, { bend = 0, curvature = 0.18 } = {}) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    if (!bend) {
        return {
            d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
            control: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
            straight: true,
        };
    }
    const offset = length * curvature * Math.sign(bend);
    const control = {
        x: (from.x + to.x) / 2 - (dy / length) * offset,
        y: (from.y + to.y) / 2 + (dx / length) * offset,
    };
    return {
        d: `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`,
        control,
        straight: false,
    };
}

/** Self-loop arc drawn above-left of the node so it never overlaps the orb. */
export function selfLoopPath(node, radius) {
    const startX = node.x - radius * 0.7;
    const startY = node.y - radius * 0.7;
    const endX = node.x + radius * 0.7;
    const endY = node.y - radius * 0.7;
    const rx = radius * 1.25;
    return `M ${startX} ${startY} A ${rx} ${rx} 0 1 1 ${endX} ${endY}`;
}

/** Point on the ray `from -> to` at `radius + gap` before `to`. */
export function trimToCircleBorder(from, to, radius, gap = 0) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-6) return { x: to.x, y: to.y };
    const trim = Math.min(distance, radius + gap);
    return {
        x: to.x - (dx / distance) * trim,
        y: to.y - (dy / distance) * trim,
    };
}

/** Trim both endpoints to their node radii so arrowheads clear the orbs. */
export function trimmedEdgeEndpoints(from, to, gap = 2) {
    return {
        start: trimToCircleBorder(to, from, from.radius || 0, gap),
        end: trimToCircleBorder(from, to, to.radius || 0, gap),
    };
}

// ─── route matching ───────────────────────────────────────────────────────

/** `data-edge-key="<from>|<direction ?? ''>|<to>"`. */
export function edgeKey(from, direction, to) {
    return `${from}|${direction ?? ''}|${to}`;
}

export function edgeKeyForEdge(edge) {
    return edgeKey(edge.from, edge.direction, edge.to);
}

/** Match a `/api/path` step (including `direction: null`) to a graph edge. */
export function edgeMatchesStep(edge, step) {
    if (!edge || !step) return false;
    if (edge.from !== step.from_room_id || edge.to !== step.to_room_id) return false;
    if (step.direction == null) return edge.direction == null;
    return edge.direction === step.direction;
}

export function findEdgeForStep(edges, step) {
    if (!Array.isArray(edges)) return null;
    return edges.find(edge => edgeMatchesStep(edge, step)) || null;
}
