## Source material

### GH issue #17 — "Minor playtest findings: input validation, tracker scoping, cost accounting" (2026-08-02)

Three small independent defects found during MCP playtesting. Grouped because each is a few lines and none warrants its own issue.

**1. No input validation on player actions.** A whitespace-only action is accepted, spends a full LLM call, and appends a junk turn to history. `dungeon_send_action { action_type: "do", text: "   " }` → `"You're standing in front of a white house..."`. Empty and whitespace-only input should be rejected before the request is built. Costs real money on OpenRouter and pollutes history and the extraction queue with turns that have no player intent.

**2. `llmTracker` state is process-global, not per-adventure.** `dungeon_get_debug_info` is documented as returning "debug information for the current session", but `llmTracker` accumulates across every adventure the process has touched. After three adventures in one MCP server process, `get_debug_info` on the third returned all 32 calls and a `session_cost` covering all three, while `backend_status.adventure_id` correctly reported only the current one. Same for `debug_logs`, which interleaves entries from every adventure. Fix: scope the tracker by `adventure_id`, or reset it on `newAdventure` / `load`.

**3. Cost accounting only counts narration calls.** Extraction, summarization, and embedding calls are tracked with `tokens: { input: 0, output: 0 }`, so `session_cost` understates actual spend. From a real session: `llm_calls: 32 total — narration, extraction, summarization, embedding, embedding_batch`; only narration entries carry non-zero tokens; `session_cost: "$0.005023 = 8528 in × $0.4/1M + 1465 out × $1.1/1M"`. Extraction runs on every flush and summarization on every compression — both real completions against the same paid endpoint. The reported figure is meaningful as a *narration* cost but is labelled as session cost. Fix: capture usage from those calls too, or relabel the field and break out cost by call type.

**Also noted (not fixed here):** `engine/mockOpenAI.js` emits a two-field status line (`[Status: Cantina | Score: 5]`, no `Moves`) which doesn't match the three-field contract every prompt specifies. Harmless while the parser tolerates a missing `Moves`, but mock-mode playtests exercise a format the real model never produces. Worth aligning when #12 touches the parser.

### Raised but not acted on

- **Mock status-line format alignment.** #17 notes it "worth aligning when #12 touches the parser" — but #12 lives in the harden-context-history-integrity batch. Cross-batch concern; tracked here only, decided there.
- **Whether debug info should break out cost by call type vs just capturing usage.** Open decision.
- **Where input validation should live** (engine vs MCP tool wrapper). Both `mcp/tools/gameplay.js` and `engine/llm.js` receive user text; decide in design.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| llmTracker | Process-global singleton recording every LLM call (narration/extraction/summarization/embedding) | A per-adventure accounting ledger |
| session cost | `session_cost` reported by `dungeon_get_debug_info` — today only narration tokens | Total actual spend across all call types |
| debug_logs | Ring of `addDebugLog` strings | Per-adventure log |
| MOCK_LLM | Env flag `1` that swaps in `MockOpenAI` | The real OpenRouter path |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — in-repo diagnostic hygiene; no external code) | — | — | 2026-08-02 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| (none new) | — | — | 2026-08-02 |

## Patterns adopted

None external.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Whitespace-only action is accepted and spends an LLM call | Live `19c9445c`: `dungeon_send_action text:"   "` → full narration returned; history gained a user turn `> ` and an assistant turn | `dungeon_send_action` + `dungeon_inspect_history` | 2026-08-02 | stable |
| llmTracker is process-global across adventures | Live: after init-ing `a7acd174`, `dungeon_get_debug_info` still listed all 19 calls + cost from `19c9445c`, plus the new ones (ids 20-21); `backend_status.adventure_id` correctly = `a7acd174` | `dungeon_get_debug_info` before/after init | 2026-08-02 | stable |
| debug_logs interleave across adventures | `dungeon_get_debug_info` for `a7acd174` contained `19c9445c` logs (wandering trader card, flush turns 6,7) | `dungeon_get_debug_info` | 2026-08-02 | stable |
| Only narration entries carry non-zero tokens | Debug trace: extraction (ids 5,9,16,25), summarization (13,24), embedding (1,3,7,11,14,18,20,...), embedding_batch (6,10,17) all `input:0 output:0`; narration calls carry real token counts | `dungeon_get_debug_info` | 2026-08-02 | stable |
| session_cost understates spend by omitting extraction/summarization/embedding | Cumulative `$0.004108` for 31 calls of which 11 paid LLM calls (narration/extraction/summarization) — extraction+summarization counted at $0 | `dungeon_get_debug_info` | 2026-08-02 | stable |
| `mockOpenAI.js` emits a two-field status line | `mockOpenAI.js:51,57,85` → `[Status: Cantina | Score: 5]` (no Moves) | Code read | 2026-08-02 | stable |

## Unverified assumptions

- **That scoping the tracker per adventure is the right fix vs resetting on newAdventure.** #17 offers both; a per-adventure key also serves cost attribution, at the cost of memory growth. Decision for design.
- **That capturing usage from non-narration calls is straightforward** (usage may be missing on some providers/endpoints). Needs verification against OpenRouter responses.
- **That the whitespace-only case is the only validation gap** (e.g., text that is only newlines, or empty after `action_type: "continue"`). Only whitespace tested.

## Superseded claims

- **"`get_debug_info` returns debug information for the current session"** (tool description). Superseded: it returns process-lifetime aggregates. The description and behavior diverge.

## Dependency / staleness notes for future agents

- **This change is otherwise independent** of the other batches. Its only coordination point is the `engine/mockOpenAI.js` two-field status line, which #17 noted "worth aligning when #12 touches the parser" — so align it with `harden-context-history-integrity` (#12), not here.
- **The MCP server already gained `save_dir` in `backend_status`** (archived `fix-mcp-server-tooling`, #18). Do not re-add it; that part of diagnostics is done.
- **`dungeon_inspect_lore` staleness is already fixed** (also #18) — the "stale in-memory lore read" symptom noted in earlier research no longer applies to this batch.
- **Line-number references decay** (`engine/llmTracker.js`, `mcp/tools/gameplay.js`, `mcp/tools/diagnostics.js`, `engine/mockOpenAI.js`). Re-verify against HEAD.
- **Usage-capture reliability is unverified** across providers (OpenRouter returns usage for narration; embeddings may not). The design allows "capture-what's-available + honest labeling" — do not assume usage is always present.
- **Blank-action validation must happen before `formatUserInput`** in the engine, which currently turns `"   "` into `"> "` (a `>` prefix) — validating on the raw text only would miss the engine-side path.

## Links out

- `engine/llmTracker.js` — tracker implementation
- `mcp/tools/diagnostics.js` — `dungeon_get_debug_info`
- `mcp/tools/gameplay.js` — `dungeon_send_action` (input validation site)
- `engine/mockOpenAI.js` — two-field status line
- `openspec/specs/diagnostics-suite/spec.md` — diagnostics capability
- `openspec/specs/mcp-server/spec.md` — MCP server capability
