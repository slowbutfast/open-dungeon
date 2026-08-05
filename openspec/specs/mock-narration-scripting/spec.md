# mock-narration-scripting Specification

## Purpose
Defines the env-gated scripted-narration behavior of the mock LLM: when `MOCK_SCRIPT_FILE` is set, the mock's `narration` intent serves canonical status lines from a JSON file, one per turn; when unset, output is byte-identical to the existing canned narration.
## Requirements
### Requirement: Scripted Narration via MOCK_SCRIPT_FILE
The mock LLM SHALL serve scripted narration when the `MOCK_SCRIPT_FILE` environment variable is set to a readable file. The file SHALL be a JSON array of canonical status-line strings (each a `[Status: <Location> | Score: <N> | Moves: <N>]` line matching the shared `STATUS_FORMAT` contract). The `narration` intent SHALL serve the next line from the script per turn, and SHALL hold the last line when the script is exhausted. The narration stream SHALL use the existing chunked generation shape so consumers parse it identically to canned narration.

#### Scenario: Scripted probe emits varying locations
- **WHEN** `MOCK_SCRIPT_FILE` points to a JSON array of two or more canonical status lines with different locations
- **THEN** successive narration turns emit the scripted locations in order, and the parsed status-line location advances accordingly

#### Scenario: Script exhaustion holds the last line
- **WHEN** a probe drives more narration turns than the script has lines
- **THEN** the mock continues serving the final scripted line rather than erroring or wrapping around

#### Scenario: Scripted status line carries a valid canonical shape
- **WHEN** a scripted line is served
- **THEN** it matches the canonical three-field `[Status: <Location> | Score: <N> | Moves: <N>]` shape consumed by the shared `parseStatusLine`

### Requirement: Default Path Unchanged
When `MOCK_SCRIPT_FILE` is unset, the mock SHALL produce byte-identical output to the pre-change canned narration (the fixed Cantina narrative and its status line). The scripting path SHALL be strictly opt-in and SHALL NOT alter any behavior when the env var is absent.

#### Scenario: Default mock behavior is unchanged
- **WHEN** the mock is used without `MOCK_SCRIPT_FILE` set
- **THEN** narration output is byte-identical to the existing canned narration, and existing status-contract tests continue to pass

#### Scenario: Unreadable script file is handled without crashing the server
- **WHEN** `MOCK_SCRIPT_FILE` is set to a path that does not exist or is not valid JSON
- **THEN** the mock falls back to canned narration (or a deterministic error) and the server does not crash on startup or on the first narration call

### Requirement: Engine Remains Score/Moves Owner
The scripted `Score` and `Moves` fields in the status line SHALL be advisory. The engine SHALL remain the single owner of `score` and `moves`, committing its own computed values rather than adopting the scripted fields.

#### Scenario: Engine-owned score/moves under a scripted narrator
- **WHEN** a probe drives turns against a scripted mock whose lines carry `Score: 0` / `Moves: N`
- **THEN** the committed `score`/`moves` come from the engine's single-owner path (matches `dungeon_inspect_state`/`GET /api/state`), not the scripted values

### Requirement: Runner Env Passthrough
The probe runner (`tests/probe_runner.py`) SHALL pass `MOCK_SCRIPT_FILE` through to the spawned server's environment when the operator supplies it, so a probe can be pointed at a script under `game/playtest/scripts/`.

#### Scenario: Probe spawn honors MOCK_SCRIPT_FILE
- **WHEN** the runner spawns a probe with `MOCK_SCRIPT_FILE` configured (e.g. `game/playtest/scripts/<probe>.json`)
- **THEN** the spawned server process's environment includes `MOCK_SCRIPT_FILE`, and the probe's narration is scripted accordingly

#### Scenario: No script means canned narration
- **WHEN** the runner spawns a probe without `MOCK_SCRIPT_FILE` configured
- **THEN** the spawned server's environment omits the var and the mock serves its default canned narration

