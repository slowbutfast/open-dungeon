## Source material

### Architecture deepening review, candidate #4 (2026-08-03)

The `AdventureEngine` facade is a shallow seam: it exposes ~24 pass-through accessors and 9 barter/goal proxies that mirror `BarterEngine` 1:1, but it does not hide the memory subsystem at all. Callers reach through it to get basic facts:

- `web/routes/memory.js:66` — three hops to `engine.memory.structuredStore.upsertInventoryItem(engine.adventureId, {...})`.
- `mcp/tools/state.js:111` — dives to `engine.memory.structuredStore.getLore(engine.adventureId)`.
- `mcp/tools/diagnostics.js:37` — pokes the sqlite handle itself: `engine.memory?.structuredStore?.db?.name`.
- `engine/llm.js:280` (pre-gate) — reaches through `contextManager.memoryManager.getInventory`.

Each reach-in encodes knowledge of the internal store shape (`structuredStore` exists at `engine.memory.structuredStore`, the handle is `.db`) in a caller that should only know the Adventure's interface. The "interface is the test surface" principle is violated: tests and tools must navigate internals to assert what should be facade-level behavior.

**Wiring is done by mutation, not construction.** `engine/index.js:66-70`:
```
const embeddingService = new EmbeddingService(this.llm.client);
this.memory = new MemoryManager(dataDir, this.llm.client, embeddingService);
this.context.memoryManager = this.memory;
this.barter = new BarterEngine(this.memory.structuredStore);
this.memory.barter = this.barter;
```
`context.memoryManager` and `memory.barter` are mutable fields assigned after construction (and, per candidate #2, the second `BarterEngine` orphans the first).

**Engine lifecycle is unexamined.** `web/engineInstance.js` (8 lines) holds a process-wide mutable singleton wiped by `resetEngine()` on every `/init` (`web/routes/game.js:283`). Whether the engine is process-global or per-Adventure is never decided — the facade is the only module that should know, and it doesn't decide.

### Raised but not acted on

- **Whether to introduce a real engine factory / DI container.** Flagged; the minimal fix is constructor injection of the already-constructed collaborators, not a container.
- **Whether `resetEngine` should construct a fresh engine rather than mutating the singleton.** Decided to leave lifecycle semantics unchanged here; only the reach-ins and wiring are in scope.
- **The `llm.js:280` pre-gate reach.** It bypasses the facade; folding it into the facade is in scope, but the pre-gate's placement inside the LLM orchestrator may need to move during the LLM-adapter change (#3) — coordinate.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| facade | `AdventureEngine`'s public interface to web routes, MCP tools, and the LLM orchestrator | An accessor block that forwards to `this.state.*` |
| reach-in | A caller walking `engine.memory.structuredStore.<method>` instead of an engine method | A facade method call |
| wiring | How `memory`/`context`/`barter` collaborators are connected | The collaborators' own behavior |
| engine lifecycle | Whether the engine is process-global or per-Adventure | Save-file persistence |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none — in-repo orchestration work; no external code) | — | — | 2026-08-03 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Facade methods for the operations callers actually use (`getLore`, `upsertInventoryItem`, `getStats`) | Adopt | Routes/tools stop knowing the store shape | 2026-08-03 |
| Constructor DI for `memory`, `context`, `barter` | Adopt | Kills the mutable-field wiring and the double-`BarterEngine` construction (with #2) | 2026-08-03 |
| Extract a `MemoryFacade` class | Reject | The engine already is the natural facade; an extra layer is indirection | 2026-08-03 |

## Patterns adopted

From prior in-repo work: the facade's existing barter proxies (`engine/index.js:240-273`) show the shape — one-line methods that inject `this.state.adventureId`. Extend that shape to memory operations instead of routing around it.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Route reaches `engine.memory.structuredStore.upsertInventoryItem` | `web/routes/memory.js:66` | Code read | 2026-08-03 | stable |
| Tool reaches `engine.memory.structuredStore.getLore` | `mcp/tools/state.js:111` | Code read | 2026-08-03 | stable |
| Diagnostics reads the sqlite handle | `mcp/tools/diagnostics.js:37` (`structuredStore?.db?.name`) | Code read | 2026-08-03 | stable |
| LLM orchestrator reaches `contextManager.memoryManager.getInventory` | `engine/llm.js:280` | Code read | 2026-08-03 | stable |
| Wiring via mutable field assignment | `engine/index.js:66-70` | Code read | 2026-08-03 | stable |
| Engine singleton lives in `web/engineInstance.js`, wiped by `resetEngine` | `web/routes/game.js:283` | Code read | 2026-08-03 | stable |
| Facade accessors are pure pass-through | `engine/index.js:73-122` | Code read | 2026-08-03 | stable |

## Unverified assumptions

- **That no caller depends on mutating the internal fields directly** (e.g. tests that set `engine.memory` or `engine.barter`). The test suite drives through HTTP/MCP, so this is likely safe, but grep before removing the fields.
- **That constructor DI won't break the `contextManager.memoryManager` back-reference** the summarization path uses. Design must thread the reference without circular construction.

## Superseded claims

- **"The facade hides the memory subsystem."** Superseded by code read: it forwards state accessors but exposes reach-ins for memory operations; the encapsulation is illusory.

## Links out

- `engine/index.js:66-70` — wiring
- `engine/index.js:73-122` — accessor block
- `engine/index.js:240-273` — barter proxies
- `web/routes/memory.js:66` — 3-hop reach-in
- `mcp/tools/state.js:111` — `getLore` reach-in
- `mcp/tools/diagnostics.js:37` — sqlite handle
- `engine/llm.js:280` — pre-gate reach-in
- `web/engineInstance.js` — singleton
- `web/routes/game.js:283` — `resetEngine`
