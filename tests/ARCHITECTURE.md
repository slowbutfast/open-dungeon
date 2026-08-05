# Test Architecture

> **Deprecated:** The Python CLI proxy (`game/adventure_engine.py`) and its
> tests (`test_cli_behavior.py`, `test_pty_integration.py`,
> `simulate_playtest.py`) are **deprecated**. They may fail and are not
> required to pass. Focus on the Node.js backend (`engine/`) and E2E tests
> (`tests/e2e/`).

## Test Files

| File | Type | Marker | What it tests |
|------|------|--------|---------------|
| `test_api_endpoints.py` | Integration (unittest) | `integration` | REST API endpoints under `MOCK_LLM=1` — init, state, action streaming, system prompt, summary, lore CRUD. Spawns a Node.js server on port 5001. |
| `test_memory_features.py` | Integration (unittest) | `integration` | Memory extraction pipeline — inventory, events, lore, stats, and RAG search. Spawns a Node.js server on port 5002. |
| `test_barter_engine.py` | Integration (unittest) | `unit` | Barter trade execution and NPC quest goal state machine via HTTP API. Spawns a Node.js server on port 5005. |
| `test_cli_behavior.py` | Unit (unittest) | `unit` | CLI modules in isolation — layout rendering, input handling, lore menus, load/save menus, autoplay, history cycling, suggestions. No server required. **(Deprecated — excluded from `test:all`)** |
| `test_pty_integration.py` | Integration (unittest) | `integration` | CLI in a pseudo-terminal — verifies system menu clears screen. **Skipped** (CLI deprecated). **(Deprecated — excluded from `test:all`)** |
| `simulate_playtest.py` | Integration (unittest) | `integration` | Full CLI gameplay simulation through mocked menus and inputs. **(Deprecated — excluded from `test:all`)** |
| `test_live_llm.py` | Integration (pytest) | `integration` | Live OpenRouter LLM call validation. Requires `OPENROUTER_API_KEY`. |
| `test_openrouter_models.py` | Integration (unittest) | `integration` | OpenRouter model listing and selection. Network-dependent. |
| `test_mcp_barter.py` | Integration (unittest) | `integration` | MCP barter/quest tools — offers, trades, goals. Spawns MCP stdio subprocess. |
| `test_mcp_diagnostics.py` | Integration (unittest) | `integration` | MCP diagnostics tool — debug info, LLM traces, cost. Spawns MCP stdio subprocess. |
| `test_mcp_gameplay.py` | Integration (unittest) | `integration` | MCP gameplay tools — send action, undo. Spawns MCP stdio subprocess. |
| `test_mcp_memory.py` | Integration (unittest) | `integration` | MCP memory/inventory tools — inspect inventory, events, stats, search. Spawns MCP stdio subprocess. |
| `test_mcp_protocol.py` | Integration (unittest) | `integration` | MCP protocol compliance — tool discovery, schemas, error handling. Spawns MCP stdio subprocess. |
| `test_mcp_spatial.py` | Integration (unittest) | `integration` | MCP spatial map tools (`spatial-map-region-graph`) — `dungeon_inspect_map` (rooms/edges/current room/regions) and `dungeon_inspect_room` (room detail, outgoing/incoming edges, last visit), plus post-turn freshness. Spawns MCP stdio subprocess. |
| `test_mcp_session.py` | Integration (unittest) | `integration` | MCP session tools — init, list saves, load save. Spawns MCP stdio subprocess. |
| `test_mcp_state.py` | Integration (unittest) | `integration` | MCP state tools — inspect state, history, lore. Spawns MCP stdio subprocess. |
| `test_mcp_tools.py` | Integration (unittest) | `integration` | Comprehensive MCP tool handler tests — all 18 tools. Spawns MCP stdio subprocess. |
| `test_scoring.py` | Mixed (unittest + node probe) | — / `integration` | Engine-driven score progression (`fix-score-progression`): pure `scoreRule` unit tests via a Node probe plus MCP integration for score advancement, save/load round-trip, 10+ turn non-frozen regression (#19), and undo-score recompute. |
| `unit/*.test.mjs` | Unit (node:test) | — | The **unit seam** (`architecture-deepening-sequence`): module-level `node:test` tests for `StructuredStore` (canonical matching + full-surface rollback), `MemoryManager` (read-through freshness + flush dedup), `BarterEngine` (single matching regime + single instance per engine), and the turn-commit path (`isSuspiciousStatus`, `sanitizeForHistory`). Run via `npm run test:unit`. Backed by temp dirs under `os.tmpdir()` (`helpers.test-utils.mjs`). The three read-through freshness tests went green when #26 (`memory-freshness-read-through`) landed; the full-surface rollback and single-`BarterEngine`-instance tests went green when #27 (`memory-schema-boundary`) landed. `migration.test.mjs` (added by #27) exercises the guarded `turn_index` `ALTER TABLE` migration on a legacy-schema temp DB. `llmAdapter.test.mjs` (added by #28) pins the intent-keyed mock contract — each intent maps to its canned response regardless of prompt wording — the streaming-narration return shape, and the tracker kind labels; it went green when #28 (`llm-adapter-unification`) landed. The spatial suite (`spatial-map-region-graph`) adds: `roomMap.test.mjs` (transition classification, direction parsing, canonical room-name matching, every D3 decision-table branch, graceful degradation, `computeRegions`), `structuredStore.spatial.test.mjs` (new `rooms`/`exits`/`room_visits` tables, the `UNIQUE(adventure_id, from_room, direction)` constraint, `rollbackTurn` coverage of all three tables + hand-created-row survival), `spatialUndo.test.mjs` (old-save `currentRoomId` null tolerance, save/load round-trip, undo restoring the pre-turn room via the visits trail), and `spatialIntegration.test.mjs` (scripted west→north→east→south mock narration forming the expected graph with a deterministic return, save/load round-trip, and old-save load establishing the room from `location`). |
| `test_extractor_validation.py` | Mixed (unittest + node probe) | — / `integration` | Extractor output validation (`validate-memory-extraction`): `validateExtractorOutput` schema checks, trigger-token filtering, `normalizeInventoryChange` quantity parsing, canonical/stem name matching on write+read, and second-person summarization. Node probes for pure engine logic + MCP integration guards for mock-mode survival. |
| `test_injection_defense.py` | Mixed (unittest + node probe) | — / `integration` | Prompt-injection defense (`close-prompt-injection-backdoor`): re-runs the four-step #15 reproduction (injection → persistence → lore card → re-arm) in mock/replayable mode — dumped system-prompt metadata not persisted, forged status (`Admin Room`/`Score: 9999`) not committed, `isSuspiciousStatus` guard, `<player_action>` delimiter framing, poisoned lore card rejected by extraction validation, and `dungeon_delete_lore_card` escape hatch (store + `state.cards`). |
| `test_engine_status_parsing.py` | Mixed (unittest + node probe) | — / `integration` (MCP class) | Engine status parsing + history sanitization (`harden-context-history-integrity`): commit-from-last-status-line with trailing content, fragmented mock stream commit, sanitized history/save/summary, single-owner moves, and the 5-prompt status-format contract. Since `status-line-contract-residue` (#32), it also pins the shared `STATUS_FORMAT` constant and source-text contract tests asserting every producer (`mockOpenAI.js`, `web/routes/game.js` fallback, `app.js` default) and the frontend strip (`renderers.js`) use the canonical three-field line. |
| `test_shared_status_parser.py` | Unit (unittest + node probe) | — | The shared `parseStatusLine` (exported from `engine/llm.js`, imported by `mcp/tools/gameplay.js`): uppercase `[STATUS: ...]` with trailing content, the three-field line, the mock's two-field line (Moves optional), and a source guard that `gameplay.js` imports the shared parser rather than reimplementing it. |
| `e2e/test_menu_navigation.py` | E2E (pytest + Playwright) | `e2e` | Browser-based UI — keyboard nav, hotkeys, preset/character flows, launch states, save/restore, lore scan, system prompt editing. Spawns a Node.js server on port 5001. |
| `e2e/test_barter_ui.py` | E2E (pytest + Playwright) | `e2e` | Browser-based barter UI — trade offers, execution, inventory. Spawns a Node.js server. |
| `e2e/test_mobile_viewport.py` | E2E (pytest + Playwright) | `e2e` | Browser-based mobile viewport — responsive layout, touch interactions. Spawns a Node.js server. |

## Save Isolation

Every test file that creates saves uses the `SAVE_DIR` environment variable to redirect the engine's file writes to an isolated directory under `tests/`.

### Global Fallback

`tests/conftest.py` injects a **fallback default** via `pytest_configure`:

```python
os.environ.setdefault("SAVE_DIR", "tests/.tmp_saves/default")
```

This ensures that any test which forgets to set `SAVE_DIR` explicitly will write to `tests/.tmp_saves/default/` instead of `game/adventures/` (production). The `setdefault` call means per-suite overrides set in `setUp` (or pre-exported in the shell) take **precedence** over the global fallback.

### Per-Suite Overrides

| Test file | Isolated save directory |
|-----------|------------------------|
| `test_api_endpoints.py` | `tests/adventures_api_test/` |
| `test_memory_features.py` | `tests/adventures_memory_test/` |
| `test_barter_engine.py` | `tests/adventures_barter_test/` |
| `test_cli_behavior.py` | `tests/adventures_cli_test/` |
| `test_pty_integration.py` | `tests/adventures_pty_test/` |
| `simulate_playtest.py` | `tests/adventures_sim_test/` |
| `test_mcp_*.py` (all MCP tests) | `tests/mcp_test_data/` |
| `e2e/test_menu_navigation.py` | `tests/adventures/` |
| `e2e/test_barter_ui.py` | `tests/adventures_barter_e2e_test/` |
| Unconfigured fallback | `tests/.tmp_saves/default/` |

The engine derives a `data/` directory from `SAVE_DIR` as `{SAVE_DIR}/../data` (e.g. `tests/adventures_memory_test/../data` → `tests/data/`). This is where SQLite memory databases and vector indexes live during memory-feature tests.

### Operator Warning

Manual `node web/server.js` launches **bypass** the `conftest.py` global default and fall back to `game/adventures/` (production). Operators must pass `SAVE_DIR` explicitly for non-production sessions:

```bash
SAVE_DIR=tests/my_test_sandbox node web/server.js
```

## Port-Conflict Guard

Tests that spawn a Node.js server (`test_api_endpoints.py`, `test_menu_navigation.py`) check if the target port is already in use **before** starting. If it is (e.g. the user's playtest server is running), they raise a clear `RuntimeError`:

```
Port 5001 is already in use — please stop your server before running tests.
```

This prevents the test from silently reusing the user's production server, which would inject mock saves into `game/adventures/` (the production save directory).

## Cleanup Strategy

Each test is responsible for cleaning up its own isolated directories. Cleanup happens via `tearDown` (per-test) or `tearDownClass` (per-class):

- **Per-test cleanup** (`tearDown`): Removes individual JSON save files created during that test. Implemented in `test_api_endpoints.py`, `test_pty_integration.py`.
- **Per-class cleanup** (`tearDownClass`): Removes the entire save directory and derived data directory using `shutil.rmtree`. Implemented in `test_api_endpoints.py`, `test_memory_features.py`, `test_cli_behavior.py`, `simulate_playtest.py`.
- **Pytest session cleanup** (`start_server` fixture): Removes the save directory after the last E2E test finishes. Implemented in `test_menu_navigation.py`.

### Teardown Helper: `safe_rmtree`

`tests/test_helpers.py` provides `safe_rmtree(path)` — a permission-aware wrapper around `shutil.rmtree` that handles read-only SQLite temp files:

```python
def safe_rmtree(path):
    shutil.rmtree(path, onerror=_chmod_retry)
```

The `_chmod_retry` error handler calls `os.chmod(path, stat.S_IWRITE)` then retries the failed operation. Teardown call sites are encouraged to migrate raw `shutil.rmtree` calls to `safe_rmtree`. All teardown paths continue to be gated by the existing `assert_save_dir_is_safe()` guard.

No test ever writes to or deletes from `game/adventures/` (production) or `game/data/` (production memory).

## Tiered Test Execution

Pytest markers registered in `pytest.ini` enable tiered execution:

| Marker | Description | Command | npm script |
|--------|-------------|---------|------------|
| `unit` | Pure component tests, no spawned Node.js / MCP subprocess | `pytest -m unit` | `npm run test:fast` |
| `integration` | API / MCP / memory tests that spawn Node.js or MCP stdio subprocess | `pytest -m integration` | — |
| `e2e` | Playwright browser tests executing against a test backend | `pytest -m e2e` | `npm run test:e2e` |
| (all) | All non-deprecated tests | `pytest tests/ -v` | `npm run test:all` |

### Marker → File Mapping

| Test File | Marker |
|-----------|--------|
| `test_cli_behavior.py` | `unit` |
| `test_barter_engine.py` | `unit` |
| `test_api_endpoints.py` | `integration` |
| `test_memory_features.py` | `integration` |
| `test_live_llm.py` | `integration` |
| `test_openrouter_models.py` | `integration` |
| `test_mcp_*.py` (9 files) | `integration` |
| `test_extractor_validation.py` | `integration` (MCP guard classes) |
| `test_injection_defense.py` | `integration` (MCP guard classes) |
| `test_pty_integration.py` | `integration` |
| `simulate_playtest.py` | `integration` |
| `e2e/test_menu_navigation.py` | `e2e` |
| `e2e/test_barter_ui.py` | `e2e` |
| `e2e/test_mobile_viewport.py` | `e2e` |

### Deprecated-CLI Exclusion

`npm run test:all` explicitly passes `--ignore` flags for deprecated tests:

```bash
python -m pytest tests/ -v \
  --ignore=tests/test_cli_behavior.py \
  --ignore=tests/test_pty_integration.py \
  --ignore=tests/simulate_playtest.py
```

These files still receive marker decorators (for archival completeness) but are not exercised by `test:all`, enforcing the deprecation policy from `AGENTS.md` at the script layer.

## Historical Bugs Fixed

| Bug | Fix |
|-----|-----|
| `simulate_playtest.py` `tearDown` created `AdventureEngine()` without `SAVE_DIR`, then deleted `*.json` files from `game/adventures/` | Added `setUp` with isolated save dir + `SAVE_DIR`. Replaced file-deletion logic with `shutil.rmtree` of the test dir. |
| `test_memory_features.py` `_cleanup_data_files()` deleted `game/data/` (production memory DB and vector indexes) | Removed `_cleanup_data_files()`. Now only `shutil.rmtree` of the test-local dirs in `tearDownClass`. |
| Port-sharing: tests silently reused an existing server on port 5001 (e.g. a user's playtest session), writing mock saves to `game/adventures/` | Added port-conflict guard that raises `RuntimeError` if port is already in use. |
| `tests/data/` accumulated stale artifacts across runs | Cleanup moved to `tearDownClass` so the derived data dir is removed with the save dir. |

## Consistency Contract (`make-undo-and-trades-consistent`)

The undo/trade change ships tests that lock down the shared contract. Run with:

```bash
MOCK_LLM=1 python3 -m pytest tests/ -v \
  --ignore=tests/test_cli_behavior.py \
  --ignore=tests/test_pty_integration.py \
  --ignore=tests/simulate_playtest.py
```

### Mock Triggers (`MOCK_LLM=1`)

The mock narrator responds deterministically to seeded history so undo/trade behavior is testable without a live LLM:

| Seed history | Expected extraction |
|--------------|---------------------|
| contains `trade` + `leaflet` + `gem` | Remove Leaflet, acquire Gem, event type `trade` |
| `"bring me"` + `leaflet` | Offer `{Korr, Leaflet, Gem}` |
| `"find my daughter"` + `locket` | Goal `{Korr, Find the locket, Locket, Gem}` |

### Contract Assertions

- **Undo**: after undoing turn N, `dungeon_inspect_events` / `dungeon_inspect_inventory` return no rows for turns `>= N`; `dungeon_inspect_stats.lastExtractedTurnIndex == N - 1`; `moves` returns to the pre-undo value; the watermark never exceeds committed turn-pair history length. Since `memory-schema-boundary` (#27), the rollback surface is full: lore, `barter_offers`, and `quest_goals` rows attributed to the undone turn are removed too (`turn_index >= N`; offers/goals additionally `IS NOT NULL`, so hand-created rows survive).
- **RAG**: `dungeon_search_memories` does not recall an undone turn (vector ids removed via `deleteItems`).
- **Barter**: a narrated trade resolves through `executeBarter` (possession check + atomic swap); the sold item is `traded` (excluded from `getInventory`) and re-trading it fails possession; a refused/ambiguous trade returns a refusal, not a crash.
- **Extraction**: `inventory_changes[].action` supports `traded`; extraction output includes top-level `offers[]` / `goals[]`.
- **Names**: item lookups normalize via `engine/memory/itemNames.js` shared with `validate-memory-extraction`.

## Spatial Room Graph (`spatial-map-region-graph`)

The spatial change ships tests that lock down the room-graph contract. Unit seam (`npm run test:unit`) + MCP integration (`tests/test_mcp_spatial.py`):

- **Reconciliation (D3)**: `reconcile` grows a walk edge on new discovery and infers the reverse for reversible directions; re-traversal of a confirmed edge adopts the known room (first visit wins — a drifted narrator name canonicalizes, never duplicates); an inferred-edge contradiction retracts and grows (self-heal); portal/time edges are recorded with no reverse; unknown reposition records no edge; a store-write failure degrades to the proposed location without throwing.
- **Persistence (D1)**: `rooms`/`exits`/`room_visits` tables with `UNIQUE(adventure_id, from_room, direction)`; `rollbackTurn` removes rooms (`first_turn >= N`), exits (`discovered_turn >= N IS NOT NULL`), visits (`turn >= N`) and recomputes the summary columns; hand-created rows (first_turn 0 / NULL discovered_turn / turn 0) survive.
- **Undo (D5)**: undo of a discovery removes the room/edge/visit rows; undo of pure movement removes the visit; `currentRoomId` + `location` revert to the pre-turn room (last visit at or before `preUndoMoves - 1`).
- **Save/load (D4)**: `current_room_id` is additive and null-tolerant; an old save (no field) loads with null and establishes the room from `location`; a round-trip resolves the current room to the same node.
- **Mock integration (7.3)**: `tests/unit/spatialIntegration.test.mjs` drives the real engine with a scripted west→north→east→south narrator and asserts the exact node/edge set (confirmed + inferred) and a deterministic return via the inferred reverse edge.
- **MCP**: `dungeon_inspect_map` / `dungeon_inspect_room` reuse `forceFlushBeforeRead`; the protocol test expects 20 tools (18 + the 2 map tools).
