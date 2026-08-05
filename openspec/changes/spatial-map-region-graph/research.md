## Source material

Whiteboard exploration with the peer engineer (2026-08-04), condensed:

- The feature is **"spatial mapping for each session so that areas explored get deterministically saved, so backtracking or returning to a previous area maintains consistency."**
- Consensus reached during exploration:
  - The world is modeled as a **directed graph of rooms and edges**; nodes are locations, edges are paths/traversals.
  - Edges are added **on discovery** (traversal or explicit new route), never by assumption.
  - **Reverse inference in v1**: when a traversed edge has a *reversible* direction (cardinal, up/down, in/out), the engine adds the implied reverse edge as `inferred=1` so deterministic backtracking works on the first return trip. One-way verb-phrases (slide/fall/teleport) get no reverse.
  - **The map never blocks movement and never hallucinates connectivity.** The engine only *canonicalizes identity* (name → node); when the player re-traverses a confirmed edge and the narrator proposes a different name, **first visit wins** — the engine adopts the known room's canonical name. Contradiction on an `inferred` edge **self-heals**: retract the inferred edge and grow a new one.
  - **Teleports/portals/story jumps are real edge kinds**: `kind = 'walk' | 'portal' | 'time'`. Portal = labeled mechanism crossing a seam (archway, ship, gate); no reverse inference. Time = temporal displacement that *mutates world state*; no reverse, ever. Pure reposition ("wake up in a cell") = no edge at all. `classifyTransition(action)` returns the kind; unknown/no-signal defaults to "no edge" (never fabricate connectivity).
  - **`resolve(proposedName)` (name→node) is the load-bearing soft spot**: v1 uses exact canonical matching (normalize + stem-aware, same regime as `itemNamesMatch`); the accepted failure mode is "same place, different name → duplicate node + duplicate region component." **Fuzzy/vector matching is explicitly deferred to phase 2.**
  - **Session versioning in the adventure ID was explicitly dropped** (not needed; separate future change).
  - **Undo must restore `currentRoomId`** — this is the map's bug to fix, via a `room_visits`-style table that also feeds re-anchor staleness.
  - The **`[MAP CONTEXT]` and re-entry anchor prompt blocks** land against the `structured-narrator-context` registry (a prerequisite change, created 2026-08-04) — zero sanitizer edits, no new injection surface.

### Raised but not acted on

- **Fuzzy/vector name matching**: deferred to phase 2 (documented as a known limitation, not a bug).
- **`dungeon_path_to` / BFS pathfinding**: valuable payoff of the graph, but deferred to phase 2 — v1 ships the graph + reconciliation + inspection tools only.
- **`dungeon_navigate` (LLM-free movement along known edges)**: deferred to phase 2.
- **Frontend map render** (region clusters, dashed inferred edges, time-arrow strokes): deferred to phase 2+; v1 is engine + MCP + minimal API.
- **Items-at-location / NPC tracking / dropped-item persistence**: phase 3, explicitly out of scope.
- **Retrofitting `events.location` / `inventory.acquired_at` free-form name fields to room ids**: deferred; they remain names, not ids.
- **Temporal re-anchor "time twist"** (re-enter a room last seen before a time edge → prompt narrator to acknowledge the passage of time): noted as a phase-2 refinement, not v1.
- **Closed-region flags** (mark an old region unreachable forever): plain persistence is enough for v1.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| Room | A graph node: a named, canonically-identified location | The `[CURRENT STATUS]` location string, which is a display name resolved from the room |
| Walk edge | A traversable path between rooms; the only kind reverse-inference applies to | A portal or time edge |
| Inferred edge | A reverse edge the engine added without the player walking it (from a reversible direction) | A traversed/confirmed edge |
| `resolve(proposedName)` | The name→node lookup used by every reconciliation case | Fuzzy/vector matching (phase 2) |
| Re-entry anchor | Phase-2 prompt injection that re-anchors the narrator to a known room's canonical name/description | The engine's hard state canonicalization (v1) |
| Region / component | A connected set of rooms reachable by walk edges only; teleports/time edges cross region boundaries | A named area in the fiction |
| `classifyTransition(action)` | Action-text classifier returning `walk \| portal \| time \| unknown` | The direction parser (which returns a direction label or null) |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| (none external — this change is grounded in existing in-repo memory/graph patterns: the barter engine and structured store) | | | |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Graph database / external store | Rejected | SQLite via better-sqlite3 already exists and holds the memory layer; a room graph is a few tables, not a reason for a new store | 2026-08-04 |
| In-memory-only map (no persistence) | Rejected | The whole point is deterministic persistence across save/load and backtracking | 2026-08-04 |
| New npm dependency | Rejected | None needed; the codebase is dependency-light by design | 2026-08-04 |
| SQLite tables in the existing `structuredStore.js` (schema-owner pattern) | Adopted | Follows `memory-schema-boundary` precedent: single schema owner, guarded migrations, full rollback surface | 2026-08-04 |
| Pure reconciliation module (`engine/memory/roomMap.js`) | Adopted | Same shape as `scoring.js` / `parseStatusLine` — unit-testable without an LLM | 2026-08-04 |

## Patterns adopted

- **Schema-owner + thin engine** (from the barter/quest engine): `structuredStore.js` owns the tables and access methods; a `RoomMap` module is the thin state machine; `AdventureEngine` proxies. Public MCP/engine surfaces unchanged in shape.
- **Engine-authoritative, narrator-advisory** (from score/moves): the engine owns `currentRoomId`; the narrator's status-line location is a *proposal* the engine reconciles.
- **Canonical-name matching** (from `itemNames.js`): `normalizeRoomName` / `roomNamesMatch` for `resolve()`.
- **Full-surface turn-index rollback** (from `make-undo-and-trades-consistent`): rooms/exits/visits carry `turn_index`/`discovered_turn` and join `rollbackTurn` with the `IS NOT NULL` guard.
- **Read-through freshness** (from `memory-freshness-read-through`): `dungeon_inspect_map` / `dungeon_inspect_room` reuse the shared `forceFlushBeforeRead` helper rather than rebuilding per-tool flush ceremony.
- **Action-text parsing precedent** (`trade X for Y` pre-action gating in `engine/llm.js`): the direction/transition lexicon mirrors this.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `state.location` is committed from the parsed status line after `isSuspiciousStatus` | `engine/llm.js:610-612` | Read source | 2026-08-04 | low |
| `moves` increments exactly once per completed turn | `engine/llm.js:613` | Read source | 2026-08-04 | low |
| `bufferTurnPair` keys the turn buffer by `state.moves` after increment | `engine/llm.js:646-652` | Read source | 2026-08-04 | low — spatial rows must stamp the same index |
| `state` is `AdventureState` (`engine/state.js`); `location` is a plain string persisted in the save JSON; save/load is JSON round-trip | `engine/state.js:6-47` | Read source | 2026-08-04 | low |
| `AdventureState.undo()` pops history pairs only — it does NOT restore `location`/score | `engine/state.js:129-139` | Read source | 2026-08-04 | low |
| `engine.undo()` rolls back the store (`rollbackTurns`) and recomputes score but does not restore `location` | `engine/index.js:178-198` | Read source | 2026-08-04 | low — the map turns this into a dangling `currentRoomId` |
| `structuredStore.js` owns all memory tables + schema + guarded `ALTER TABLE` migrations + `rollbackTurn` | `engine/memory/structuredStore.js:36-149, 512-559` | Read source | 2026-08-04 | low |
| `rollbackTurn` deletes rows with `turn_index >= N`; narration-created lore/offers/goals use `turn_index IS NOT NULL` so hand-created rows survive | `engine/memory/structuredStore.js:548-557` | Read source | 2026-08-04 | low |
| `MemoryManager.rollbackTurns` also removes vector ids for rolled-back events | `engine/memory/memoryManager.js:482-498` | Read source | 2026-08-04 | low |
| `isSuspiciousStatus` rejects mechanical-vocab location names before commit | `engine/llm.js:70-125` | Read source | 2026-08-04 | low |
| `itemNames.js` exports `normalizeItemName` / `itemNamesMatch` (canonical, stem-aware) used across memory/barter | `engine/memory/itemNames.js` | Read source | 2026-08-04 | stable |
| The shared `forceFlushBeforeRead` helper lives in `mcp/tools/memory.js`; memory tools are thin reads over it | `mcp/tools/memory.js` | Read source | 2026-08-04 | stable |
| MCP tools are registered by category files under `mcp/tools/` | `mcp/tools/index.js` + `session/gameplay/state/memory/barter/diagnostics.js` | Read source | 2026-08-04 | stable |
| The `[CURRENT STATUS]` block (the re-anchor / `[MAP CONTEXT]` injection seam) is composed in `buildSystemMessage` | `engine/llm.js:308` | Read source | 2026-08-04 | medium — prerequisite change makes it registry-driven |
| The event extractor already emits `location`-type lore cards (the pre-existing "soft" spatial memory) | `engine/memory/eventExtractor.js` (type `location`) | Read source | 2026-08-04 | low |
| The block registry change (`structured-narrator-context`) is created and validated | `openspec/changes/structured-narrator-context/` | Read change artifacts | 2026-08-04 | stable — this change depends on it |

## Unverified assumptions

| Assumption | Cost to check |
| :--- | :--- |
| Old saves (no `current_room_id` field) load cleanly — `AdventureState.load` tolerates a missing field | Check `state.load` handles undefined; likely yes (uses `||` defaults) but needs a test fixture |
| The narrator occasionally emits a new location with no direction signal (teleport/reposition); the no-edge fallback is the correct behavior | Run a real session and inspect status-line transitions |
| SQLite writes on the hot turn path (a few upserts per turn) are negligible | Better-sqlite3 is synchronous and micro-fast; verify with a MOCK session timing run |
| The direction lexicon's coverage (verbs → direction) is sufficient for typical movement actions | Playtest; gaps degrade to name-only reconciliation, never break a turn |
| Stamping spatial rows with `state.moves` stays consistent with `bufferTurnPair` across undo/redo | Covered by rollback tests; verify ordering in the turn-commit path |

## Superseded claims

| Was believed | Why it was wrong | Replaced by |
| :--- | :--- | :--- |
| The map should be an undirected graph | Exploration concluded directed edges with lazy reverse inference fit reality better (one-way passages, portals, time edges) | Directed graph with `inferred` reverse edges |
| A "hard map" that vetoes the narrator's movement | The map never blocks movement; it only canonicalizes identity and grows new edges | Reconciliation grows at will; only re-traversal of a confirmed edge canonicalizes the name |

## Links out

- `openspec/changes/structured-narrator-context/` — prerequisite: block registry that the `[MAP CONTEXT]` / re-entry blocks land against.
- `engine/ARCHITECTURE.md` — memory-schema-boundary, full-surface rollback, read-through freshness patterns this change extends.
- `openspec/changes/archive/2026-08-03-memory-schema-boundary/` and `2026-08-03-close-prompt-injection-backdoor/` — schema-owner and injection-defense invariants.
- `openspec/specs/game-engine/spec.md`, `openspec/specs/mcp-server/spec.md`, `openspec/specs/context-compression/spec.md` — capabilities this change modifies.
