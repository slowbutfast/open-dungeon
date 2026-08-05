## Source material

Whiteboard exploration + natural live-LLM playtests (2026-08-05).

Product decision from the peer engineer (2026-08-05): "lets have fun and allow for a
more flexible narrator who tries to lean into whatever style the user wants. e.g. you
are a narrator for this game and try to embrace whatever style you want from the user,
but then lock in and don't deviate half way through from the original goal, i.e. staying
consistent."

Follow-up direction (2026-08-05): "open append these findings to the narrator change
feature... we have good diagnostic information." The diagnostic findings come from four
parallel NATURAL playtest agents (wanderer / explorer / quest-seeker / storyteller) that
played the live model for ~11 turns each, framed as players having fun, not as testers
trying to break the feature.

### Raised but not acted on

- **Portal-edge write loss**: reported by an earlier probe, then conclusively retracted
  as a false positive (verified through store / reconcile / turn-commit / HTTP probe).
  Not part of this change; documented in `docs/handoffs/2026-08-05-spatial-map-handoff.md`.
- **"Mobile narrator" (always move the player on directional verbs)**: an orthogonal
  product decision. This change pins style + status-line fidelity; whether the default
  narrator should also generate movement on every directional verb is a separate call.
- **Map visualization + BFS pathfinding**: tracked in GH #35, out of scope here.
- **Ghost/custom-persona override** (a player's opening persona was silently overridden
  by the injected `Eldrin, a Mage` character): noted by the storyteller probe; a real UX
  gap but distinct from narrator style — flagged, not scoped here.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Status line | The canonical three-field `[Status: Location \| Score \| Moves]` line the narrator appends | The narration prose that describes the scene |
| Status-line divergence | The narrator's status-line `Location` differs from where its own prose places the player | A forged/mechanical status line (the engine's forged-status guard) |
| Narrator style | The tone/register the narrator writes in (grim, whimsical, terse, florid) | The narrator's world-generation behavior (whether it moves the player) |
| Stale status echo | The model repeating a previous turn's `[Status: ...]` line after narrating travel | A legitimate no-movement turn |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none external — this is a prompt-contract change grounded in in-repo playtest evidence) | | | |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| A second LLM call to detect style / fix the status line | Rejected for v1 | Adds latency + cost per turn; the fix belongs in the prompt contract first | 2026-08-05 |
| A deterministic "status-line health check" that reconciles the last location against the narration | **Adopted (2026-08-05, GH #38)** after three frozen live gates | Scoped to missing/repeated status lines (`llm.lastStatusLocation`) and prose arrival landmarks (`engine/narrationLandmarks.js`); validated against real frozen-map prose. Originally deferred as fragile; the live gate failure made the backstop necessary | 2026-08-05 |
| Prompt-contract change only (style directive + stronger status mandate) | Adopted (with the budget floor + fallback) | Zero new deps, minimal surface, directly targets the observed failure | 2026-08-05 |

## Patterns adopted

- **Single-source prompt contract** (from `status-line-contract-residue`, `structured-narrator-context`): the style directive and the status mandate are added to `DEFAULT_SYSTEM_PROMPT` (`engine/index.js`) and the four story presets (`engine/storyPresets.js`) via the shared `STATUS_FORMAT`/registry seam — one canonical wording, every producer interpolates it.
- **Registry-driven prompt blocks** (from `structured-narrator-context`): a `[NARRATOR STYLE]` block lands in `engine/contextBlocks.js` as one declarative entry; sanitization derives from the registry so the block is auto-strip-eligible.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| All four natural live playtests hit the same wall: the map stopped following the fiction after ~2 rooms | Wanderer: 11 turns → 2 rooms; Explorer: 12 turns → 2 rooms; Quest-seeker: 11 turns → 3 rooms (0 edges); Storyteller: 11 turns → 1 room | Live `/api/map` snapshots from each probe | 2026-08-05 | low |
| Root cause is stale status-line echo, not an engine defect | The model repeated the same `[Status: ...]` location even after its prose narrated travel; the engine commits location from the status line (by design) and therefore never saw a new location to reconcile | Probe reports (engine stayed on one room while prose moved), engine code `engine/llm.js` status-commit path | 2026-08-05 | low |
| Engine behaved per-contract in all four runs | Moves +1/turn, score engine-computed (e.g. quest-seeker 9 = 3×discovery + 1×trade), inventory/trade atomic, history/save sanitized clean, no reconciliation failures | Probe evidence + `/api/debug/info` | 2026-08-05 | low |
| The model used is `cognitivecomputations/dolphin-mistral-24b-venice-edition` (OpenRouter default from `.env`) | It under-emits and under-updates the status line | Probe reports | 2026-08-05 | decays (model-dependent) |
| `deepseek/deepseek-v4-pro` honored the status-line contract when given a custom prompt | A cooperating model produced movement + edges (and surfaced the (false-positive) portal finding) | probe-live2 run 2 | 2026-08-05 | decays |
| A default persona override happens (player's custom persona silently replaced by injected `Eldrin, a Mage`) | Storyteller probe: opening title said "retired sailor" but first user turn injected a mage character | Storyteller probe report | 2026-08-05 | low |

## Unverified assumptions

| Assumption | Cost to check |
| :--- | :--- |
| A stronger status mandate + style directive in the prompt improves status-line fidelity on the default model | Run one natural playtest after the prompt change and compare rooms/edges |
| Adding `[NARRATOR STYLE]` (captured once, held constant) actually reduces tonal drift | A/B two sessions on the same model with/without the style block |
| The default model is the main culprit; other models may already comply | Swap model via `.env` and run one natural session |

## Superseded claims

| Was believed | Why it was wrong | Replaced by |
| :--- | :--- | :--- |
| The live "portal edge missing" finding was an engine bug | Controlled repro across all four layers showed portal edges record correctly; the model simply didn't emit a parseable/changed status line on that turn | Documented false positive in the handoff; portal edge kind is correct |

## Links out

- `docs/handoffs/2026-08-05-spatial-map-handoff.md` — prior context; the portal false-positive closure.
- `openspec/changes/archive/2026-08-05-spatial-map-region-graph/` — the spatial feature this change's status-line work feeds.
- `openspec/changes/archive/2026-08-04-structured-narrator-context/` — the block-registry seam a `[NARRATOR STYLE]` block lands on.
- `openspec/specs/game-engine/spec.md` — `Generate Response Stream` / status-line contract requirements this change modifies.
- GH #35 — map visualization + pathfinding (separate track).
