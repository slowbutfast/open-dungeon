# parallel-playtest-runner Specification

## Purpose
Defines the supervised probe runner that spawns, drives, recovers, and tears down isolated per-probe web servers for parallel playtesting, plus the optional JSON response mode on the HTTP action endpoint.

## ADDED Requirements

### Requirement: Probe Server Lifecycle Management
The runner SHALL manage the full lifecycle of a probe server: allocate a free port, spawn `node web/server.js` with an isolated `SAVE_DIR` and explicit `MOCK_LLM`/`LLM_BACKEND` env, wait for readiness via `GET /api/ping`, and terminate the process on runner exit so no orphaned servers remain.

#### Scenario: Spawn a probe server on a free port
- **WHEN** the runner starts a probe with no explicit port
- **THEN** the runner selects a free TCP port (bind-check), spawns `web/server.js` with `PORT` set to it and a probe-specific `SAVE_DIR`, and the server binds that port

#### Scenario: Wait for readiness
- **WHEN** the runner spawns a probe server
- **THEN** the runner polls `GET /api/ping` until it returns an OK status or the readiness timeout expires, and only then begins driving actions

#### Scenario: Guaranteed teardown on exit
- **WHEN** the runner exits (normal completion, error, or interrupt)
- **THEN** the runner terminates every spawned probe server process and releases its port, leaving no orphaned `node web/server.js` processes

#### Scenario: No probe writes to production saves
- **WHEN** the runner spawns a probe server without an explicit `SAVE_DIR` override from the operator
- **THEN** the server's `SAVE_DIR` resolves inside the gitignored `game/playtest/` tree and never falls through to the production `game/adventures/` directory

### Requirement: Crash Recovery with Resume
The runner SHALL recover a probe server that dies mid-run: restart it and restore its session state from the last persisted save via the existing `POST /saves/:save_id` route, so the probe's history, location, score, and moves survive the restart.

#### Scenario: Restart and resume after a probe server crash
- **WHEN** a probe server process exits unexpectedly during a run and the probe had an active `adventure_id`
- **THEN** the runner restarts the server on the same port, waits for readiness, calls `POST /saves/<adventure_id>`, and continues driving from the restored state

#### Scenario: Resume only when a save exists
- **WHEN** a probe server crashes before any adventure was initialized or saved
- **THEN** the runner restarts the server and proceeds to initialize a fresh session rather than attempting to load a nonexistent save

### Requirement: Concurrency Cap
The runner SHALL support a configurable concurrency cap (`--max-concurrent N`) that bounds the number of simultaneously running probe servers, so a parallel fan-out cannot accumulate unbounded processes or memory.

#### Scenario: Cap concurrent probe servers
- **WHEN** the operator runs the runner with `--max-concurrent 2` and requests more than two probes
- **THEN** the runner starts at most two probe servers at once and queues the remaining probes until a slot frees up

#### Scenario: No cap means run all requested probes
- **WHEN** the operator runs the runner without a concurrency cap
- **THEN** the runner starts all requested probes concurrently

### Requirement: Action Endpoint JSON Response Mode
The HTTP `POST /api/action` endpoint SHALL support an optional `?format=json` query parameter that aggregates the SSE stream into a single JSON response body containing the narration text and engine status metrics, instead of streaming `text/event-stream` frames. This mode is additive; the default SSE streaming behavior SHALL be unchanged.

#### Scenario: JSON response for an action
- **WHEN** a client posts an action to `/api/action?format=json`
- **THEN** the endpoint returns a single JSON object with the narration text and the location/score/moves status values, without streaming

#### Scenario: Default behavior remains SSE
- **WHEN** a client posts an action to `/api/action` without the `format` parameter
- **THEN** the endpoint streams `text/event-stream` frames exactly as before

### Requirement: Runner HTTP Driver
The runner SHALL drive probe actions through the HTTP API, parsing either the JSON response mode or, as a fallback, the SSE stream, so a probe can submit `do`/`say`/`story` actions and read the resulting narration and status without hand-writing a parser.

#### Scenario: Drive an action via JSON mode
- **WHEN** the runner submits an action to `/api/action?format=json`
- **THEN** the runner returns the parsed narration and status metrics to the probe driver

#### Scenario: Drive an action via SSE fallback
- **WHEN** JSON mode is unavailable on the target server (server predates the change)
- **THEN** the runner falls back to parsing the SSE stream frames and returns the same narration and status metrics

### Requirement: Probe Sandbox Isolation
Each probe SHALL run against its own isolated `SAVE_DIR` so concurrent probes never share save files or write into the same adventure namespace. The runner SHALL make the sandbox directory discoverable by the probe so it can report where its saves land.

#### Scenario: Distinct SAVE_DIR per probe
- **WHEN** the runner starts two concurrent probes
- **THEN** each probe's server resolves a distinct `SAVE_DIR` (e.g. `game/playtest/adventures/probe-<name>`) and no save file written by one probe is readable as another probe's save

#### Scenario: Probe sandbox is gitignored
- **WHEN** a probe server writes saves under `game/playtest/`
- **THEN** those files are covered by the existing `game/playtest/` gitignore entry and are never committed
