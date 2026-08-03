## Source material

### Architecture deepening review, candidate #6 (2026-08-03)

The frontend pub/sub store is a zombie: it fails the deletion test outright.

**`web/static/js/state.js` is dead weight.**
- `updateState` is never called except from inside `resetState` (`state.js:36`), and `resetState` is never called.
- `subscribe` has zero callers (`state.js:22` defines it; nothing subscribes).
- The store's `window[k] = v` mirror (`state.js:29-31`) is dead code.

**The real state model is implicit globals.** ~68 direct `window.<key>` read/write sites across 7 modules carry the actual application state, with `web/static/js/app.js:18-34` `Object.assign(window, {...})` the "migration bridge" that is now primary. Modules reach each other through `window.renderLoreCards`, `window.pollDebugData`, `window.syncState`, `window.submitPlayerCommand`, etc. The `FRONTEND_ARCHITECTURE.md:83-85` documents this as removable once the store is done — but the store was never finished, so the bridge isn't transitional, it's the architecture.

**Two rendering paths for one logical Turn.**
- `executeStreamAction` (`web/static/js/api/streaming.js:157-166`): re-fetches `/api/state`, calls `renderState(state, true)` with `skipLastAssistant=true` so the last assistant turn is filtered out, then `revealAssistantText` re-appends the same text character-by-character.
- The error path (`streaming.js:177-181`) calls `renderState(state)` *without* the skip, rendering a stale duplicate when state and stream disagree.

Two code paths render the same logical Turn; they can drift, and one already has (the error path).

### Raised but not acted on

- **Migrate store or delete it — not both kept.** The deepening is to make the decision: either finish the migration (single write path) or delete `state.js` as dead weight. Keeping a dead store and a live global bridge is the worst state.
- **The `window.*` bridge cannot be removed in one step.** Inline `onclick` handlers in `index.html` still call `showScreen`, `closeModal`, `switchSidebarTab`, etc. Removal needs either a converted event-listener pass or an interim proxy. Flagged as a dependency.
- **Accessibility/keyboard interception** (`app.js` keydown handler) is out of scope.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| zombie store | A module with a published interface nobody calls | A store with real subscribers |
| migration bridge | The `Object.assign(window, ...)` that makes every module reachable globally | The app's actual state layer |
| render path | The code that writes the console log for one Turn | The SSE fetch that produced the text |
| single write path | `updateState` as the only mutation point | Reading globals and patching DOM directly |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — in-repo zero-build ESM; no external code) | — | — | 2026-08-03 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Finish the store migration (single write path, delete `window[k]` mirror) | Open | The documented intent; restores the pub/sub seam for future components | 2026-08-03 |
| Delete `state.js` as dead weight | Open | Cheapest honest option; keeps globals as the (ugly but real) state model | 2026-08-03 |
| Collapse `skipLastAssistant` + `revealAssistantText` into one path | Adopt in either option | Stream owns the text OR the renderer owns it, not both | 2026-08-03 |

## Patterns adopted

From prior in-repo work: `web/static/js/ui/screens.js` and `ui/renderers.js` are already importable modules; the surviving pattern is module exports over globals. The deepening extends that pattern to state.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `updateState` has no external callers | Only `state.js:36` (inside `resetState`, itself uncalled) | Code read (grep) | 2026-08-03 | stable |
| `subscribe` has zero callers | Definition at `state.js:22` only | Code read (grep) | 2026-08-03 | stable |
| ~68 direct `window.*` state sites | Across `app.js`, `streaming.js`, `presets.js`, `memory.js`, `lore.js`, `settings.js`, `saves.js` | Code read | 2026-08-03 | stable |
| `app.js:18-34` `Object.assign(window, ...)` is the bridge | Loaded before all module use | Code read | 2026-08-03 | stable |
| Two render paths for one Turn | `renderState(state, true)` + `revealAssistantText` in `streaming.js:157-166` | Code read | 2026-08-03 | stable |
| Error path skips the flag | `streaming.js:177-181` calls `renderState(state)` without skip | Code read | 2026-08-03 | stable |

## Unverified assumptions

- **That removing the `window[k]` mirror won't break inline `onclick` handlers in `index.html`.** The handlers are the constraint; grep for `onclick=` before deleting anything.
- **That `revealAssistantText`'s character-by-character reveal is a UX requirement rather than an implementation detail.** If it's decorative, the collapse is trivial; if it's required, the single path must preserve it. Ask before removing.

## Superseded claims

- **"The store is the single source of truth, with a transitional global bridge."** Superseded by code read: the store has no consumers; the bridge is the architecture.

## Links out

- `web/static/js/state.js` — zombie store
- `web/static/js/app.js:18-34` — `Object.assign(window, ...)`
- `web/static/js/api/streaming.js:157-181` — dual render path
- `web/static/js/ui/renderers.js` — `skipLastAssistant` / `renderState`
- `web/FRONTEND_ARCHITECTURE.md:83-85` — documented-but-unfinished migration
- `web/static/index.html` — inline `onclick` handlers (constraint)
