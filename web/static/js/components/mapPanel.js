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
const PAD = 28;

// Edge kind → arrow colour. Portal/time are visually distinct from walk.
const EDGE_COLORS = {
  walk: '#38bdf8',
  portal: '#c084fc',
  time: '#facc15'
};

let cachedMap = null;
let currentMode = 'cartographic';
let toggleWired = false;

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
  applyModeAttributes();
  panel.setAttribute('data-current-room-id', data.current_room_id || '');

  const canvas = ensureCanvas(panel);
  canvas.innerHTML = '';

  const rooms = Array.isArray(data.rooms) ? data.rooms : [];
  if (rooms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'map-empty';
    empty.innerText = '[NO ROOMS MAPPED YET]';
    canvas.appendChild(empty);
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.style.minHeight = '';
    return;
  }

  const layout = computeLayout(data);

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
    canvas.appendChild(regionEl);
  }

  canvas.appendChild(buildEdgeLayer(data, layout));

  const currentRoomId = data.current_room_id || null;
  for (const room of rooms) {
    const pos = layout.positions.get(room.id);
    if (!pos) continue;
    canvas.appendChild(buildRoomNode(room, pos, currentRoomId));
  }

  canvas.style.width = `${layout.width}px`;
  canvas.style.height = `${layout.height}px`;
  canvas.style.minHeight = `${layout.height}px`;
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

// Deterministic region-clustered layout. Each region gets a horizontal band;
// rooms inside a region are placed on a near-square grid ordered by
// (first_turn, name). Every room is placed even if `regions` is incomplete.
function computeLayout(data) {
  const rooms = data.rooms || [];
  const byId = new Map(rooms.map(r => [r.id, r]));

  const regionIds = (data.regions || [])
    .map(r => (r.room_ids || []).filter(id => byId.has(id)))
    .filter(ids => ids.length > 0);

  const placed = new Set(regionIds.flat());
  const leftovers = rooms.map(r => r.id).filter(id => !placed.has(id));
  if (leftovers.length > 0) regionIds.push(leftovers);
  if (regionIds.length === 0) regionIds.push(rooms.map(r => r.id));

  const positions = new Map();
  const regionBoxes = [];
  let cursorX = PAD;
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

    const rows = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
    const cols = Math.ceil(sorted.length / rows);
    const bandWidth = (cols - 1) * COL_GAP + ROOM_WIDTH;
    const bandHeight = (rows - 1) * ROW_GAP + ROOM_HEIGHT;

    regionBoxes.push({
      x: cursorX - 14,
      y: PAD - 24,
      w: bandWidth + 28,
      h: bandHeight + 44,
      index: regionIdx
    });

    sorted.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.set(id, {
        x: cursorX + col * COL_GAP,
        y: PAD + row * ROW_GAP
      });
    });

    maxRight = Math.max(maxRight, cursorX + bandWidth);
    maxBottom = Math.max(maxBottom, PAD + bandHeight);
    cursorX += bandWidth + REGION_GAP;
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

    const x1 = from.x + ROOM_WIDTH / 2;
    const y1 = from.y + ROOM_HEIGHT / 2;
    const x2 = to.x + ROOM_WIDTH / 2;
    const y2 = to.y + ROOM_HEIGHT / 2;

    const kind = EDGE_COLORS[edge.kind] ? edge.kind : 'walk';
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', edgeClassName(edge, kind, isNodeGraph));
    path.setAttribute('marker-end', `url(#map-arrow-${kind})`);
    path.setAttribute('d', edgePathD(x1, y1, x2, y2, isNodeGraph));
    svg.appendChild(path);

    if (isNodeGraph) {
      svg.appendChild(buildEdgeLabel(edge, kind, x1, y1, x2, y2));
    }
  }

  return svg;
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
