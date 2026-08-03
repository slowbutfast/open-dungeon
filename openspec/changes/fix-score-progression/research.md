## Source material

### GH issue #19 — "Score never advances in a full 12-act playthrough" (2026-08-02)

Filed from the Datachip Run playtest (session `c27aebc6`, Coruscant Underworld preset, 35 moves, dolphin-mistral-24b via OpenRouter). In a complete hero's-journey arc, the engine `score` remained `0` for the entire run despite multiple milestone beats.

**Evidence:** `dungeon_inspect_state` at journey end: `{ score: 0, moves: 35, location: "Vex's Workshop" }`. The fiction produced plausible score events (finding the datachip, defeating the checkpoint, purging the record), but the narrator never emitted a score change on the status line.

**Root-cause hypothesis:** the score contract is passive — score only changes if the *model* decides to increment it in the `[Status: ... | Score: N | Moves: N]` line. There is no engine-side scoring rule (no XP for discoveries/quests/combat), so score is entirely at the narrator's whim. Combined with the status-line parse issues in #12, score is effectively dead weight.

**Impact:** players see a static `Score: 0`; downstream scoring UI/achievements have nothing to act on; the `score` field in state, save files, and MCP `backend_status` is currently decorative.

**Proposed direction (from issue):**
- Decide whether score should be engine-driven (deterministic rules: discovery +N, quest complete +N, dialogue +N) or narrator-driven (prompt contract strengthened to require score updates on milestone beats).
- If narrator-driven: update the five prompt definitions (`engine/index.js` + `engine/storyPresets.js`) and the status-line contract.
- If engine-driven: derive score from the event extractor's typed events (`discovery`/`quest`/`combat`/`trade`).

**Related:** #12 (status-line parsing — score commits depend on it), #14 (event extractor — typed events are the natural scoring signal).

### Raised but not acted on

- **Whether score should drive anything downstream** (achievements, win/lose conditions, UI). The issue only establishes that score is currently static; its purpose beyond display is undecided. Recorded as an open decision, not a fact.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| score | The `Score: <N>` field in the status line and engine state | `moves` (turn counter) |
| narrator-driven scoring | The model chooses to increment score via the status line | Engine-computed scoring |
| engine-driven scoring | The engine applies deterministic rules to compute score | Random/award-based scoring |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — in-repo scoring decision; no external code referenced) | — | — | 2026-08-02 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| (none new) | — | Scoring is either a prompt-contract change (narrator-driven) or a small rules function over extractor events (engine-driven). No new deps. | 2026-08-02 |

## Patterns adopted

None external. Internal precedent: the `moves` ownership decision in `harden-context-history-integrity` (D2) is the same "single owner" question, applied to score.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Score stayed 0 for a full 12-act run | `c27aebc6` end state `{ score: 0, moves: 35 }` | MCP inspect_state | 2026-08-02 | stable |
| Narrator emitted no score increment despite milestone beats | No `[Status: ... Score: N>0 ...]` observed across 35 turns | MCP inspect_state + history | 2026-08-02 | stable |
| Score is passive/status-line-only today | No engine-side scoring rule in `engine/`; score set only via status-line parse | Code read | 2026-08-02 | stable |
| Score commit depends on #12 parsing | When the status line is missed (location froze, #12), score commits fail the same way | Live run | 2026-08-02 | stable |

## Unverified assumptions

- **That narrator-driven scoring would actually fire** if the prompt contract required it. The model ignored score for 35 turns; whether a strengthened contract changes that is untested.
- **That engine-driven scoring over extractor events is tractable** (typed events like `quest`/`combat`/`discovery` are already extracted — see `make-undo-and-trades-consistent` research). The extractor produces these events reliably, but tying a numeric score to them needs a rules definition.

## Superseded claims

- None yet.

## Dependency / staleness notes for future agents

- **Land `harden-context-history-integrity` (#12) before or with this change.** Score commits ride on status-line parsing; fixing the parser is a prerequisite for either scoring model to work reliably.
- **If engine-driven, coordinate with `validate-memory-extraction` (#14)** — score would derive from the same extractor events that change is validating. The event-type taxonomy must be stable first.
- **The "score is decorative" claim is model-dependent** — a different model might increment score occasionally. The durable defect is that there is no contract or engine rule guaranteeing progression, not that this specific model never scores.
- **Line-number references decay.** Re-verify against HEAD before implementing.

## Links out

- `engine/llm.js` — status-line parsing (score commit path)
- `engine/index.js` / `engine/storyPresets.js` — five prompt definitions
- `engine/memory/eventExtractor.js` — typed events (engine-driven scoring source)
- `openspec/specs/game-engine/spec.md` — game-engine capability
- `docs/playtest/2026-08-02-datachip-run.md` — full playtest narrative
