## Source material

### Architecture deepening review, candidate #7 (2026-08-03)

`harden-context-history-integrity` (commit `381296a`) landed: the engine commit path now parses the accumulated assistant text through the canonical `parseStatusLine` (`engine/llm.js:543`), `sanitizeForHistory` strips status-line-shaped lines and echoed `[CURRENT STATUS]`/`[CURRENT INVENTORY]` blocks before history/save/extraction (`engine/llm.js:85`), `moves` increments exactly once per turn, and the MCP tool reports `engine.moves` (`mcp/tools/gameplay.js`). `fix-score-progression` (`cc57cd3`) then made score engine-computed over extracted milestones, so the narrator's `Score:` claim is never committed (`engine/llm.js:545`).

**Residue remains — the format still does not have one parser and one producer.**

1. **Frontend strip is still non-canonical.** `web/static/js/ui/renderers.js:49` strips with a two-field regex `/\[Status:\s*(.*?)\s*\|\s*Score:\s*(\d+)\s*\]$/m` that doesn't know `Moves` exists — the last consumer that can disagree with what the engine committed (the engine keeps a three-field line; the browser would render its `Score:` half if the format ever drifts).
2. **Producers emit the two-field variant.** `engine/mockOpenAI.js:51,57,85` and the fallback opening scene `web/routes/game.js:343` emit `[Status: X | Score: N]` — not the canonical three-field line the presets declare. The parser tolerates the missing `Moves` (it's optional), which is exactly why the drift is invisible: mock mode passes while real mode declares three fields.
3. **Contract string still duplicated.** The format text lives in all four presets (`engine/storyPresets.js:9,21,33,45`), `DEFAULT_SYSTEM_PROMPT` (`engine/index.js:29,34,40,43`), and the frontend default custom-prompt textarea (`web/static/js/app.js:148`). `tasks.md 1.5` only *tests* that they agree; it doesn't give them one shared definition. Any single edit without the others is a silent drift.
4. **The MCP re-parse is now vestigial.** `mcp/tools/gameplay.js:66` still runs `parseStatusLine(rawNarration)`, but the narration was already sanitized (status line removed), so it mostly falls back to engine state anyway. A turn result carrying committed metrics would remove the path entirely (see candidate #1's read-through, and the transport collapse candidate #5).

### Raised but not acted on

- **Whether the contract string should be a shared exported constant (`STATUS_FORMAT`) consumed by presets, `DEFAULT_SYSTEM_PROMPT`, mock, and frontend.** Likely yes; the mechanism (an export from `engine/llm.js` or a new `engine/statusFormat.js`) is a design decision.
- **Whether the frontend should receive the canonical parser via a shared module** (no build step — this means duplicating a small regex or shipping the parser as a separate module). Flagged; the zero-build constraint shapes the answer.
- **The `[`-buffer withholding behavior itself.** The engine still withholds chunks containing `[` until stream end; it is now correct (buffer parsed through `parseStatusLine`), so the residual UX delay for legitimate `[` narration is out of scope here.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| canonical status line | The three-field `[Status: X | Score: N | Moves: N]` format | The two-field `[Status: X | Score: N]` variant |
| producer | A site that emits the status-line string (mock, fallback, presets) | A consumer that parses it |
| residue | Post-landing drift that keeps the format from having one parser + one producer | The landed engine commit path |
| contract string | The literal format text in prompts and defaults | The parser that reads it |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — in-repo status-parsing work; no external code) | — | — | 2026-08-03 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Shared `STATUS_FORMAT` constant exported from `engine/` | Open | Presets, `DEFAULT_SYSTEM_PROMPT`, mock, fallback, frontend default all reference one string | 2026-08-03 |
| Frontend strip via canonical (three-field) regex | Adopt | Minimal; matches the engine's committed format | 2026-08-03 |
| Mock/fallback emit the canonical three-field line | Adopt | Removes the real-mode-only field layout that hides drift | 2026-08-03 |
| Turn returns committed metrics; MCP drops the re-parse | Defer to #1/#5 | Cross-cutting; noted as dependency | 2026-08-03 |

## Patterns adopted

From prior in-repo work: `parseStatusLine` is already shared between `engine/llm.js` and `mcp/tools/gameplay.js` and enforced by a source-text test (`tests/test_shared_status_parser.py`). Extend the same "one definition, tested for agreement" discipline to the producing sites.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Engine commit path uses canonical parser | `engine/llm.js:543` `parseStatusLine(assistantText)` | Code read | 2026-08-03 | stable |
| `sanitizeForHistory` strips status lines + CURRENT blocks | `engine/llm.js:85` | Code read | 2026-08-03 | stable |
| Frontend strip is two-field | `renderers.js:49` `/\[Status:...Score:\s*(\d+)\s*\]$/m` | Code read | 2026-08-03 | stable |
| Mock emits two-field | `mockOpenAI.js:51,57,85` | Code read | 2026-08-03 | stable |
| Fallback opening scene emits two-field | `web/routes/game.js:343` | Code read | 2026-08-03 | stable |
| Contract string in presets ×4 + `DEFAULT_SYSTEM_PROMPT` + `app.js:148` | `storyPresets.js:9,21,33,45`; `index.js:29,34,40,43`; `app.js:148` | Code read | 2026-08-03 | stable |
| MCP re-parse is now vestigial | `mcp/tools/gameplay.js:66` on already-sanitized narration | Code read | 2026-08-03 | stable |

## Unverified assumptions

- **That no test currently depends on the two-field mock line rendering in the browser.** `test_barter_ui.py` / `test_menu_navigation.py` may snapshot status text; check before changing the mock emit.
- **That a shared `STATUS_FORMAT` constant is reachable by the frontend without a build step.** The frontend loads native ESM from `express.static`; sharing the constant across the engine/web boundary needs the path under `web/static/` — verify the import path works.

## Superseded claims

- **"The status line format is fully unified."** Superseded by code read post-landing: the engine side is unified, but producing/consuming sites outside `llm.js` still carry the two-field variant and duplicated contract text.

## Links out

- `engine/llm.js:31,85,543` — canonical parser + sanitizer + commit
- `engine/index.js:29,34,40,43` — `DEFAULT_SYSTEM_PROMPT` contract text
- `engine/storyPresets.js:9,21,33,45` — preset contract text
- `engine/mockOpenAI.js:51,57,85` — two-field emit
- `web/routes/game.js:343` — two-field fallback
- `web/static/js/ui/renderers.js:49` — two-field strip
- `web/static/js/app.js:148` — default prompt contract text
- `mcp/tools/gameplay.js:66` — vestigial re-parse
- `openspec/changes/archive/2026-08-03-harden-context-history-integrity/` — the landed change
- `openspec/changes/archive/2026-08-03-fix-score-progression/` — score authority
