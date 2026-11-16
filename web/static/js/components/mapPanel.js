// Map panel — single-mode gravitational node map (gravitational-node-map).
//
// Co-located component in the actionChips/barterModal style: owns its DOM
// rendering, its fetch via the per-domain api/map.js client, and its module
// view state (cached payload, camera, hover/selection, in-memory pins).
//
// Renderer: hand-rolled DOM orbs + an SVG edge layer — no graph library, no
// build step. Rooms stay `.map-room[data-room-id]` so the DOM contract is
// stable across renders. Pure physics/geometry/placement live in
// forceLayout.js, mapGeometry.js and popoverPlacement.js.

import { fetchMap, fetchPath } from '../api/map.js';
import { createForceLayout } from './forceLayout.js';
import {
    formatCompactRoomName,
    dedupeCompactLabels,
    computeBounds,
    worldToScreen,
    screenToWorld,
    zoomAtPoint,
    computeFitViewport,
    edgeCurve,
    selfLoopPath,
    trimmedEdgeEndpoints,
    edgeKey,
    findEdgeForStep,
    clamp
} from './mapGeometry.js';
import { chooseBestPopoverPosition } from './popoverPlacement.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HOVER_DWELL_MS = 200;
const HOVER_GRACE_MS = 150;
const DRAG_THRESHOLD = 6;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const FAR_ZOOM = 0.6;
const FALLBACK_WIDTH = 300;
const FALLBACK_HEIGHT = 320;
const EDGE_GAP = 3;
const INSPECTOR_LERP = 18;

// Edge kind → arrow colour. Portal/time are visually distinct from walk.
const EDGE_COLORS = {
    walk: '#38bdf8',
    portal: '#c084fc',
    time: '#facc15'
};

let cachedMap = null;
let graphData = { rooms: [], edges: [], regions: [], current_room_id: null };
let layout = null;
let camera = { x: 0, y: 0, zoom: 1, initialized: false };
// 'fit' = frame all rooms, 'center' = focus the current room, 'manual' = the
// player panned/zoomed and resize must not steal the camera back.
let cameraMode = 'fit';
// Size the current FIT camera was computed for, so a hidden-tab fallback fit
// can be corrected when the real canvas size becomes available.
let fittedForSize = null;

const nodeEls = new Map();
const edgePaths = new Map();
const edgeLabels = new Map();
const labelEls = new Map();
let labelMetrics = new WeakMap();
let compactLabels = new Map();
let lastGraphSignature = null;

let hoveredId = null;
let hoverDwellTimer = null;
let hoverHideTimer = null;
let inspectedId = null;
let routeKeys = [];
let routeController = null;
let suppressInspectUntil = 0;

let pointerPress = null;
let panGesture = null;
let pinchGesture = null;
const activePointers = new Map();

let inspectorManual = null;
let inspectorFrame = null;
let inspectorLast = 0;

let wired = false;
let resizeTimer = null;
let resizeObserver = null;
let lastCanvasSize = { width: 0, height: 0 };

// ─── public entry points ──────────────────────────────────────────────────

export async function refreshMapPanel() {
    const panel = document.getElementById('map-panel');
    if (!panel) return;

    // Paint the last known payload synchronously so opening the tab is instant
    // and the room count never dips while the request is in flight.
    if (cachedMap) renderMapPanel(cachedMap);

    try {
        cachedMap = await fetchMap();
    } catch {
        cachedMap = { rooms: [], edges: [], regions: [], current_room_id: null };
    }
    renderMapPanel(cachedMap);
}

export function renderMapPanel(data) {
    const panel = document.getElementById('map-panel');
    if (!panel) return;

    cachedMap = data;
    graphData = {
        rooms: Array.isArray(data.rooms) ? data.rooms : [],
        edges: Array.isArray(data.edges) ? data.edges : [],
        regions: Array.isArray(data.regions) ? data.regions : [],
        current_room_id: data.current_room_id ?? null
    };

    panel.setAttribute('data-current-room-id', graphData.current_room_id || '');
    const canvas = ensureCanvas(panel);
    const content = ensureContent(canvas);
    wireInteractions(panel, canvas);

    const signature = graphSignature(graphData);
    const graphChanged = lastGraphSignature !== null && signature !== lastGraphSignature;
    lastGraphSignature = signature;

    // A committed turn may have moved the party or removed rooms: drop any
    // painted route before diffing the new graph.
    clearRoute();
    reconcileInspector();

    if (graphData.rooms.length === 0) {
        for (const [id, el] of nodeEls) {
            el.remove();
            nodeEls.delete(id);
        }
        for (const [key, path] of edgePaths) {
            path.remove();
            edgePaths.delete(key);
        }
        for (const [key, label] of edgeLabels) {
            label.remove();
            edgeLabels.delete(key);
        }
        for (const [id, entry] of labelEls) {
            entry.wrap.remove();
            labelEls.delete(id);
        }
        document.getElementById('map-label-layer')?.remove();
        const svg = document.getElementById('map-edges');
        if (svg) svg.remove();
        content.style.transform = '';
        showEmpty(canvas);
        layout = null;
        camera = { x: 0, y: 0, zoom: 1, initialized: false };
        fittedForSize = null;
        closeInspector();
        return;
    }

    hideEmpty();

    const measured = measureCanvas(canvas);
    const fresh = !layout;
    if (!layout) {
        layout = createForceLayout({
            rooms: graphData.rooms,
            edges: graphData.edges,
            width: measured.width,
            height: measured.height,
            seed: 1337
        });
    } else {
        layout.setViewport(measured.width, measured.height);
        layout.setGraph(graphData);
    }

    layout.settle();
    renderEdges(content);
    renderNodes(content);
    updateAllGeometry();

    if (fresh || !camera.initialized) {
        fitCamera();
    } else if (cameraMode === 'fit') {
        const fitted = fittedForSize;
        const stale = graphChanged
            || !fitted
            || fitted.usedFallback
            || measured.usedFallback
            || Math.abs(measured.width - fitted.width) > 0.5
            || Math.abs(measured.height - fitted.height) > 0.5;
        if (stale) fitCamera();
        else {
            applyCamera();
            ensureCurrentInView();
        }
    } else {
        applyCamera();
        // A manual camera is the player's; never recenter it behind their back.
        if (cameraMode === 'center') ensureCurrentInView();
    }

    if (inspectedId) {
        const room = roomById(inspectedId);
        if (room) renderInspectorBody(room);
    }

    if (inspectorFrame) startInspectorTracking();
    scheduleLabelCulling({ immediate: true });
}

// ─── DOM scaffolding ──────────────────────────────────────────────────────

function ensureCanvas(panel) {
    let canvas = document.getElementById('map-canvas');
    if (!canvas) {
        canvas = document.createElement('div');
        canvas.id = 'map-canvas';
        canvas.className = 'map-canvas';
        panel.appendChild(canvas);
    }
    return canvas;
}

function ensureContent(canvas) {
    let content = document.getElementById('map-canvas-content');
    if (!content) {
        content = document.createElement('div');
        content.id = 'map-canvas-content';
        content.className = 'map-canvas-content';
        canvas.appendChild(content);
    }
    return content;
}

function showEmpty(canvas) {
    let empty = canvas.querySelector(':scope > .map-empty');
    if (!empty) {
        empty = document.createElement('div');
        empty.className = 'map-empty';
        empty.innerText = '[NO ROOMS MAPPED YET]';
        canvas.appendChild(empty);
    }
    empty.style.display = '';
}

function hideEmpty() {
    const empty = document.querySelector('#map-canvas > .map-empty');
    if (empty) empty.remove();
}

function measureCanvas(canvas) {
    const usedFallback = canvas.clientWidth <= 0 || canvas.clientHeight <= 0;
    const width = canvas.clientWidth > 0 ? canvas.clientWidth : (lastCanvasSize.width || FALLBACK_WIDTH);
    const height = canvas.clientHeight > 0 ? canvas.clientHeight : (lastCanvasSize.height || FALLBACK_HEIGHT);
    lastCanvasSize = { width, height };
    return { width, height, usedFallback };
}

function roomById(id) {
    return graphData.rooms.find(room => room.id === id) || null;
}

function nodeById(id) {
    return layout ? layout.getNode(id) : null;
}

function graphSignature(data) {
    const roomIds = (data.rooms || []).map(room => room.id).filter(Boolean).sort();
    const edgeKeys = (data.edges || [])
        .filter(edge => edge && edge.from && edge.to)
        .map(edge => edgeKey(edge.from, edge.direction, edge.to))
        .sort();
    return `${data.current_room_id ?? ''}|${roomIds.join(',')}|${edgeKeys.join(',')}`;
}

// ─── keyed node/edge diffing ──────────────────────────────────────────────

function ensureLabelLayer(content) {
    let layer = document.getElementById('map-label-layer');
    if (!layer) {
        layer = document.createElement('div');
        layer.id = 'map-label-layer';
        layer.className = 'map-label-layer';
        content.appendChild(layer);
    }
    return layer;
}

function renderNodes(content) {
    compactLabels = dedupeCompactLabels(graphData.rooms);
    ensureLabelLayer(content);
    const seen = new Set();
    for (const room of graphData.rooms) {
        if (!room || !room.id) continue;
        seen.add(room.id);
        let el = nodeEls.get(room.id);
        if (!el) {
            el = buildRoomNode(room);
            nodeEls.set(room.id, el);
            content.appendChild(el);
        }
        ensureNodeLabel(room);
        updateRoomNode(el, room);
    }
    for (const [id, el] of [...nodeEls]) {
        if (!seen.has(id)) {
            el.remove();
            nodeEls.delete(id);
        }
    }
    for (const [id, entry] of [...labelEls]) {
        if (!seen.has(id)) {
            entry.wrap.remove();
            labelEls.delete(id);
        }
    }
}

function buildRoomNode(room) {
    const el = document.createElement('div');
    el.className = 'map-room';
    el.setAttribute('data-room-id', room.id);
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    return el;
}

function ensureNodeLabel(room) {
    let entry = labelEls.get(room.id);
    if (entry) return entry;

    const wrap = document.createElement('div');
    wrap.className = 'map-node-label label-pos-bottom';
    wrap.setAttribute('data-room-id', room.id);
    wrap.dataset.placement = 'bottom';

    const name = document.createElement('span');
    name.className = 'map-room-name';
    name.setAttribute('data-room-id', room.id);

    const meta = document.createElement('span');
    meta.className = 'map-room-meta';
    meta.setAttribute('data-room-id', room.id);

    wrap.appendChild(name);
    wrap.appendChild(meta);
    ensureLabelLayer(document.getElementById('map-canvas-content')).appendChild(wrap);

    entry = { wrap, name, meta };
    labelEls.set(room.id, entry);
    return entry;
}

function updateRoomNode(el, room) {
    const fullName = room.name || room.id;
    const visitCount = room.visit_count || 0;
    const visited = visitCount > 0 || room.last_visit_turn != null;
    const isCurrent = room.id === graphData.current_room_id;
    const isFocal = isCurrent || hoveredId === room.id || inspectedId === room.id;
    const pinned = layout ? layout.homeAnchors.has(room.id) : false;

    el.classList.toggle('current-room', isCurrent);
    el.classList.toggle('visited', visited);
    el.classList.toggle('unvisited', !visited);
    el.classList.toggle('is-selected', inspectedId === room.id);
    if (hoveredId) {
        el.classList.toggle('is-hovered', hoveredId === room.id);
        el.classList.toggle('is-neighbor', hoveredId !== room.id
            && edgeTouches(room.id, hoveredId));
    }
    el.setAttribute('data-visited', visited ? 'true' : 'false');
    el.setAttribute('data-visit-count', String(visitCount));
    el.setAttribute('data-full-name', fullName);
    el.setAttribute('data-pinned', pinned ? 'true' : 'false');
    el.setAttribute('aria-label', fullName);

    const labelEl = ensureNodeLabel(room);
    labelEl.wrap.classList.toggle('is-focal', isFocal);
    labelEl.name.classList.toggle('is-current', isCurrent);
    if (hoveredId) {
        labelEl.wrap.classList.toggle('is-hovered', hoveredId === room.id);
        labelEl.wrap.classList.toggle('is-neighbor', hoveredId !== room.id
            && edgeTouches(room.id, hoveredId));
    }

    const label = compactLabels.get(room.id) || formatCompactRoomName(fullName);
    if (labelEl.name.textContent !== label) {
        labelEl.name.textContent = label;
        labelMetrics.delete(labelEl.name);
    }
    const metaText = stateLabel(isCurrent, visited, visitCount);
    if (labelEl.meta.textContent !== metaText) {
        labelEl.meta.textContent = metaText;
        labelMetrics.delete(labelEl.meta);
    }
}

function renderEdges(content) {
    const svg = ensureSvg(content);
    const seen = new Set();
    const pairSet = new Set(graphData.edges
        .filter(edge => edge && edge.from && edge.to)
        .map(edge => `${edge.from}>${edge.to}`));

    for (const edge of graphData.edges) {
        if (!edge || !edge.from || !edge.to) continue;
        const key = edgeKey(edge.from, edge.direction, edge.to);
        if (seen.has(key)) continue;
        seen.add(key);

        const kind = EDGE_COLORS[edge.kind] ? edge.kind : 'walk';
        let path = edgePaths.get(key);
        if (!path) {
            path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('data-edge-key', key);
            edgePaths.set(key, path);
            svg.appendChild(path);
        }
        path.setAttribute('class', edgeClassName(edge, kind));
        path.setAttribute('marker-end', `url(#map-arrow-${kind})`);

        let label = edgeLabels.get(key);
        if (!label) {
            label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('class', 'map-edge-label');
            label.setAttribute('text-anchor', 'middle');
            edgeLabels.set(key, label);
            svg.appendChild(label);
        }
        const labelText = `${edge.direction || 'onward'}${edge.kind && edge.kind !== 'walk' ? ` · ${edge.kind}` : ''}`;
        if (label.textContent !== labelText) {
            label.textContent = labelText;
            labelMetrics.delete(label);
        }

        // Antiparallel pairs bow to opposite sides of the straight line;
        // self-loops use a small arc above the orb.
        edge._bend = 0;
        if (edge.from !== edge.to && pairSet.has(`${edge.to}>${edge.from}`)) {
            edge._bend = edge.from < edge.to ? 1 : -1;
        }
    }

    for (const [key, path] of [...edgePaths]) {
        if (!seen.has(key)) {
            path.remove();
            edgePaths.delete(key);
        }
    }
    for (const [key, label] of [...edgeLabels]) {
        if (!seen.has(key)) {
            label.remove();
            edgeLabels.delete(key);
        }
    }
}

function ensureSvg(content) {
    let svg = document.getElementById('map-edges');
    if (!svg) {
        svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('id', 'map-edges');
        svg.setAttribute('class', 'map-edges');
        content.prepend(svg);

        const defs = document.createElementNS(SVG_NS, 'defs');
        for (const [kind, color] of Object.entries(EDGE_COLORS)) {
            defs.appendChild(buildArrowMarker(`map-arrow-${kind}`, color));
        }
        svg.appendChild(defs);
    }
    return svg;
}

function edgeClassName(edge, kind) {
    const classes = ['map-edge', `map-edge-${kind}`];
    if (edge.inferred) classes.push('map-edge-inferred');
    if (hoveredId && (edge.from === hoveredId || edge.to === hoveredId)) {
        classes.push('is-neighbor');
    }
    if (routeKeys.includes(edgeKey(edge.from, edge.direction, edge.to))) {
        classes.push('map-edge-route');
    }
    return classes.join(' ');
}

function edgeTouches(roomId, otherId) {
    return graphData.edges.some(edge => (
        (edge.from === roomId && edge.to === otherId)
        || (edge.to === roomId && edge.from === otherId)
    ));
}

function buildArrowMarker(id, color) {
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrow = document.createElementNS(SVG_NS, 'path');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrow.setAttribute('fill', color);
    marker.appendChild(arrow);
    return marker;
}

function updateAllGeometry() {
    if (!layout) return;
    for (const [id, el] of nodeEls) {
        const node = nodeById(id);
        if (!node) continue;
        el.style.left = `${node.x - node.radius}px`;
        el.style.top = `${node.y - node.radius}px`;
        el.style.setProperty('--node-diameter', `${node.radius * 2}px`);
        const label = labelEls.get(id);
        if (label) positionNodeLabel(label, node);
    }

    const bounds = computeBounds([...layout.nodes.values()], 40);
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const svg = document.getElementById('map-edges');
    if (svg) {
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.setAttribute('viewBox', `${bounds.minX} ${bounds.minY} ${width} ${height}`);
        svg.style.left = `${bounds.minX}px`;
        svg.style.top = `${bounds.minY}px`;
        svg.style.width = `${width}px`;
        svg.style.height = `${height}px`;
    }

    for (const edge of graphData.edges) {
        if (!edge || !edge.from || !edge.to) continue;
        const key = edgeKey(edge.from, edge.direction, edge.to);
        const path = edgePaths.get(key);
        const from = nodeById(edge.from);
        const to = nodeById(edge.to);
        if (!path || !from || !to) continue;

        if (edge.from === edge.to) {
            path.setAttribute('d', selfLoopPath(from, from.radius));
            const label = edgeLabels.get(key);
            if (label) {
                label.setAttribute('x', String(from.x));
                label.setAttribute('y', String(from.y - from.radius * 2.2));
            }
            continue;
        }

        const ends = trimmedEdgeEndpoints(from, to, EDGE_GAP);
        const curve = edgeCurve(ends.start, ends.end, { bend: edge._bend || 0 });
        path.setAttribute('d', curve.d);
        const label = edgeLabels.get(key);
        if (label) {
            label.setAttribute('x', String(curve.control.x));
            label.setAttribute('y', String(curve.control.y - 4));
        }
    }

    scheduleLabelCulling();
}

// Screen-space label collision culling. Node labels live in a dedicated
// `.map-label-layer` above the orbs and are placed in one of four slots
// (bottom → top → right → left) chosen against orb rects, incident edges and
// already-placed labels. Intrinsic sizes are cached; camera frames use only
// world-to-screen math (zero per-label DOM reads).
const LABEL_CULL_DEBOUNCE_MS = 100;
const LABEL_PLACEMENTS = ['bottom', 'top', 'right', 'left'];
const LABEL_FONT_PX = 11.5;
const MIN_LABEL_PX = 8;
const ORB_LABEL_PADDING = 4;
const LABEL_GAP_PX = 6;
const EDGE_LABEL_GAP = 24;
let labelCullFrame = null;
let labelCullTimer = null;

function isFocalRoom(id) {
    return id === graphData.current_room_id
        || id === hoveredId
        || id === inspectedId;
}

function isCameraGestureActive() {
    return Boolean(
        panGesture
        || pinchGesture
        || (pointerPress && pointerPress.dragging)
        || layout?.state === 'drag'
    );
}

function scheduleLabelCulling({ immediate = false } = {}) {
    if (labelCullTimer !== null) {
        clearTimeout(labelCullTimer);
        labelCullTimer = null;
    }
    if (immediate && !isCameraGestureActive()) {
        if (labelCullFrame !== null) {
            cancelAnimationFrame(labelCullFrame);
            labelCullFrame = null;
        }
        cullLabels();
        return;
    }
    labelCullTimer = setTimeout(() => {
        labelCullTimer = null;
        if (labelCullFrame !== null) return;
        labelCullFrame = requestAnimationFrame(() => {
            labelCullFrame = null;
            if (isCameraGestureActive()) {
                scheduleLabelCulling();
                return;
            }
            cullLabels();
        });
    }, LABEL_CULL_DEBOUNCE_MS);
}

function labelsOverlap(a, b, padding = 2) {
    return !(a.right + padding <= b.left
        || b.right + padding <= a.left
        || a.bottom + padding <= b.top
        || b.bottom + padding <= a.top);
}

function overlapArea(a, b) {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return width > 0 && height > 0 ? width * height : 0;
}

function labelPriority(id, node) {
    if (id === graphData.current_room_id) return 0;
    if (id === hoveredId) return 1;
    if (id === inspectedId) return 2;
    if (hoveredId && edgeTouches(id, hoveredId)) return 3;
    if ((node?.degree || 0) >= 3) return 4;
    return 5;
}

function labelMetricsFor(el, isSvg = false) {
    let metrics = labelMetrics.get(el);
    if (metrics) return metrics;
    if (isSvg && typeof el.getBBox === 'function') {
        const box = el.getBBox();
        metrics = { width: box.width || 8, height: box.height || 10 };
        if (box.width > 0 && box.height > 0) labelMetrics.set(el, metrics);
        return metrics;
    }
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    metrics = { width: width || 8, height: height || 10 };
    if (width > 0 && height > 0) labelMetrics.set(el, metrics);
    return metrics;
}

function positionNodeLabel(entry, node) {
    const placement = entry.wrap.dataset.placement || 'bottom';
    const gap = LABEL_GAP_PX / (camera.zoom || 1);
    let left = node.x;
    let top = node.y;
    if (placement === 'bottom') {
        top = node.y + node.radius + gap;
    } else if (placement === 'top') {
        top = node.y - node.radius - gap;
    } else if (placement === 'right') {
        left = node.x + node.radius + gap;
    } else if (placement === 'left') {
        left = node.x - node.radius - gap;
    }
    entry.wrap.style.left = `${left}px`;
    entry.wrap.style.top = `${top}px`;
}

function applyLabelPlacement(entry, node, placement) {
    entry.wrap.dataset.placement = placement;
    for (const candidate of LABEL_PLACEMENTS) {
        entry.wrap.classList.toggle(`label-pos-${candidate}`, candidate === placement);
    }
    positionNodeLabel(entry, node);
}

function labelRectForPlacement(node, placement, width, height, zoom) {
    const centre = worldToScreen({ x: node.x, y: node.y }, camera);
    const radius = node.radius * zoom;
    const w = width * zoom;
    const h = height * zoom;
    let left;
    let top;
    if (placement === 'bottom') {
        left = centre.x - w / 2;
        top = centre.y + radius + LABEL_GAP_PX;
    } else if (placement === 'top') {
        left = centre.x - w / 2;
        top = centre.y - radius - LABEL_GAP_PX - h;
    } else if (placement === 'right') {
        left = centre.x + radius + LABEL_GAP_PX;
        top = centre.y - h / 2;
    } else {
        left = centre.x - radius - LABEL_GAP_PX - w;
        top = centre.y - h / 2;
    }
    return { left, top, right: left + w, bottom: top + h, width: w, height: h };
}

function pointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function segmentsIntersect(a, b, c, d) {
    const cross = (px, py, qx, qy) => px * qy - py * qx;
    const d1 = cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
    const d2 = cross(b.x - a.x, b.y - a.y, d.x - a.x, d.y - a.y);
    const d3 = cross(d.x - c.x, d.y - c.y, a.x - c.x, a.y - c.y);
    const d4 = cross(d.x - c.x, d.y - c.y, b.x - c.x, b.y - c.y);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
        && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function segmentIntersectsRect(segment, rect) {
    if (pointInRect(segment.x1, segment.y1, rect)
        || pointInRect(segment.x2, segment.y2, rect)) return true;
    if (Math.max(segment.x1, segment.x2) < rect.left
        || Math.min(segment.x1, segment.x2) > rect.right
        || Math.max(segment.y1, segment.y2) < rect.top
        || Math.min(segment.y1, segment.y2) > rect.bottom) return false;
    const a = { x: segment.x1, y: segment.y1 };
    const b = { x: segment.x2, y: segment.y2 };
    const corners = [
        { x: rect.left, y: rect.top },
        { x: rect.right, y: rect.top },
        { x: rect.right, y: rect.bottom },
        { x: rect.left, y: rect.bottom },
    ];
    for (let i = 0; i < 4; i += 1) {
        if (segmentsIntersect(a, b, corners[i], corners[(i + 1) % 4])) return true;
    }
    return false;
}

function incidentEdgeSegments(id, zoom) {
    const node = layout?.getNode(id);
    if (!node) return [];
    const centre = worldToScreen({ x: node.x, y: node.y }, camera);
    const radius = node.radius * zoom;
    const segments = [];
    for (const edge of graphData.edges) {
        if (!edge || edge.from === edge.to) continue;
        if (edge.from !== id && edge.to !== id) continue;
        const otherId = edge.from === id ? edge.to : edge.from;
        const other = layout.getNode(otherId);
        if (!other) continue;
        const target = worldToScreen({ x: other.x, y: other.y }, camera);
        const dx = target.x - centre.x;
        const dy = target.y - centre.y;
        const length = Math.hypot(dx, dy);
        if (length < 1e-6) continue;
        segments.push({
            x1: centre.x + (dx / length) * radius,
            y1: centre.y + (dy / length) * radius,
            x2: target.x,
            y2: target.y,
        });
    }
    return segments;
}

function edgeLabelRect(labelEl, metrics) {
    const zoom = camera.zoom;
    const width = metrics.width * zoom;
    const height = metrics.height * zoom;
    const x = Number(labelEl.getAttribute('x')) || 0;
    const y = Number(labelEl.getAttribute('y')) || 0;
    const baseline = worldToScreen({ x, y }, camera);
    return {
        left: baseline.x - width / 2,
        right: baseline.x + width / 2,
        top: baseline.y - height,
        bottom: baseline.y,
        width,
        height,
    };
}

function cullLabels() {
    if (!layout) return;
    const canvas = document.getElementById('map-canvas');
    if (!canvas || canvas.clientWidth === 0) return;

    const zoom = camera.zoom;
    const kept = [];
    // Orb rects are the first-class obstacles: no label may cover any orb.
    for (const node of layout.nodes.values()) {
        const centre = worldToScreen({ x: node.x, y: node.y }, camera);
        const radius = node.radius * zoom + ORB_LABEL_PADDING;
        kept.push({
            left: centre.x - radius,
            top: centre.y - radius,
            right: centre.x + radius,
            bottom: centre.y + radius,
            width: radius * 2,
            height: radius * 2,
        });
    }

    const nodeEntries = [...labelEls.entries()].map(([id, entry]) => ({
        id,
        entry,
        node: layout.getNode(id),
        priority: labelPriority(id, layout.getNode(id)),
    })).filter(entry => entry.node);

    nodeEntries.sort((a, b) => (
        a.priority - b.priority
        || (b.node.degree || 0) - (a.node.degree || 0)
        || a.id.localeCompare(b.id)
    ));

    for (const { id, entry, node } of nodeEntries) {
        const focal = isFocalRoom(id);
        const semanticCulled = !focal
            && (node.degree || 0) < 3
            && LABEL_FONT_PX * zoom < MIN_LABEL_PX;
        if (semanticCulled) {
            entry.name.classList.add('is-label-culled');
            entry.meta.classList.add('is-label-culled');
            continue;
        }

        const nameMetrics = labelMetricsFor(entry.name, false);
        const metaMetrics = focal ? labelMetricsFor(entry.meta, false) : null;
        let width = Math.max(nameMetrics.width, metaMetrics?.width || 0);
        let height = nameMetrics.height + (metaMetrics ? metaMetrics.height + 2 : 0);
        const segments = incidentEdgeSegments(id, zoom);
        entry.name.style.maxWidth = '';
        entry.wrap.style.maxWidth = '';

        const pick = (candidateWidth, candidateHeight, { ignoreEdges = false } = {}) => {
            let best = null;
            for (const placement of LABEL_PLACEMENTS) {
                const rect = labelRectForPlacement(node, placement, candidateWidth, candidateHeight, zoom);
                const blockedByKept = kept.some(other => labelsOverlap(other, rect));
                const blockedByEdge = !ignoreEdges
                    && segments.some(segment => segmentIntersectsRect(segment, rect));
                const blocked = blockedByKept || blockedByEdge;
                const area = kept.reduce((sum, other) => sum + overlapArea(other, rect), 0);
                if (!blocked) return { placement, rect };
                if (!best || area < best.area) best = { placement, rect, area };
            }
            return { best };
        };

        let result = pick(width, height);
        let chosen = result.placement || null;
        let bestFallback = result.best || null;
        let nameCulled = false;

        if (!chosen && focal) {
            // Focal labels may cross an incident edge when an orb-free slot
            // exists; keeping the room title visible wins over edge purity.
            const noEdge = pick(width, height, { ignoreEdges: true });
            if (noEdge.placement) chosen = noEdge.placement;
            else if (noEdge.best && !bestFallback) bestFallback = noEdge.best;
        }

        if (!chosen && focal) {
            // Try a narrower pill before sacrificing the title.
            const compactWidth = Math.min(width, 140 / zoom);
            if (compactWidth < width - 0.5) {
                const compact = pick(compactWidth, height);
                if (compact.placement) {
                    width = compactWidth;
                    chosen = compact.placement;
                    entry.name.style.maxWidth = `${compactWidth}px`;
                    entry.wrap.style.maxWidth = `${compactWidth}px`;
                }
            }
        }

        if (!chosen && focal && metaMetrics) {
            // Keep the small ◉ CURRENT / status caption even when the full
            // title cannot fit anywhere without covering an orb.
            entry.name.classList.add('is-label-culled');
            nameCulled = true;
            width = metaMetrics.width;
            height = metaMetrics.height;
            const metaPick = pick(width, height);
            chosen = metaPick.placement || metaPick.best?.placement || 'bottom';
            bestFallback = metaPick.best || null;
        }

        if (!chosen) {
            if (!focal) {
                entry.name.classList.add('is-label-culled');
                entry.meta.classList.add('is-label-culled');
                continue;
            }
            chosen = bestFallback?.placement || 'bottom';
        }

        applyLabelPlacement(entry, node, chosen);
        entry.name.classList.toggle('is-label-culled', nameCulled);
        entry.meta.classList.toggle('is-label-culled', !focal);
        kept.push(labelRectForPlacement(node, chosen, width, height, zoom));
    }

    // Edge labels last: short edges and collisions are culled.
    const edgeByKey = new Map();
    for (const edge of graphData.edges) {
        if (!edge || !edge.from || !edge.to) continue;
        edgeByKey.set(edgeKey(edge.from, edge.direction, edge.to), edge);
    }
    for (const [key, labelEl] of edgeLabels) {
        const edge = edgeByKey.get(key);
        const from = edge ? layout.getNode(edge.from) : null;
        const to = edge ? layout.getNode(edge.to) : null;
        const metrics = labelMetricsFor(labelEl, true);
        let cull = !from || !to || edge.from === edge.to;
        if (!cull) {
            const distance = Math.hypot(to.x - from.x, to.y - from.y) * zoom;
            cull = distance < metrics.width * zoom + EDGE_LABEL_GAP;
        }
        if (!cull) {
            const rect = edgeLabelRect(labelEl, metrics);
            cull = kept.some(other => labelsOverlap(other, rect));
            if (!cull) kept.push(rect);
        }
        labelEl.classList.toggle('is-label-culled', cull);
    }

    canvas.dataset.cullRuns = String((Number(canvas.dataset.cullRuns) || 0) + 1);
}

if (typeof document !== 'undefined' && document.fonts?.ready) {
    document.fonts.ready.then(() => {
        labelMetrics = new WeakMap();
        scheduleLabelCulling();
    });
}

function refreshNodeStates() {
    for (const room of graphData.rooms) {
        const el = nodeEls.get(room.id);
        if (el) updateRoomNode(el, room);
    }
}

// ─── camera ───────────────────────────────────────────────────────────────

function applyCamera() {
    const canvas = document.getElementById('map-canvas');
    const content = document.getElementById('map-canvas-content');
    if (!canvas || !content) return;
    content.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
    canvas.setAttribute('data-zoom', camera.zoom.toFixed(3));
    canvas.classList.toggle('map-zoom-far', camera.zoom < FAR_ZOOM);
    scheduleLabelCulling();
    if (inspectedId) positionInspectorImmediate();
}

function fitCamera() {
    if (!layout) return;
    const canvas = document.getElementById('map-canvas');
    if (!canvas) return;
    const size = measureCanvas(canvas);
    const bounds = computeBounds([...layout.nodes.values()], 46);
    camera = { ...computeFitViewport(bounds, size, { padding: 28 }), initialized: true };
    cameraMode = 'fit';
    fittedForSize = { width: size.width, height: size.height, usedFallback: size.usedFallback };
    applyCamera();
}

function centerOnRoom(id) {
    const node = nodeById(id);
    const canvas = document.getElementById('map-canvas');
    if (!node || !canvas) return false;
    const size = measureCanvas(canvas);
    const zoom = clamp(camera.zoom || 1, MIN_ZOOM, MAX_ZOOM);
    camera = {
        x: size.width / 2 - node.x * zoom,
        y: size.height / 2 - node.y * zoom,
        zoom,
        initialized: true
    };
    cameraMode = 'center';
    applyCamera();
    return true;
}

function ensureCurrentInView() {
    const id = graphData.current_room_id;
    if (!id) return;
    const el = nodeEls.get(id);
    const canvas = document.getElementById('map-canvas');
    if (!el || !canvas) return;
    const c = canvas.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const margin = 12;
    if (r.left < c.left + margin || r.right > c.right - margin
        || r.top < c.top + margin || r.bottom > c.bottom - margin) {
        centerOnRoom(id);
    }
}

function zoomBy(factor, point) {
    const canvas = document.getElementById('map-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const local = point || { x: rect.width / 2, y: rect.height / 2 };
    camera = { ...zoomAtPoint(camera, factor, local, { min: MIN_ZOOM, max: MAX_ZOOM }), initialized: true };
    cameraMode = 'manual';
    applyCamera();
}

// ─── interactions ─────────────────────────────────────────────────────────

function wireInteractions(panel, canvas) {
    if (!wired) {
        // The sidebar is a glass panel with backdrop-filter, which creates a
        // containing block for position:fixed descendants. Portal the floating
        // overlays to <body> so they anchor to the viewport, not the sidebar.
        portalOverlay('map-hover-card');
        portalOverlay('map-inspector');

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerCancel);
        canvas.addEventListener('pointerover', onPointerOver);
        canvas.addEventListener('pointerout', onPointerOut);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('dblclick', onDoubleClick);
        canvas.addEventListener('keydown', onKeyDown);
        panel.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                closeInspector();
                clearHover();
            }
        });

        wireToolbar();
        wireInspector(panel);
        wireResize(canvas);

        const hoverCard = document.getElementById('map-hover-card');
        if (hoverCard) {
            hoverCard.addEventListener('pointerenter', () => clearTimeout(hoverHideTimer));
            hoverCard.addEventListener('pointerleave', scheduleHoverHide);
        }
        wired = true;
    }
}

function portalOverlay(id) {
    const el = document.getElementById(id);
    if (el && el.parentElement !== document.body) document.body.appendChild(el);
}

function wireToolbar() {
    document.getElementById('map-zoom-in')?.addEventListener('click', () => zoomBy(1.25));
    document.getElementById('map-zoom-out')?.addEventListener('click', () => zoomBy(0.8));
    document.getElementById('map-fit')?.addEventListener('click', () => fitCamera());
    document.getElementById('map-center')?.addEventListener('click', () => {
        if (graphData.current_room_id) centerOnRoom(graphData.current_room_id);
        else fitCamera();
    });
}

function wireResize(canvas) {
    const handle = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (!layout || !cachedMap) return;
            const previous = { ...lastCanvasSize };
            const size = measureCanvas(canvas);
            const changed = Math.abs(size.width - previous.width) > 0.5
                || Math.abs(size.height - previous.height) > 0.5;
            // ResizeObserver fires once when observation starts; that is not a
            // real resize and must not overwrite the first-paint FIT.
            if (!changed) return;

            layout.setViewport(size.width, size.height);
            if (cameraMode === 'manual') {
                // Preserve the player's pan/zoom.
                applyCamera();
            } else if (cameraMode === 'center'
                && graphData.current_room_id
                && nodeById(graphData.current_room_id)) {
                centerOnRoom(graphData.current_room_id);
            } else {
                fitCamera();
            }
            if (inspectedId) positionInspectorImmediate();
        }, 150);
    };

    window.addEventListener('resize', handle);
    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(handle);
        resizeObserver.observe(canvas);
    }
}

function isFinePointer() {
    if (typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches
        && window.innerWidth >= 768;
}

function prefersReducedMotion() {
    return typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function localPoint(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

// Screen-space nearest-node hit testing. The visual orb and its DOM ::before
// hit target scale with the camera, so at low zoom a finger/mouse can land
// outside the scaled orb. A fixed 22 px screen radius keeps taps reliable at
// any zoom without shrinking the visible graph.
function nearestNodeAtClientPoint(canvas, clientX, clientY, maxDistance = 22) {
    if (!layout) return null;
    const canvasRect = canvas.getBoundingClientRect();
    let best = null;
    for (const [id, el] of nodeEls) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        // Ignore nodes scrolled/clipped outside the viewport.
        if (cx < canvasRect.left || cx > canvasRect.right
            || cy < canvasRect.top || cy > canvasRect.bottom) continue;
        const distance = Math.hypot(clientX - cx, clientY - cy);
        if (distance <= maxDistance && (!best || distance < best.distance)) {
            best = { id, distance };
        }
    }
    return best ? best.id : null;
}

function onPointerDown(event) {
    const canvas = event.currentTarget;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size === 2) {
        cancelPress();
        startPinch(canvas);
        clearHover();
        return;
    }

    const roomEl = event.target.closest?.('.map-room');
    const coarsePointer = event.pointerType === 'touch'
        || event.pointerType === 'pen'
        || (typeof window.matchMedia === 'function'
            && window.matchMedia('(pointer: coarse)').matches);
    const nearestId = (!roomEl && coarsePointer)
        ? nearestNodeAtClientPoint(canvas, event.clientX, event.clientY)
        : null;
    if (roomEl || nearestId) {
        pointerPress = {
            id: roomEl ? roomEl.getAttribute('data-room-id') : nearestId,
            startX: event.clientX,
            startY: event.clientY,
            pointerId: event.pointerId,
            dragging: false
        };
        clearHover();
        safeCapture(canvas, event.pointerId);
        return;
    }

    panGesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        camera: { ...camera }
    };
    canvas.classList.add('is-panning');
    clearHover();
    safeCapture(canvas, event.pointerId);
}

function onPointerMove(event) {
    const canvas = event.currentTarget;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pinchGesture && activePointers.size >= 2) {
        updatePinch(canvas);
        return;
    }

    if (pointerPress && pointerPress.pointerId === event.pointerId) {
        const dx = event.clientX - pointerPress.startX;
        const dy = event.clientY - pointerPress.startY;
        const distance = Math.hypot(dx, dy);
        if (!pointerPress.dragging && distance >= DRAG_THRESHOLD) {
            pointerPress.dragging = true;
            layout?.startDrag(pointerPress.id);
            clearHover();
        }
        if (pointerPress.dragging) {
            const world = screenToWorld(localPoint(event, canvas), camera);
            layout?.dragTo(world.x, world.y);
            updateAllGeometry();
        }
        return;
    }

    if (panGesture && panGesture.pointerId === event.pointerId) {
        camera = {
            ...camera,
            x: panGesture.camera.x + (event.clientX - panGesture.startX),
            y: panGesture.camera.y + (event.clientY - panGesture.startY),
            initialized: true
        };
        cameraMode = 'manual';
        applyCamera();
    }
}

function onPointerUp(event) {
    const canvas = event.currentTarget;
    activePointers.delete(event.pointerId);

    if (pinchGesture) {
        if (activePointers.size < 2) pinchGesture = null;
        return;
    }

    if (pointerPress && pointerPress.pointerId === event.pointerId) {
        const press = pointerPress;
        pointerPress = null;
        if (press.dragging) {
            layout?.dragEnd();
            layout?.settle();
            renderMapPanel(cachedMap || graphData);
        } else if (performance.now() >= suppressInspectUntil) {
            openInspector(press.id);
        }
        return;
    }

    if (panGesture && panGesture.pointerId === event.pointerId) {
        panGesture = null;
        canvas.classList.remove('is-panning');
    }
}

function onPointerCancel(event) {
    const canvas = event.currentTarget;
    activePointers.delete(event.pointerId);

    if (pointerPress && pointerPress.pointerId === event.pointerId) {
        const wasDragging = pointerPress.dragging;
        const id = pointerPress.id;
        pointerPress = null;
        if (wasDragging) {
            layout?.dragEnd({ cancel: true });
            updateAllGeometry();
            refreshNodeStates();
        } else {
            const node = nodeById(id);
            if (node) {
                node.x = node.fx ?? node.x;
            }
        }
        return;
    }

    pinchGesture = null;
    if (panGesture && panGesture.pointerId === event.pointerId) {
        panGesture = null;
        canvas.classList.remove('is-panning');
    }
}

function safeCapture(canvas, pointerId) {
    try {
        canvas.setPointerCapture(pointerId);
    } catch {
        // Pointer already released — harmless.
    }
}

function cancelPress() {
    if (pointerPress?.dragging) {
        layout?.dragEnd({ cancel: true });
    }
    pointerPress = null;
}

function startPinch(canvas) {
    const points = [...activePointers.values()];
    if (points.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const midpoint = {
        x: (points[0].x + points[1].x) / 2 - rect.left,
        y: (points[0].y + points[1].y) / 2 - rect.top
    };
    pinchGesture = {
        distance: Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)),
        midpoint,
        camera: { ...camera }
    };
}

function updatePinch(canvas) {
    const points = [...activePointers.values()];
    if (points.length < 2 || !pinchGesture) return;
    const rect = canvas.getBoundingClientRect();
    const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
    const midpoint = {
        x: (points[0].x + points[1].x) / 2 - rect.left,
        y: (points[0].y + points[1].y) / 2 - rect.top
    };
    const ratio = distance / pinchGesture.distance;
    const base = pinchGesture.camera;
    const zoomed = zoomAtPoint(base, ratio, pinchGesture.midpoint, { min: MIN_ZOOM, max: MAX_ZOOM });
    camera = {
        ...zoomed,
        x: zoomed.x + (midpoint.x - pinchGesture.midpoint.x),
        y: zoomed.y + (midpoint.y - pinchGesture.midpoint.y),
        initialized: true
    };
    cameraMode = 'manual';
    applyCamera();
}

function onWheel(event) {
    event.preventDefault();
    const canvas = event.currentTarget;
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomBy(factor, localPoint(event, canvas));
}

function onDoubleClick(event) {
    if (!isFinePointer()) return;
    // Pointer capture redirects the synthesized click/dblclick to the canvas,
    // so fall back to the orb under the cursor when event.target is the canvas.
    let roomEl = event.target.closest?.('.map-room');
    if (!roomEl) {
        roomEl = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.map-room');
    }
    if (!roomEl) return;
    const id = roomEl.getAttribute('data-room-id');
    layout?.unpin(id);
    layout?.settle();
    renderMapPanel(cachedMap || graphData);
    suppressInspectUntil = performance.now() + 350;
}

function onKeyDown(event) {
    const roomEl = event.target.closest?.('.map-room');
    if (event.key === 'Escape') {
        closeInspector();
        clearHover();
        return;
    }
    if (!roomEl) return;
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openInspector(roomEl.getAttribute('data-room-id'));
    }
}

// ─── hover dwell + neighbourhood highlight ────────────────────────────────

function onPointerOver(event) {
    if (!isFinePointer()) return;
    const roomEl = event.target.closest?.('.map-room');
    if (!roomEl) return;
    const id = roomEl.getAttribute('data-room-id');
    const related = event.relatedTarget;
    if (related && related.closest?.('.map-room') === roomEl) return;
    if (layout?.state === 'drag' || layout?.state === 'coasting') return;

    clearTimeout(hoverHideTimer);
    clearTimeout(hoverDwellTimer);
    if (hoveredId === id) return;

    hoverDwellTimer = setTimeout(() => {
        if (!layout || !roomById(id)) return;
        if (!layout.startHover(id)) return;
        hoveredId = id;
        applyHoverNeighbourhood(id);
        showHoverCard(id);
    }, HOVER_DWELL_MS);
}

function onPointerOut(event) {
    const roomEl = event.target.closest?.('.map-room');
    if (!roomEl) return;
    const related = event.relatedTarget;
    if (related && related.closest?.('.map-room') === roomEl) return;
    clearTimeout(hoverDwellTimer);
    if (hoveredId) scheduleHoverHide();
}

function scheduleHoverHide() {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = setTimeout(() => {
        const card = document.getElementById('map-hover-card');
        if (card && card.matches(':hover')) return;
        clearHover();
    }, HOVER_GRACE_MS);
}

function applyHoverNeighbourhood(id) {
    const canvas = document.getElementById('map-canvas');
    if (!canvas) return;
    canvas.classList.add('has-hover');
    const neighbours = new Set([id]);
    for (const edge of graphData.edges) {
        if (edge.from === id) neighbours.add(edge.to);
        if (edge.to === id) neighbours.add(edge.from);
    }

    for (const [roomId, el] of nodeEls) {
        el.classList.toggle('is-hovered', roomId === id);
        el.classList.toggle('is-neighbor', roomId !== id && neighbours.has(roomId));
    }
    for (const [roomId, entry] of labelEls) {
        entry.wrap.classList.toggle('is-hovered', roomId === id);
        entry.wrap.classList.toggle('is-neighbor', roomId !== id && neighbours.has(roomId));
    }
    for (const edge of graphData.edges) {
        const key = edgeKey(edge.from, edge.direction, edge.to);
        const path = edgePaths.get(key);
        const label = edgeLabels.get(key);
        const adjacent = edge.from === id || edge.to === id;
        path?.classList.toggle('is-neighbor', adjacent);
        label?.classList.toggle('is-neighbor', adjacent);
    }
    scheduleLabelCulling({ immediate: true });
}

function clearHover() {
    clearTimeout(hoverDwellTimer);
    clearTimeout(hoverHideTimer);
    hoveredId = null;
    layout?.endHover();
    const canvas = document.getElementById('map-canvas');
    canvas?.classList.remove('has-hover');
    for (const el of nodeEls.values()) {
        el.classList.remove('is-hovered', 'is-neighbor');
    }
    for (const entry of labelEls.values()) {
        entry.wrap.classList.remove('is-hovered', 'is-neighbor');
    }
    for (const path of edgePaths.values()) path.classList.remove('is-neighbor');
    for (const label of edgeLabels.values()) label.classList.remove('is-neighbor');
    const card = document.getElementById('map-hover-card');
    if (card) {
        card.hidden = true;
        card.innerHTML = '';
    }
    scheduleLabelCulling({ immediate: true });
}

function showHoverCard(id) {
    const card = document.getElementById('map-hover-card');
    const room = roomById(id);
    const el = nodeEls.get(id);
    const canvas = document.getElementById('map-canvas');
    if (!card || !room || !el || !canvas) return;

    const visited = (room.visit_count || 0) > 0 || room.last_visit_turn != null;
    const isCurrent = id === graphData.current_room_id;
    const region = regionLabel(id);
    const outgoing = graphData.edges.filter(edge => edge.from === id).length;
    const incoming = graphData.edges.filter(edge => edge.to === id).length;

    card.innerHTML = '';
    const title = document.createElement('h4');
    title.textContent = room.name || id;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'map-meta-row';
    const status = document.createElement('span');
    status.className = 'map-state-pill';
    status.textContent = stateLabel(isCurrent, visited, room.visit_count || 0);
    meta.appendChild(status);
    if (region) {
        const badge = document.createElement('span');
        badge.className = 'map-badge';
        badge.textContent = region;
        meta.appendChild(badge);
    }
    const exits = document.createElement('span');
    exits.textContent = `↗ ${outgoing} · ↙ ${incoming}`;
    meta.appendChild(exits);
    if (room.last_visit_turn != null) {
        const turn = document.createElement('span');
        turn.textContent = `last turn ${room.last_visit_turn}`;
        meta.appendChild(turn);
    }
    if (room.first_turn != null) {
        const first = document.createElement('span');
        first.textContent = `first turn ${room.first_turn}`;
        meta.appendChild(first);
    }
    card.appendChild(meta);

    card.hidden = false;
    const size = { width: card.offsetWidth || 240, height: card.offsetHeight || 120 };
    const anchorRect = el.getBoundingClientRect();
    const obstacles = [...nodeEls.entries()]
        .filter(([roomId]) => roomId !== id)
        .map(([, nodeEl]) => nodeEl.getBoundingClientRect());

    const placement = chooseBestPopoverPosition({
        anchor: {
            left: anchorRect.left,
            top: anchorRect.top,
            width: anchorRect.width,
            height: anchorRect.height
        },
        size,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        obstacles,
        gap: 12,
        margin: 8
    });
    card.style.left = `${placement.left}px`;
    card.style.top = `${placement.top}px`;
    card.setAttribute('data-placement', placement.placement);
}

function stateLabel(isCurrent, visited, visitCount) {
    if (isCurrent) return '◉ CURRENT';
    if (visited) return `VISITED ×${visitCount || 0}`;
    return 'UNVISITED';
}

function regionLabel(id) {
    const index = graphData.regions.findIndex(region => (region.room_ids || []).includes(id));
    return index >= 0 ? `Region ${index + 1}` : '';
}

// ─── inspector ────────────────────────────────────────────────────────────

function wireInspector(panel) {
    const close = document.getElementById('map-inspector-close');
    close?.addEventListener('click', closeInspector);

    const inspectorEl = document.getElementById('map-inspector');
    inspectorEl?.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeInspector();
    });

    const header = document.getElementById('map-inspector-drag');
    if (header) {
        header.addEventListener('pointerdown', event => {
            if (event.target.closest('#map-inspector-close')) return;
            const inspector = document.getElementById('map-inspector');
            if (!inspector || inspector.hidden) return;
            const rect = inspector.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            inspectorManual = { left: rect.left, top: rect.top };
            const move = moveEvent => {
                inspectorManual = {
                    left: clamp(moveEvent.clientX - offsetX, 8, window.innerWidth - rect.width - 8),
                    top: clamp(moveEvent.clientY - offsetY, 8, window.innerHeight - rect.height - 8)
                };
                positionInspectorImmediate();
            };
            const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            event.preventDefault();
        });
    }

    const body = document.getElementById('map-inspector-body');
    body?.addEventListener('click', event => {        const chip = event.target.closest('.map-exit-chip');
        if (chip) {
            const target = chip.getAttribute('data-target-id');
            if (target) {
                centerOnRoom(target);
                openInspector(target);
            }
            return;
        }
        const action = event.target.closest('[data-action]');
        if (!action) return;
        const kind = action.getAttribute('data-action');
        if (kind === 'unpin' && inspectedId) {
            layout?.unpin(inspectedId);
            layout?.settle();
            renderMapPanel(cachedMap || graphData);
        } else if (kind === 'route' && inspectedId) {
            routeTo(inspectedId);
        }
    });
}

function isMobileLayout() {
    return window.innerWidth < 768;
}

// The mobile inspector is a bottom sheet that can cover the lower half of the
// canvas. After opening it, pan the focused node up so it stays visible above
// the sheet (radius + 16px clearance).
function panInspectedNodeAboveSheet() {
    if (!isMobileLayout() || !inspectedId) return;
    const node = nodeById(inspectedId);
    const canvas = document.getElementById('map-canvas');
    const inspector = document.getElementById('map-inspector');
    if (!node || !canvas || !inspector || inspector.hidden) return;

    const canvasRect = canvas.getBoundingClientRect();
    const sheetRect = inspector.getBoundingClientRect();
    const screen = worldToScreen({ x: node.x, y: node.y }, camera);
    const centreY = canvasRect.top + screen.y;
    const radius = node.radius * camera.zoom;
    const threshold = sheetRect.top - radius - 16;
    if (centreY <= threshold) return;

    camera = {
        ...camera,
        y: camera.y - (centreY - threshold),
        initialized: true
    };
    cameraMode = 'manual';
    applyCamera();
    positionInspectorImmediate();
}

function openInspector(id) {
    const room = roomById(id);
    if (!room) return;
    const inspector = document.getElementById('map-inspector');
    if (!inspector) return;

    // Switching focus cancels any in-flight route and clears the prior
    // target's route edges + aria-live status text.
    if (inspectedId !== id) {
        if (routeController) {
            routeController.abort();
            routeController = null;
        }
        clearRoute();
    }

    inspectedId = id;
    inspector.hidden = false;
    inspectorManual = null;
    inspector.setAttribute('data-room-id', id);
    clearHover();

    document.getElementById('map-inspector-title').textContent = room.name || id;
    renderInspectorBody(room);
    refreshNodeStates();
    positionInspectorImmediate();
    panInspectedNodeAboveSheet();
    startInspectorTracking();
}

function closeInspector() {
    const inspector = document.getElementById('map-inspector');
    if (inspector) {
        inspector.hidden = true;
        inspector.removeAttribute('data-room-id');
    }
    if (inspectorFrame) {
        cancelAnimationFrame(inspectorFrame);
        inspectorFrame = null;
    }
    inspectedId = null;
    inspectorManual = null;
    if (routeController) {
        routeController.abort();
        routeController = null;
    }
    const status = document.getElementById('map-inspector-route-status');
    if (status) status.textContent = '';
    refreshNodeStates();
}

function reconcileInspector() {
    if (!inspectedId) return;
    const room = roomById(inspectedId);
    if (!room) {
        closeInspector();
        return;
    }
    const inspector = document.getElementById('map-inspector');
    if (!inspector || inspector.hidden) return;
    document.getElementById('map-inspector-title').textContent = room.name || inspectedId;
    renderInspectorBody(room);
}

function renderInspectorBody(room) {
    const body = document.getElementById('map-inspector-body');
    if (!body) return;

    const visited = (room.visit_count || 0) > 0 || room.last_visit_turn != null;
    const isCurrent = room.id === graphData.current_room_id;
    const region = regionLabel(room.id);
    const pinned = layout ? layout.homeAnchors.has(room.id) : false;

    body.innerHTML = '';

    const meta = document.createElement('div');
    meta.className = 'map-meta-strip';
    const status = document.createElement('span');
    status.className = `map-state-pill${isCurrent ? ' current' : ''}`;
    status.textContent = stateLabel(isCurrent, visited, room.visit_count || 0);
    meta.appendChild(status);
    if (region) {
        const badge = document.createElement('span');
        badge.className = 'map-badge';
        badge.textContent = region;
        meta.appendChild(badge);
    }
    if (room.first_turn != null) {
        const first = document.createElement('span');
        first.textContent = `First turn ${room.first_turn}`;
        meta.appendChild(first);
    }
    if (room.last_visit_turn != null) {
        const last = document.createElement('span');
        last.textContent = `Last visit ${room.last_visit_turn}`;
        meta.appendChild(last);
    }
    body.appendChild(meta);

    const outgoing = graphData.edges.filter(edge => edge.from === room.id);
    const incoming = graphData.edges.filter(edge => edge.to === room.id && edge.from !== room.id);

    if (outgoing.length > 0) {
        body.appendChild(buildExitSection('EXITS', outgoing, edge => ({
            direction: edge.direction || 'onward',
            targetId: edge.to,
            name: roomById(edge.to)?.name || edge.to,
            kind: edge.kind,
            prefix: ''
        })));
    }
    if (incoming.length > 0) {
        body.appendChild(buildExitSection('ENTRANCES', incoming, edge => ({
            direction: edge.direction || 'onward',
            targetId: edge.from,
            name: roomById(edge.from)?.name || edge.from,
            kind: edge.kind,
            prefix: '← '
        })));
    }

    const actions = document.createElement('div');
    actions.className = 'map-inspector-actions';

    if (pinned) {
        const unpin = document.createElement('button');
        unpin.type = 'button';
        unpin.className = 'map-action-btn';
        unpin.setAttribute('data-action', 'unpin');
        unpin.textContent = 'UNPIN';
        actions.appendChild(unpin);
    }

    if (!isCurrent) {
        const route = document.createElement('button');
        route.type = 'button';
        route.className = 'map-action-btn';
        route.setAttribute('data-action', 'route');
        route.textContent = 'ROUTE HERE';
        actions.appendChild(route);
    }

    if (actions.children.length > 0) body.appendChild(actions);
}

function buildExitSection(title, edges, describe) {
    const section = document.createElement('div');
    section.className = 'map-inspector-section';
    const heading = document.createElement('h5');
    heading.textContent = title;
    section.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'map-exit-list';
    for (const edge of edges) {
        const info = describe(edge);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'map-exit-chip';
        chip.setAttribute('data-target-id', info.targetId);

        const dir = document.createElement('span');
        dir.className = 'map-exit-dir';
        dir.textContent = `${info.prefix}${info.direction}`;
        const name = document.createElement('span');
        name.textContent = info.name;
        const kind = document.createElement('span');
        kind.className = 'map-exit-kind';
        kind.textContent = info.kind || '';

        chip.appendChild(dir);
        chip.appendChild(name);
        chip.appendChild(kind);
        list.appendChild(chip);
    }
    section.appendChild(list);
    return section;
}

function positionInspectorImmediate() {
    const inspector = document.getElementById('map-inspector');
    if (!inspector || inspector.hidden || !inspectedId) return;
    if (window.innerWidth < 768) {
        inspector.style.left = '';
        inspector.style.top = '';
        return;
    }
    if (inspectorManual) {
        inspector.style.left = `${inspectorManual.left}px`;
        inspector.style.top = `${inspectorManual.top}px`;
        return;
    }
    const target = inspectorTarget();
    if (!target) return;
    inspector.style.left = `${target.left}px`;
    inspector.style.top = `${target.top}px`;
}

function inspectorTarget() {
    const el = nodeEls.get(inspectedId);
    if (!el) return null;
    const inspector = document.getElementById('map-inspector');
    const anchor = el.getBoundingClientRect();
    const size = {
        width: inspector?.offsetWidth || 280,
        height: inspector?.offsetHeight || 220
    };
    const obstacles = [...nodeEls.entries()]
        .filter(([id]) => id !== inspectedId)
        .map(([, nodeEl]) => nodeEl.getBoundingClientRect());

    // Keep the inspector in the chat pane, clear of the sidebar tabs and map
    // toolbar. The popover is fixed to the viewport, so the usable width ends
    // 8px left of the sidebar.
    const sidebar = document.querySelector('.sidebar-panel');
    const sidebarLeft = sidebar ? sidebar.getBoundingClientRect().left : window.innerWidth;
    const usableRight = Math.max(160, sidebarLeft - 8);

    return chooseBestPopoverPosition({
        anchor: { left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height },
        size,
        viewport: { width: usableRight, height: window.innerHeight },
        obstacles,
        gap: 14,
        margin: 8,
        topMargin: 108
    });
}

function startInspectorTracking() {
    if (inspectorFrame) cancelAnimationFrame(inspectorFrame);
    inspectorLast = performance.now();
    let current = null;

    const step = timestamp => {
        const inspector = document.getElementById('map-inspector');
        if (!inspector || inspector.hidden || !inspectedId) {
            inspectorFrame = null;
            return;
        }
        if (window.innerWidth < 768) {
            inspectorFrame = requestAnimationFrame(step);
            return;
        }
        if (inspectorManual) {
            current = { left: inspectorManual.left, top: inspectorManual.top };
            inspector.style.left = `${current.left}px`;
            inspector.style.top = `${current.top}px`;
            inspectorFrame = requestAnimationFrame(step);
            return;
        }
        const target = inspectorTarget();
        if (!target) {
            inspectorFrame = requestAnimationFrame(step);
            return;
        }
        const dt = Math.min(0.05, Math.max(0.001, (timestamp - inspectorLast) / 1000));
        inspectorLast = timestamp;
        const k = prefersReducedMotion() ? 1 : 1 - Math.exp(-INSPECTOR_LERP * dt);
        if (!current) current = { left: target.left, top: target.top };
        current = {
            left: current.left + (target.left - current.left) * k,
            top: current.top + (target.top - current.top) * k
        };
        inspector.style.left = `${current.left}px`;
        inspector.style.top = `${current.top}px`;
        inspectorFrame = requestAnimationFrame(step);
    };
    inspectorFrame = requestAnimationFrame(step);
}

// ─── ROUTE HERE ───────────────────────────────────────────────────────────

function routeTo(toRoomId) {
    if (!toRoomId) return;
    if (routeController) routeController.abort();
    routeController = new AbortController();
    const signal = routeController.signal;
    const status = document.getElementById('map-inspector-route-status');
    clearRoute();
    if (status) status.textContent = 'Finding route…';

    const fromRoomId = graphData.current_room_id;
    fetchPath(toRoomId, fromRoomId, signal)
        .then(result => {
            if (signal.aborted || inspectedId !== toRoomId) return;
            if (!result.found) {
                clearRoute();
                if (status) status.textContent = routeReason(result.reason);
                return;
            }

            const keys = [];
            for (const step of result.steps) {
                const edge = findEdgeForStep(graphData.edges, step);
                if (!edge) continue;
                keys.push(edgeKey(edge.from, edge.direction, edge.to));
            }
            if (keys.length === 0) {
                if (status) status.textContent = fromRoomId === toRoomId
                    ? 'You are already here.'
                    : routeReason(result.reason);
                return;
            }
            paintRoute(keys);
            const directions = result.steps
                .map(step => step.direction || 'onward')
                .join(' → ');
            if (status) {
                status.textContent = `${result.steps.length} step${result.steps.length === 1 ? '' : 's'}: ${directions}`;
            }
        })
        .catch(error => {
            if (error?.name === 'AbortError' || signal.aborted) return;
            clearRoute();
            if (status) {
                status.textContent = error?.status === 404
                    ? 'Route unavailable (404) — that room is not on the current map.'
                    : 'Route unavailable — no walkable path.';
            }
        });
}

function routeReason(reason) {
    if (reason === 'different_region') return 'No walkable route — the target is in a different region.';
    if (reason === 'no_route') return 'No route — there is no walkable path to that room.';
    return 'No route — there is no walkable path to that room.';
}

function paintRoute(keys) {
    routeKeys = keys.slice();
    for (const edge of graphData.edges) {
        const key = edgeKey(edge.from, edge.direction, edge.to);
        if (routeKeys.includes(key)) {
            edgePaths.get(key)?.classList.add('map-edge-route');
        }
    }
}

function clearRoute() {
    routeKeys = [];
    for (const path of edgePaths.values()) path.classList.remove('map-edge-route');
    const status = document.getElementById('map-inspector-route-status');
    if (status) status.textContent = '';
}
