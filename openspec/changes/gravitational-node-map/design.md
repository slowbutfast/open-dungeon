---
name: Retro Neon Obsidian Graph
colors:
  primary: "#38bdf8"
  secondary: "#c084fc"
  background: "#07090d"
  surface: "#0d1117"
  text:
    primary: "#e2e8f0"
    muted: "#94a3b8"
  border: "#1e293b"
  status:
    success: "#4ade80"
    warning: "#facc15"
    error: "#f87171"
typography:
  fontFamily:
    sans: "'JetBrains Mono', monospace"
    mono: "'JetBrains Mono', monospace"
    display: "'VT323', monospace"
  scale:
    h1: "1.2rem (19px), VT323, weight 400"
    h2: "0.95rem (15px), JetBrains Mono, weight 600"
    body: "0.78rem (12.5px), JetBrains Mono, weight 400"
    caption: "0.65rem (10.5px), JetBrains Mono, weight 400"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "9999px"
---

## 1. Visual Overview & Philosophy

- **Aesthetic Tone**: Retro-neon dark cartographic terminal blended with an Obsidian-style gravitational constellation graph. High-contrast glowing orbs float over a subtle dark grid canvas, connected by crisp directional arcs.
- **Target Surfaces**: Desktop sidebar `#tab-map` (`>= 768px`), mobile full-pane `#tab-map` (`< 768px`), floating `#map-hover-card` (fine-pointer desktop only), and `#map-inspector` (anchored popover on desktop; docked bottom sheet on mobile).
- **Visual References**: Existing Open Dungeon neon-terminal CSS tokens (`web/static/style.css`), Obsidian Graph View (degree-scaled nodes, 1-hop neighborhood dimming).

---

## 2. Color System & Contrast Rationale

| Token Name | Hex Value | Semantic Role | Background Pair | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `primary` | `#38bdf8` | Current room halo, `walk` edges, route highlight | `#07090d` | `9.3:1` | **PASS (AAA)** |
| `secondary` | `#c084fc` | `portal` edge strokes & badges | `#07090d` | `7.5:1` | **PASS (AAA)** |
| `status.warning` | `#facc15` | `time` edge strokes & badges | `#07090d` | `13.0:1` | **PASS (AAA)** |
| `status.success` | `#4ade80` | `visited` room orb border & pill | `#07090d` | `11.4:1` | **PASS (AAA)** |
| `text.primary` | `#e2e8f0` | Full room titles, inspector body | `#0d1117` | `15.4:1` | **PASS (AAA)** |
| `text.muted` | `#94a3b8` | Turn metadata, compact captions | `#0d1117` | `7.4:1` | **PASS (AAA)** |

---

## 3. Typography Hierarchy

| Level | Font Family | Size | Weight | Line Height | Intended Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Toolbar / Title` | `VT323`, monospace | `1.2rem` | `400` | `1.1` | `SPATIAL MAP` header & region badges |
| `Inspector Title` | `JetBrains Mono`, monospace | `0.9rem` | `600` | `1.3` | Full `room.name` in `#map-hover-card` & `#map-inspector` |
| `Node Compact Label` | `JetBrains Mono`, monospace | `0.72rem` | `500` | `1.2` | Shortened node title below orb |
| `Meta / Edge Label` | `JetBrains Mono`, monospace | `0.62rem` | `400` | `1.2` | Turn counts, edge direction/kind tags |

---

## 4. Component Anatomy & States

### Component: `.map-room` (Gravitational Orb Node)

- **Visual Hierarchy & Placement**: Circular orb (`width: var(--node-diameter); height: var(--node-diameter); border-radius: 9999px`) centered on `(x, y)` inside `#map-canvas-content`, with `.map-room-name` floating cleanly centered beneath the orb and an optional `.map-room-pin` dot when pinned in memory. Focusable via `tabindex="0"` and `role="button"`. On coarse/mobile pointers, an invisible `::before` pseudo-element guarantees a minimum `44×44px` hit target even for smaller leaf orbs.
- **Component States**:
  - **Idle (`visited`)**: `border: 1.5px solid rgba(74, 222, 128, 0.55)`, `background: rgba(7, 9, 13, 0.92)`.
  - **Idle (`unvisited`)**: `border: 1.5px dashed var(--border-light)` (orb graphic at `opacity: 0.65`, label text kept `>= 0.8` for legibility).
  - **Current Room (`.current-room`)**: `border-color: #38bdf8`, neon outer halo (`box-shadow: 0 0 14px rgba(56, 189, 248, 0.55)`).
  - **Hover / 1-Hop Focus (`.is-hovered`, `.is-neighbor`)**: Full `opacity: 1`, brightened border; unrelated orb graphics and edges under `.map-canvas.has-hover` dim to `opacity: 0.2`.
  - **Selected (`.is-selected`)**: Crisp `2px solid #38bdf8` ring.
  - **Keyboard Focus (`:focus-visible`)**: `2px solid #38bdf8`, `outline-offset: 3px`.

### Component: `#map-hover-card` & `#map-inspector`

- **`#map-hover-card`**: `position: fixed; z-index: 30; max-width: 240px`, dark terminal surface (`rgba(13, 17, 23, 0.96)`), `1px solid rgba(56, 189, 248, 0.45)`, displays full `room.name`, status pill, region + exit summary, and turn stamps.
- **`#map-inspector`**:
  - **Desktop**: `position: fixed; z-index: 35; width: 280px`, draggable header, exponential-lerp tracking (`1 - exp(-18 * dt)`), displays full `room.name`, `Unpin` button (if pinned), metadata strip, clickable outgoing/incoming exit chips, and `ROUTE HERE` button.
  - **Mobile (`< 768px`)**: Docked bottom sheet inside `#map-panel` (`max-height: 56dvh`), swipe/button dismissible.

---

## 5. Responsive Layout & Breakpoints

| Viewport | Breakpoint | Layout Pattern | Navigation / Sizing Rules |
| :--- | :--- | :--- | :--- |
| **Mobile** | `< 768px` | Full-pane `#tab-map`, bottom-sheet `#map-inspector` | Toolbar buttons (`+`, `-`, `FIT`, `⌖`) & exit chips $\ge 44\text{px}$ tap target; `touch-action: none` on `#map-canvas`; hover card suppressed on coarse pointers |
| **Desktop** | `>= 768px` | Sidebar `#tab-map`, anchored popover `#map-inspector` | Compact `28px` toolbar buttons; 200 ms hover dwell + `#map-hover-card` enabled |

---

## 6. Interaction, Motion & Sound

- **Transitions**: `opacity 160ms ease-out`, `border-color 150ms ease-out`, `box-shadow 180ms ease-out`.
- **Route Highlight (`.map-edge-route`)**: Animated dashed stroke flow (`stroke-dashoffset` keyframe) in bright `#38bdf8` with `filter: drop-shadow(0 0 4px #38bdf8)`.
- **Reduced Motion (`prefers-reduced-motion: reduce`)**: Disables continuous animation loops, lerp tracking, route pulse animation, and hover-pin reheat; settles synchronously and positions overlays immediately. **Never** gates `#map-hover-card` information.
- **Interaction Invariants**:
  - **Refresh while open**: `refreshMapPanel()` performs a keyed diff, prunes `homeAnchors` for removed rooms, clears stale routes, and closes `#map-inspector` if its room vanished (or updates it in place).
  - **Hover-pin vs `homeAnchors`**: `hover(node)` is temporary and clears on `pointerleave`; only `dragEnd` commits a persistent in-memory `homeAnchor`.
  - **`coasting`**: Post-pan-fling or post-drag-release inertia while velocity/alpha decays; suppresses hover dwell until settled.
  - **Unpinning**: The `Unpin` button in `#map-inspector` is the primary unpin control; desktop `dblclick` is a shortcut that unpins while suppressing tap-to-inspect.
- **Sound**: None (no audio synth in Open Dungeon).

---

## 7. Do's and Don'ts

- **DO** size `.map-room` orbs via `--node-diameter` computed from `forceLayout.js` degree radius so hit targets and visuals match 1:1.
- **DO** preserve `.map-room[data-room-id]`, `.current-room`, `.visited`/`.unvisited`, and `.map-empty` classes.
- **DON'T** show `#map-hover-card` on touch/coarse pointers or during a drag/pan gesture.
- **DON'T** truncate `room.name` inside `#map-hover-card` or `#map-inspector`.
