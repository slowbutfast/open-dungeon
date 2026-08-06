## Source material

Peer (2026-08-05, after the narrator-style-fidelity implementation + natural playtests):

> "i think we might have to provide 2-3 examples of what the shape of the output looks like so that the model doesn't have to infer or guess how they should output their response."

> "no i'm not talking about specifically the moving feature, but the shape of the whole response in general. i want to provide the model with examples of what we want it to do so it doesn't hallucinate responses or forgets to append the status or whatever"

The peer's intent, read together: the system prompt should carry complete-turn examples (prose + status line as the final line) covering the whole response anatomy, so the narrator reliably emits a well-formed turn instead of inferring it — targeting dropped/hallucinated status lines and off-shape responses.

### Raised but not acted on

- **"That proposed prompt might be too restrictive"** — the peer explicitly flagged that the drafted RESPONSE SHAPE block could over-constrain the narrator (e.g., its length/tone). Deliberately NOT resolved here; opened as a review issue (GH #41). The block's examples are tone-neutral and the design keeps the actual prose rules unchanged, but whether the examples over-fit is a live-model judgment, not a code one.
- **Replace vs append the existing three Zork examples** (`open mailbox` / `take leaflet` / `go north`) — open product call. Decided for v1: REPLACE, to avoid duplicating the status-format teaching and ~100 extra tokens per turn. Reversible; the Zork examples are only in the prompt sources.
- **Whether the examples should show movement agreement** — the peer explicitly scoped movement OUT of the examples; the block teaches full-turn anatomy, and Location-consistency (advance vs repeat) appears incidentally, not as a spatial lesson.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Response shape | The complete anatomy of one narrator turn: in-fiction prose followed by the canonical status line as the very last line, with nothing after it and nothing written for the player | The status-line format alone (three-field `[Status: ...]` shape) — that is `STATUS_FORMAT`, already pinned |
| Trailing question | A sentence ending the prose that asks the player what to do next ("What do you do?") | A question the NPC asks in dialogue (legitimate in-fiction speech) |
| Tone-neutral example | An example whose prose register does not lean whimsical/grim/terse/etc., so it cannot bias the default narrator before the per-session `[NARRATOR STYLE]` block pins a tone | An example that demonstrates the style directive |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none external — grounded in in-repo playtest evidence; the technique "models imitate examples more reliably than prose rules" is standard LLM prompting practice, applied here, not sourced) | | | |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| A second LLM call / classifier to detect a missing status line and repair the response | Rejected | Recovery already backstops a missing status line deterministically; an LLM repair pass adds latency + cost and can itself hallucinate | 2026-08-05 |
| Hardcode the RESPONSE SHAPE block into all five prompt sources | Rejected | Same duplication-drift risk as the status mandate; the repo already solved this with a shared constant (`STATUS_FORMAT`) | 2026-08-05 |
| Single `RESPONSE_SHAPE` constant interpolated into the five sources (`app.js` inlines the identical literal, pinned by source-text test) | Adopted | One source of truth for the response-shape contract; matches the existing `STATUS_FORMAT` pattern exactly | 2026-08-05 |

## Patterns adopted

- **Single-source prompt contract** (from `status-line-contract-residue`, `narrator-style-fidelity`): `RESPONSE_SHAPE` lives beside `STATUS_FORMAT` in `engine/statusFormat.js`; the default prompt + four presets interpolate `${RESPONSE_SHAPE}`; the zero-build frontend declares the identical literal, held honest by source-text pins.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| The default system prompt currently carries three Zork examples that teach only the status format, not the full turn anatomy | Confirmed (`open mailbox`, `take leaflet`, `go north` in `DEFAULT_SYSTEM_PROMPT` + all four presets + the web frontend literal) | Code read (`engine/index.js`, `engine/storyPresets.js`, `web/static/js/app.js`) | 2026-08-05 | low |
| Live narrators drop or mangle the status line despite the mandate | Confirmed across every live playtest (default model: 1/12 turns with a usable status line; deepseek: empty/truncated lines) | Live playtest reports, 2026-08-05 | 2026-08-05 | decays (model-dependent) |
| The status contract is pinned by source-text tests that all five prompt producers must satisfy | `STATUS_FORMAT_TEMPLATE`, mandate, and directive substrings asserted in `tests/test_engine_status_parsing.py` | Test run | 2026-08-05 | stable |
| A missing/truncated status line is already backstopped deterministically (GH #38) | `extractNarrationLandmark` + the turn-commit hook in `engine/llm.js` | Unit + mock integration + live gate (1→9 rooms) | 2026-08-05 | stable |

## Unverified assumptions

| Assumption | Cost to check |
| :--- | :--- |
| Complete-turn examples materially improve status-line compliance on real models (vs the prose mandate alone) | One natural live session before/after the prompt change, counting usable status lines |
| Tone-neutral examples do not measurably bias the default narrator's register | A/B the composed prompt's output tone across a few turns |
| Replacing the Zork examples does not regress the "curt Zork" baseline the persona relies on | Live-session prose-length comparison |

## Superseded claims

*(none — this is a new change)*

## Links out

- `openspec/specs/game-engine/spec.md` — the status-line contract and `Generate Response Stream` requirements this change's prompt text feeds.
- `openspec/specs/narrator-fidelity/spec.md` — status-line fidelity + stale-status recovery, the mechanism the response shape strengthens.
- `openspec/changes/archive/2026-08-05-narrator-style-fidelity/` — the prior change that added the mandate/directive; this change extends its prompt-contract work.
- `docs/handoffs/2026-08-05-narrator-style-fidelity.md` — natural-play findings (models dropping status lines) motivating the examples.
- GH #41 — review whether the drafted RESPONSE SHAPE block over-constrains the narrator.
