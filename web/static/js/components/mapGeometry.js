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
export function formatCompactRoomName(name, maxLength = COMPACT_NAME_MAX) {
    const full = String(name ?? '').trim();
    if (!full) return '';
    if (full.length <= maxLength) return full;

    const withoutArticle = full.replace(LEADING_ARTICLE, '');
    if (withoutArticle.length <= maxLength) return withoutArticle;

    // Preserve the trailing token/number so dense numbered rooms stay
    // distinguishable ("Winding Passage 23" -> "Winding…23") instead of all
    // collapsing to the same prefix.
    const tokens = withoutArticle.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
        const lastToken = tokens[tokens.length - 1];
        const budget = maxLength - 1 - lastToken.length;
        if (budget >= 1) {
            const prefix = tokens[0].slice(0, budget).trimEnd();
            if (prefix) return `${prefix}${ELLIPSIS}${lastToken}`;
        }
    }

    return `${withoutArticle.slice(0, Math.max(0, maxLength - 1))}${ELLIPSIS}`;
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
