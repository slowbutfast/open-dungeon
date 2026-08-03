## Why

In a full 12-act playtest, the engine `score` never moved — it sat at `0` for all 35 turns despite milestone beats (datachip found, checkpoint defeated, record purged). Score is currently passive: it only changes if the model happens to write a new number into the `[Status: ... | Score: N | Moves: N]` line. There is no contract and no engine rule guaranteeing progression, so the field is decorative.

## What Changes

- **Decide the scoring model.** Two options, settled here: **engine-driven** (deterministic rules applied by the engine over extracted event types) or **narrator-driven** (strengthened prompt contract requiring score increments on milestone beats). Default recommendation: engine-driven, because it is deterministic, model-independent, and testable — the narrator-driven contract is what demonstrably fails today.
- **Implement the chosen model.**
  - If engine-driven: a scoring function that maps extracted event types (`discovery`/`quest`/`combat`/`trade`) and milestone turns to score increments, applied at flush/commit time so score stays consistent with memory.
  - If narrator-driven: update all five prompt definitions to mandate score updates on milestone beats, plus status-line contract wording.
- **Make score commit robust to #12.** Whichever model is chosen, score must commit through the same shared status-line path (or an engine-side assignment) so a missed status line can't silently freeze score.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `game-engine`: modify `Generate Response Stream` (score progression rule) and `Game State Persistence` (score survives save/load — already does, but scoring must be recomputable).
- `context-compression`: if engine-driven, score is derived from extractor events — the `On-Demand Memory Sync` requirement interacts.

## Impact

- `engine/llm.js` — score commit path (shared parser, per #12)
- `engine/index.js` / `engine/storyPresets.js` — prompt contract (narrator-driven option)
- `engine/memory/eventExtractor.js` — typed events as the scoring signal (engine-driven option)
- `engine/` scoring rule module (new, engine-driven option)
- Tests: score progression across a playtest arc; score survives save/load
- No new dependencies.
