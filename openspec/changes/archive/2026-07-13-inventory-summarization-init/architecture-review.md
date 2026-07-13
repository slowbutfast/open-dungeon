# Architecture Review — `inventory-summarization-init/architecture.md`

Overall the doc is clear, well-structured, and aligned with the proposal. However, comparing it against the current code surfaces several gaps and logical tensions worth addressing before implementation.

## Accuracy vs. current code

- **Diagram is aspirational, not current.** It shows `web/routes/memory.js` calling `flushIfReady(state, model, saveFn, { force: true })`, but the route today (`web/routes/memory.js:11`) only calls `engine.getInventory()` — no flush, and `flushIfReady` has no `options` parameter (`engine/memory/memoryManager.js:46`). The doc should label the diagram as the target state, or readers will assume the wiring exists.
- **`getInventory` call signature.** Diagram shows `Express->>DB: getInventory(adventureId)`, but the route calls `engine.getInventory()` with no arg (`web/routes/memory.js:11`). Minor, but the diagram implies a direct DB call from the route layer that doesn't match reality.

## Logical gaps in the decisions

- **Decision 2 vs. Decision 3 conflict (most important).** Decision 3 says the `isFlushing` lock makes `flushIfReady` *immediately exit* if a flush is in progress. But Decision 2's rationale is "Guarantees up-to-date inventory… whenever the client accesses them." Those two are incompatible: if a background flush is mid-flight when the user clicks inventory, the force-flush returns immediately, the route queries the DB, and the response reflects the *pre-flush* state. The freshness guarantee is silently broken precisely when contention exists. Consider awaiting the in-flight promise (store it on the instance and `await` it) rather than bailing — that preserves both the de-dup guarantee and freshness. The risk section only addresses duplicate flushes, not stale reads.
- **Decision 1 latency vs. Decision 2 latency tension.** Decision 1 rejects synchronous extraction in `/api/init` because it adds 5–10s. Decision 2 accepts the same 5–10s blocking LLM call inside every `GET /api/memory/inventory` request. The non-goals say "no synchronous vector DB updates in blocking server loops," but the LLM extraction itself *is* synchronous in the request path and is the expensive part. This trade-off needs to be stated explicitly — and ideally mitigated (e.g., only force-flush when `turnBuffer.length > 0`, which the doc's risk section implies but Decision 2 doesn't state).
- **Decision 2 coverage is inconsistent.** It lists `/api/memory/inventory`, `/api/memory/events`, and `/api/memory/stats`, but `web/routes/memory.js` also exposes `POST /memory/search` (`web/routes/memory.js:31`). Search reads the vector store, which is populated by the same flush. Omitting it means search results can lag inventory/events. Either justify the omission or include it.

## Decision 4 (moves parsing) concerns

- **Two regex call sites, not one.** `engine/llm.js` has separate status-line parsers at `engine/llm.js:354` (streaming buffer path) and `engine/llm.js:365` (non-buffer path). Task 3.2 refers to "the status line parser" singular — both need updating or one code path will regress.
- **Required-Moves regex is a breaking change.** Task 3.2's regex `…| Moves: (\d+)$` makes Moves mandatory. But `engine/mockOpenAI.js:51` emits `[Status: Cantina | Score: 5]` with no Moves field, and every existing preset in `engine/storyPresets.js` shows examples without Moves. Once the regex requires Moves, the mock falls into the no-match branch and any saved-handshake/snapshot tests break. Either (a) make Moves optional via `(\s*\|\s*Moves:\s*(\d+))?` and fall back to `+= 1`, or (b) explicitly add a task to update `mockOpenAI.js` and any fixtures. Neither is in `tasks.md`.
- **Fallback behavior is unspecified.** Today `state.moves += 1` always advances deterministically (`engine/llm.js:358,362,369,372`). Switching to overwrite-from-LLM means a malformed/omitted Moves field could freeze the counter. The doc should state the fallback (increment? keep previous? 0?) for both the streaming and non-buffer branches.
- **`[CURRENT INVENTORY]` is referenced but never injected.** The proposals and `storyPresets.js` already say "Only use items in the player's [CURRENT INVENTORY]", but `engine/llm.js:125` only injects `[CURRENT STATUS]` (location/score/moves) into the system content — there is no `[CURRENT INVENTORY]` block. Adding "strict rules to deny nonexistent items" without actually populating the inventory section in the prompt means the model still can't enforce it. This needs an explicit task (inject inventory from `structuredStore.getInventory` into the system prompt) or Decision 4 should drop that claim.

## Diagram polish

- The sequence diagram only shows the happy path. Adding an `alt` for "buffer empty → skip extraction" and "isFlushing → skip extraction" would visually mirror the risk/mitigation discussion and make the lock behavior legible.
- `Memory->>DB: upsertInventoryItem() & insertEvent()` — these are calls on `structuredStore`, not the DB directly. Minor, but the participant is labeled "SQLite / Vector DB" while the described calls hit only the structured store; the vector upsert path (`vectorStore.upsertDocuments`) is omitted despite being part of `_extractAndStore`.

## Missing items

- No mention of `engine/memory/structuredStore.js` or `eventExtractor.js` changes — likely intentional, but worth a one-liner in "Files Affected" (the proposal lists files; the arch doc doesn't) so reviewers can scope the blast radius.
- No rollback/failure semantics for the forced flush: if the LLM call throws inside a GET request, does the route still return last-known DB state (`memoryManager.flushIfReady` already swallows errors in the `catch` at `engine/memory/memoryManager.js:61`), or 500? Worth stating given Decision 2 puts extraction in the read path.

## Suggested minimum edits

1. State that the diagram depicts the *target* state.
2. Reconcile Decision 2's freshness guarantee with Decision 3's bail-on-lock (await vs. exit).
3. Make Moves regex optional or add a task to update `mockOpenAI.js` + preset examples.
4. Enumerate both regex sites in Task 3.2.
5. Specify moves-counter fallback when the LLM omits Moves.
6. Either add inventory injection to the system prompt or drop the "deny nonexistent items" claim from Decision 4.
7. Decide explicitly whether `/memory/search` force-flushes, and state the latency trade-off of Decision 2 in Risks.