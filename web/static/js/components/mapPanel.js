// Map panel (spatial-map-visualization-pathfinding, 6.2).
//
// Co-located component in the actionChips/barterModal style: owns its own DOM
// rendering, its own fetch via the per-domain api/map.js client, and its own
// module-level view state (last payload + current render mode). Renderer per
// D6: hand-rolled DOM rooms + an SVG edge layer — no graph library, no build
// step. Rooms are DOM elements (`.map-room[data-room-id]`) so the DOM contract
// is stable regardless of render mode.
//
// Cartographic mode: rooms cluster by `regions`, walk edges are curved paths,
// portal/time edges are distinct coloured arrows, inferred edges dashed.
// Node-graph mode: straight edges with direction/kind/inferred labels.

import { fetchMap } from '../api/map.js';

const MODES = ['cartographic', 'node-graph'];
const SVG_NS = 'http://www.w3.org/2000/svg';

const ROOM_WIDTH = 132;
const ROOM_HEIGHT = 54;
const COL_GAP = 190;
const ROW_GAP = 84;
const REGION_GAP = 70;
// Outer padding. Large enough that a region box drawn REGION_INSET_Y above its
// first room row leaves the label (top: -0.75rem) inside the canvas.
const PAD = 34;
const REGION_INSET_X = 14;
const REGION_INSET_Y = 20;
// A hidden panel reports clientWidth 0; remember the last real width and fall
// back to a typical sidebar width on the very first paint.
const FALLBACK_PANEL_WIDTH = 300;
// How far outside a room box an edge endpoint sits, so its arrowhead is not
// hidden behind the opaque room node painted above the SVG layer.
const EDGE_GAP = 3;

// Edge kind → arrow colour. Portal/time are visually distinct from walk.
const EDGE_COLORS = {
  walk: '#38bdf8',
  portal: '#c084fc',
  time: '#facc15'
};

let cachedMap = null;
let currentMode = 'cartographic';
let toggleWired = false;
let resizeWired = false;
let resizeTimer = null;
let lastPanelWidth = 0;

export function toggleMapMode() {
  const idx = MODES.indexOf(currentMode);
  currentMode = MODES[(idx + 1) % MODES.length];
  if (cachedMap) {
    renderMapPanel(cachedMap);
  } else {
    applyModeAttributes();
  }
}

// Fetch + render. Paints the last known payload synchronously first so opening
// the tab is instant and the room count never dips while the request is in
// flight; the fresh payload replaces it when it lands.
export async function refreshMapPanel() {
  const panel = document.getElementById('map-panel');
  if (!panel) return;

  if (cachedMap) renderMapPanel(cachedMap);

  try {
    cachedMap = await fetchMap();
  } catch (e) {
    cachedMap = { rooms: [], edges: [], regions: [], current_room_id: null };
  }
  renderMapPanel(cachedMap);
}

export function renderMapPanel(data) {
  const panel = document.getElementById('map-panel');
  if (!panel) return;

  cachedMap = data;
  wireToggle();
  wireResize();
  applyModeAttributes();
  panel.setAttribute('data-current-room-id', data.current_room_id || '');

  const canvas = ensureCanvas(panel);
  const content = ensureContent(canvas);
  content.innerHTML = '';

  const rooms = Array.isArray(data.rooms) ? data.rooms : [];
  if (rooms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'map-empty';
    empty.innerText = '[NO ROOMS MAPPED YET]';
    content.appendChild(empty);
    content.style.width = '';
    content.style.height = '';
    canvas.scrollLeft = 0;
    canvas.scrollTop = 0;
    return;
  }

  // #map-canvas is the scroll box; the layout sizes the content layer inside
  // it. Sizing the scroll box itself made it grow past #tab-map (overflow:
  // hidden) instead of scrolling.
  const measured = canvas.clientWidth;
  if (measured > 0) lastPanelWidth = measured;
  const panelWidth = measured > 0 ? measured : (lastPanelWidth || FALLBACK_PANEL_WIDTH);

  const layout = computeLayout(data, panelWidth);

  // Region cluster boxes sit behind the edges and nodes.
  for (const box of layout.regionBoxes) {
    const regionEl = document.createElement('div');
    regionEl.className = 'map-region';
    regionEl.style.left = `${box.x}px`;
    regionEl.style.top = `${box.y}px`;
    regionEl.style.width = `${box.w}px`;
    regionEl.style.height = `${box.h}px`;
    const label = document.createElement('span');
    label.className = 'map-region-label';
    label.innerText = `REGION ${box.index + 1}`;
    regionEl.appendChild(label);
    content.appendChild(regionEl);
  }

  content.appendChild(buildEdgeLayer(data, layout));

  const currentRoomId = data.current_room_id || null;
  for (const room of rooms) {
    const pos = layout.positions.get(room.id);
    if (!pos) continue;
    content.appendChild(buildRoomNode(room, pos, currentRoomId));
  }

  content.style.width = `${layout.width}px`;
  content.style.height = `${layout.height}px`;

  scrollCurrentRoomIntoView(canvas, layout, currentRoomId);
}

function applyModeAttributes() {
  const panel = document.getElementById('map-panel');
  if (panel) panel.setAttribute('data-mode', currentMode);

  const toggle = document.getElementById('map-mode-toggle');
  if (toggle) {
    toggle.innerText = currentMode === 'cartographic' ? 'MODE: CARTOGRAPHIC' : 'MODE: NODE-GRAPH';
    toggle.setAttribute('aria-pressed', currentMode === 'node-graph' ? 'true' : 'false');
  }

  const canvas = document.getElementById('map-canvas');
  if (canvas) canvas.setAttribute('data-mode', currentMode);
}

function wireToggle() {
  if (toggleWired) return;
  const toggle = document.getElementById('map-mode-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', toggleMapMode);
  toggleWired = true;
}

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

// The sized layer inside the scroll box. Region boxes / SVG / room nodes are
// positioned relative to this, so the canvas itself stays at 100% width and
// scrolls when the content is larger.
function ensureContent(canvas) {
  let content = canvas.querySelector('.map-canvas-content');
  if (!content) {
    content = document.createElement('div');
    content.id = 'map-canvas-content';
    content.className = 'map-canvas-content';
    canvas.appendChild(content);
  }
  return content;
}

// Re-lay out when the panel width changes (desktop sidebar <-> mobile tab).
// Debounced so a drag-resize doesn't thrash the renderer.
function wireResize() {
  if (resizeWired) return;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (cachedMap) renderMapPanel(cachedMap);
    }, 150);
  });
  resizeWired = true;
}

// Centre the current room in the scroll box, clamped to the scrollable range.
function scrollCurrentRoomIntoView(canvas, layout, currentRoomId) {
  const pos = currentRoomId ? layout.positions.get(currentRoomId) : null;
  if (!pos) {
    canvas.scrollLeft = 0;
    canvas.scrollTop = 0;
    return;
  }
  const targetLeft = pos.x + ROOM_WIDTH / 2 - canvas.clientWidth / 2;
  const targetTop = pos.y + ROOM_HEIGHT / 2 - canvas.clientHeight / 2;
  const maxLeft = Math.max(0, canvas.scrollWidth - canvas.clientWidth);
  const maxTop = Math.max(0, canvas.scrollHeight - canvas.clientHeight);
  canvas.scrollLeft = Math.max(0, Math.min(targetLeft, maxLeft));
  canvas.scrollTop = Math.max(0, Math.min(targetTop, maxTop));
}

// Deterministic region-clustered layout. Each region gets a band; rooms inside
// a region are placed on a near-square grid ordered by (first_turn, name).
// Width-aware: columns are capped to what fits `panelWidth`, and bands wrap
// onto new rows, so a narrow sidebar grows downward instead of off-canvas.
// Every room is placed even if `regions` is incomplete. The (first_turn, name)
// sort is load-bearing for reproducible renders — do not change it.
function computeLayout(data, panelWidth) {
  const rooms = data.rooms || [];
  const byId = new Map(rooms.map(r => [r.id, r]));

  const regionIds = (data.regions || [])
    .map(r => (r.room_ids || []).filter(id => byId.has(id)))
    .filter(ids => ids.length > 0);

  const placed = new Set(regionIds.flat());
  const leftovers = rooms.map(r => r.id).filter(id => !placed.has(id));
  if (leftovers.length > 0) regionIds.push(leftovers);
  if (regionIds.length === 0) regionIds.push(rooms.map(r => r.id));

  const usable = Math.max(ROOM_WIDTH, (panelWidth || FALLBACK_PANEL_WIDTH) - PAD * 2);
  const maxCols = Math.max(1, Math.floor((usable - ROOM_WIDTH) / COL_GAP) + 1);

  const positions = new Map();
  const regionBoxes = [];
  let cursorX = PAD;
  let cursorY = PAD;
  let rowHeight = 0;
  let firstInRow = true;
  let maxRight = PAD;
  let maxBottom = PAD;

  regionIds.forEach((ids, regionIdx) => {
    const sorted = ids.slice().sort((a, b) => {
      const ra = byId.get(a);
      const rb = byId.get(b);
      const ta = ra.first_turn ?? 0;
      const tb = rb.first_turn ?? 0;
      if (ta !== tb) return ta - tb;
      return String(ra.name || a).localeCompare(String(rb.name || b));
    });

    const count = sorted.length;
    const cols = Math.min(maxCols, Math.max(1, Math.ceil(Math.sqrt(count))));
    const rows = Math.ceil(count / cols);
    const bandWidth = (cols - 1) * COL_GAP + ROOM_WIDTH;
    const bandHeight = (rows - 1) * ROW_GAP + ROOM_HEIGHT;

    // Wrap to a new row when this band would overrun the usable width. The
    // first band on a row is always placed, so an over-wide band scrolls
    // rather than being dropped.
    if (!firstInRow && cursorX + bandWidth > PAD + usable) {
      cursorX = PAD;
      cursorY += rowHeight + REGION_GAP;
      rowHeight = 0;
      firstInRow = true;
    }

    regionBoxes.push({
      x: cursorX - REGION_INSET_X,
      y: cursorY - REGION_INSET_Y,
      w: bandWidth + REGION_INSET_X * 2,
      h: bandHeight + REGION_INSET_Y + 20,
      index: regionIdx
    });

    sorted.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.set(id, {
        x: cursorX + col * COL_GAP,
        y: cursorY + row * ROW_GAP
      });
    });

    maxRight = Math.max(maxRight, cursorX + bandWidth);
    maxBottom = Math.max(maxBottom, cursorY + bandHeight);
    rowHeight = Math.max(rowHeight, bandHeight);
    cursorX += bandWidth + REGION_GAP;
    firstInRow = false;
  });

  return {
    positions,
    regionBoxes,
    width: maxRight + PAD,
    height: maxBottom + PAD
  };
}

function buildEdgeLayer(data, layout) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'map-edges');
  svg.setAttribute('width', layout.width);
  svg.setAttribute('height', layout.height);
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);

  const defs = document.createElementNS(SVG_NS, 'defs');
  for (const [kind, color] of Object.entries(EDGE_COLORS)) {
    defs.appendChild(buildArrowMarker(`map-arrow-${kind}`, color));
  }
  svg.appendChild(defs);

  const isNodeGraph = currentMode === 'node-graph';

  for (const edge of data.edges || []) {
    const from = layout.positions.get(edge.from);
    const to = layout.positions.get(edge.to);
    if (!from || !to) continue;

    const fromCx = from.x + ROOM_WIDTH / 2;
    const fromCy = from.y + ROOM_HEIGHT / 2;
    const toCx = to.x + ROOM_WIDTH / 2;
    const toCy = to.y + ROOM_HEIGHT / 2;

    // Trim both ends to the room borders so the arrowhead (marker-end) lands
    // outside the opaque target node instead of behind it.
    const start = boxBorderPoint(fromCx, fromCy, toCx, toCy);
    const end = boxBorderPoint(toCx, toCy, fromCx, fromCy);

    const kind = EDGE_COLORS[edge.kind] ? edge.kind : 'walk';
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', edgeClassName(edge, kind, isNodeGraph));
    path.setAttribute('marker-end', `url(#map-arrow-${kind})`);
    path.setAttribute('d', edgePathD(start.x, start.y, end.x, end.y, isNodeGraph));
    svg.appendChild(path);

    if (isNodeGraph) {
      svg.appendChild(buildEdgeLabel(edge, kind, start.x, start.y, end.x, end.y));
    }
  }

  return svg;
}

// Intersection of the ray (cx,cy)->(towardX,towardY) with the rectangle border
// of a room box (half-extents ROOM_WIDTH/2 + gap, ROOM_HEIGHT/2 + gap). `t` is
// capped at 1 so tightly packed rooms cannot invert the segment.
function boxBorderPoint(cx, cy, towardX, towardY) {
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = ROOM_WIDTH / 2 + EDGE_GAP;
  const hh = ROOM_HEIGHT / 2 + EDGE_GAP;
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty, 1);
  return { x: cx + dx * t, y: cy + dy * t };
}

function edgeClassName(edge, kind, isNodeGraph) {
  const classes = ['map-edge', `map-edge-${kind}`];
  if (isNodeGraph) classes.push('map-edge-node');
  if (edge.inferred) classes.push('map-edge-inferred');
  return classes.join(' ');
}

function edgePathD(x1, y1, x2, y2, straight) {
  if (straight) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const offset = 18;
  const cx = (x1 + x2) / 2 - (dy / len) * offset;
  const cy = (y1 + y2) / 2 + (dx / len) * offset;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
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

function buildEdgeLabel(edge, kind, x1, y1, x2, y2) {
  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('class', 'map-edge-label');
  label.setAttribute('x', String((x1 + x2) / 2));
  label.setAttribute('y', String((y1 + y2) / 2 - 4));
  label.setAttribute('text-anchor', 'middle');

  const parts = [edge.direction || '?', kind];
  if (edge.inferred) parts.push('inferred');
  label.textContent = parts.join(' · ');
  return label;
}

function buildRoomNode(room, pos, currentRoomId) {
  const el = document.createElement('div');
  el.className = 'map-room';
  el.setAttribute('data-room-id', room.id);
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;

  const isCurrent = room.id === currentRoomId;
  const visitCount = room.visit_count || 0;
  const visited = visitCount > 0 || room.last_visit_turn != null;

  if (isCurrent) el.classList.add('current-room');
  el.classList.add(visited ? 'visited' : 'unvisited');
  el.setAttribute('data-visited', visited ? 'true' : 'false');
  el.setAttribute('data-visit-count', String(visitCount));

  const name = document.createElement('span');
  name.className = 'map-room-name';
  name.innerText = room.name || room.id;

  const meta = document.createElement('span');
  meta.className = 'map-room-meta';
  if (isCurrent) {
    meta.innerText = '◉ YOU ARE HERE';
  } else if (visited) {
    meta.innerText = `visited ×${visitCount}`;
  } else {
    meta.innerText = 'unvisited';
  }

  el.appendChild(name);
  el.appendChild(meta);
  return el;
}
