## Source material

### Architecture deepening review, candidate #5 (2026-08-03)

The same engine call is expressed twice per concept — once as an HTTP route, once as an MCP tool (offers, trade, goals, inventory, events, stats, saves). Within a single transport the boilerplate is also duplicated:

**SSE narration flow, written three times inside `web/routes/game.js`.**
- `/action` (`web/routes/game.js:394-401`)
- `/trade` (`web/routes/game.js:515-526`)
- `/goals/complete` (`web/routes/game.js:612-623`)

Each repeats the same SSE header block and the same `for await (const event of stream) res.write(...)` forwarder. And two of the three streams are produced but never consumed: `web/static/js/components/barterModal.js` only checks `res.ok` on the raw `Response` and discards the body, so the entire narrated trade/goal-complete stream is computed server-side and dropped on the floor.

**MCP tool layer is uniformly thin.** Verified counts across `mcp/tools/*.js`:
- 17 `isError: true` error envelopes
- 13 "No active adventure. Call dungeon_init_session first." guards
- ~35 `JSON.stringify(..., null, 2)` text envelopes

The per-tool logic that isn't boilerplate is field reshaping and arg clamping — genuinely small. Deletion test: deleting any one envelope concentrates nothing; a shared `toolResult(obj)`/`guard(engine)` helper absorbs it all without moving logic.

**Divergence within the shared helper set.** The `forceFlushBeforeRead` twin (see candidate #1) is the most concrete instance of a concept expressed twice with subtly different semantics — the web copy resolves the model from `engine.model`, the MCP copy awaits `engine.getLoadedModel()`; one propagates errors, the other swallows them.

### Raised but not acted on

- **Whether the `/api/trade` and `/api/goals/complete` streams should be consumed by the frontend or removed.** The stream exists server-side; the frontend ignores it. This change should force the decision (consume or drop deliberately), not silently keep a dead path.
- **Whether MCP tool args should be auto-generated from zod schemas.** Out of scope; the envelope/guard collapse is the change.
- **The `GET /state` field list is re-declared in `web/routes/game.js:236-255`, `mcp/tools/state.js:34-45`, and partially in `mcp/tools/diagnostics.js`.** Flagged as a secondary source of the same duplication.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| transport | A caller boundary: HTTP routes or MCP tools | The engine itself |
| SSE forwarder | The `for await ... res.write("data: " + ...)` loop | The engine's generator that produces events |
| tool envelope | The `{content:[{type:"text",...}], isError}` wrapper | The tool's domain logic |
| dead stream | An SSE narration flow produced but never parsed by the frontend | A stream the UI consumes |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — in-repo HTTP/stdio wiring; no external code) | — | — | 2026-08-03 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Shared `streamEvent(gen, res)` SSE forwarder | Adopt | One place for header + write + error handling | 2026-08-03 |
| Shared `toolResult(obj)` / `guard(engine)` helpers | Adopt | Removes 17 envelopes + 13 guards; tool files declare only handlers | 2026-08-03 |
| Auto-wrap every route/tool through a small `withEngine(handler)` | Open | Elegant but touches every handler signature; evaluate in design | 2026-08-03 |

## Patterns adopted

From prior in-repo work: `mcp/tools/gameplay.js:9` already imports `parseStatusLine` from `engine/llm.js` — the one concept successfully de-duplicated across transports, enforced by a source-text test (`tests/test_shared_status_parser.py`). Extend that discipline to the SSE forwarder and the tool envelope.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| SSE narration flow repeated three times in `routes/game.js` | `/action`, `/trade`, `/goals/complete` | Code read | 2026-08-03 | stable |
| Trade/goals streams not consumed by frontend | `barterModal.js` checks `res.ok` only, discards body | Code read | 2026-08-03 | stable |
| 17 `isError` envelopes across MCP tools | grep count across `mcp/tools/*.js` | Code read | 2026-08-03 | stable |
| 13 "No active adventure" guards | grep count | Code read | 2026-08-03 | stable |
| Same engine call expressed as both route and tool | offers/trade/goals/inventory/events/stats/saves | Code read | 2026-08-03 | stable |
| `forceFlushBeforeRead` diverges between web and MCP | model resolution + error policy differ | Code read | 2026-08-03 | stable |

## Unverified assumptions

- **That collapsing the SSE forwarder won't change wire-visible behavior.** Tests assert raw `"type": "chunk"` in stream text (`test_api_endpoints.py`), so byte-level framing must be preserved. Verify with the existing SSE tests.
- **That the MCP SDK tolerates a single shared result helper.** The envelope shape is standard MCP; low risk, but confirm with `test_mcp_protocol.py`.

## Superseded claims

- **"MCP tools each carry meaningful per-tool logic."** Superseded by code read: per-tool logic is field reshaping; the bulk is duplicated envelope/guard boilerplate.

## Links out

- `web/routes/game.js:394,515,612` — three SSE forwarders
- `web/static/js/components/barterModal.js` — `res.ok`-only consumer
- `mcp/tools/*.js` — envelope/guard boilerplate
- `web/routes/memory.js:6` / `mcp/tools/memory.js:18` — divergent flush twins
- `tests/test_shared_status_parser.py` — the de-dup discipline to extend
- `tests/test_api_endpoints.py` — SSE framing assertions
