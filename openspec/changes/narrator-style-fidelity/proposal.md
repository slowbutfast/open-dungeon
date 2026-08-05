## Why

Four parallel live-LLM playtests (wanderer / explorer / quest-seeker / storyteller), played naturally for ~11 turns each, all converged on the same wall: the fiction moved the player through vivid, continuous places, but the spatial map froze at 1–3 rooms. Root cause, identical in all four: the narrator keeps **echoing a stale location in its `[Status: ...]` line** even after its own prose narrates travel. The engine commits location from the status line (by design), so it never sees a new location to reconcile — no new rooms, no edges, no revisits. The engine behaved per-contract; the narrator's status line and its scene narration diverged. Separately, the peer decided the narrator should be a **flexible stylist** that leans into the user's opening tone and then stays consistent — which is currently unpinned and drifts.

## What Changes

- **Status-line fidelity (the real defect):** strengthen the status mandate so the narrator MUST advance the `Location` field when it narrates movement, and MUST emit the status line every turn. Applied to `DEFAULT_SYSTEM_PROMPT` (`engine/index.js`) and the four story presets (`engine/storyPresets.js`) via the shared contract wording.
- **Status-line output budget:** the simple-action narration budget (`engine/llm.js`) is floored so a "simple" action (e.g. `turn around, walk west`) always has room to emit the trailing status line — a truncated line parses as nothing and freezes the map (live-confirmed: the cooperative model lost a room to truncation). Movement verbs are not simple-capped.
- **Truncated-fragment hygiene:** `sanitizeForHistory` strips a `[Status:` line even without its closing `]`, so a truncated status line never surfaces in narration/history.
- **Stale-status recovery (GH #38, extended scope):** a deterministic fallback (`engine/narrationLandmarks.js` + the turn-commit hook in `engine/llm.js`) recovers a proposed location from the narration's (or action's) arrival landmarks when the narrator's status line is missing (truncated) or repeats its own previous line (the stale-echo signature). This is the backstop that keeps the map growing on models that won't comply with the mandate — live-playtest evidence showed the mandate alone freezes the map on both the default model and a cooperative reasoning model.
- **Narrator style directive:** add a prompt directive that the narrator should adopt the style implied by the player's opening and stay consistent throughout (no mid-session tonal drift).
- **`[NARRATOR STYLE]` context block:** capture the adopted style once and pin it into the narrator context so later turns don't drift — a new block in `engine/contextBlocks.js` (registry-driven; sanitizer strip-set auto-derived).
- **No new dependencies.** No change to `reconcile` / `parseStatusLine` / the forged-status guard.

## Capabilities

### New Capabilities
- `narrator-fidelity`: narrator status-line compliance (location advances with narrated movement; status line always emitted) and stable narrator style (adopt once, hold constant).

### Modified Capabilities
- `game-engine`: modify `Generate Response Stream` (the status-line contract: narrator MUST emit the status line each turn and advance `Location` when it narrates movement) and the system-prompt contract (style directive).
- `narrator-context`: modify `Composed Narrator Context` (add the `[NARRATOR STYLE]` block; sanitizer covers it automatically).

## Impact

- `engine/index.js` — `DEFAULT_SYSTEM_PROMPT` gains the status mandate + style directive.
- `engine/storyPresets.js` — the four preset prompts interpolate the same directive.
- `engine/contextBlocks.js` — new `NARRATOR STYLE` block (captured once, held constant).
- `engine/llm.js` — the turn-commit path feeds the captured style into the block; the simple-action narration budget is floored so the status line can always be emitted; the sanitizer strips truncated `[Status:` fragments; the stale-status recovery hook (GH #38) proposes a room from narration landmarks when the status line is missing or repeated.
- `engine/narrationLandmarks.js` — (new) the pure deterministic landmark extractor behind the stale-status fallback.
- `web/static/js/app.js` — the zero-build frontend default prompt literal must stay in agreement with the new contract (source-text pin test).
- Tests: status-mandate presence (source-text pin), `[NARRATOR STYLE]` block strip-eligibility, narration-budget floor + truncated-fragment strip, narration-landmark extraction (validated against real stale-echo prose), mock stale-status integration, natural-playtest regression (rooms/edges grow when the narrator moves).
- No new dependencies.
