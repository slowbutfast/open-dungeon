# game-engine Specification

## Purpose
Defines the core game engine logic, including state initialization, save/load persistence, action handling, undo/retry operations, and narration response generation.
## Requirements
### Requirement: Adventure Initialization
The game engine SHALL be able to initialize a new adventure with a title, a default system prompt, and empty state values.

#### Scenario: Start new adventure
- **WHEN** user chooses to initialize a new adventure with a given title
- **THEN** a unique adventure ID is generated, the game state is initialized, and the initial state is saved to a file

### Requirement: Game State Persistence
The game engine SHALL support saving the current state (including location, score, moves, system prompt, lore cards, history, and summary) to a JSON file, and loading a previously saved state using its adventure ID.

Score SHALL be persisted and restored exactly (round-trip), so a scored progression survives save/load.

#### Scenario: Saving active game state
- **WHEN** the engine save function is called
- **THEN** the active engine properties are serialized and written to a JSON file in the designated save directory, including the current `score`

#### Scenario: Loading game state
- **WHEN** the engine load function is called with a valid adventure ID
- **THEN** the state is read from the JSON file and all engine properties are updated to match the saved values, including the saved `score`

#### Scenario: Score round-trips through save/load
- **WHEN** a session with a non-zero score is saved and then loaded
- **THEN** the restored `score` equals the saved value

### Requirement: Undo Action
The game engine SHALL allow reverting the state by removing the last player turn and the corresponding Dungeon Master narration response from history, while rolling back SQLite inventory status changes made on or after the undone turn.

Undo SHALL also restore the player's room identity to the pre-turn room: `currentRoomId` and the canonical `location` SHALL revert to the room the player was in before the undone turn, and rooms, edges, and visits discovered on the undone turn SHALL be removed from the spatial store.

#### Scenario: Undo last action
- **WHEN** undo is called and there is at least one player turn and DM response in history
- **THEN** the last assistant turn and the last user turn are removed from active history, SQLite inventory changes on that turn are reverted, and the state is saved

#### Scenario: Undo restores the prior room
- **WHEN** undo is called after a turn that moved between rooms or discovered a new room/edge
- **THEN** `currentRoomId` and `location` revert to the pre-turn room, and any room/edge/visit rows discovered on the undone turn are removed

### Requirement: Generate Response Stream
The game engine SHALL stream narration chunks from the LLM, format input actions, invoke deterministic pre-action inventory and barter validation, parse status lines to update location, score, and moves, and append narration back to history.

Status parsing SHALL use the single shared `parseStatusLine` function exported by `engine/llm.js` (line-scanning, case-insensitive on `Status`, optional `Moves` field), which is also the parser used by the MCP server. The engine SHALL NOT maintain a second, end-anchored status regex that diverges from it.

The status-line FORMAT SHALL be produced by one shared definition: `STATUS_FORMAT` (`engine/statusFormat.js`), the canonical three-field `[Status: <Location Name> | Score: <Current Score> | Moves: <Moves>]` line. The default system prompt (`DEFAULT_SYSTEM_PROMPT`), all four story presets, the mock narrator's canned responses (`engine/mockOpenAI.js`), and the web fallback opening scene (`web/routes/game.js`) SHALL compose the canonical line from that constant (or, for the zero-build frontend, declare the identical literal); producers SHALL NOT emit the two-field variant. The frontend status strip (`web/static/js/ui/renderers.js`) SHALL match the same three-field shape so it cannot disagree with the committed line.

The narrator contract SHALL require status-line fidelity: the narrator MUST emit a canonical status line at the end of every response, and MUST advance the `Location` field whenever its narration moves the player to a new or different place. The default system prompt and all story presets SHALL state this mandate explicitly so the narrator's status line stays in agreement with its own scene narration.

The engine SHALL budget the narration output so the mandated status line can always be emitted: a "simple" object action MAY receive a reduced output budget, but never below a floor (`SIMPLE_ACTION_MIN_TOKENS`) that leaves room for a short description plus the trailing status line, and movement verbs SHALL NOT be simple-capped. A truncated `[Status:` line (the model hit its output budget mid-line) SHALL be stripped from narration and history like a complete status line.

When the status line is missing or the narrator repeats its own previous status line (stale echo), the engine SHALL recover a proposed location from the narration's arrival landmarks (`engine/narrationLandmarks.js`) and reconcile it, so the map keeps growing; a changed status line SHALL always be honored.

The narrator SHALL adopt the tone/register implied by the player's opening and hold that style consistently for the session (no mid-session tonal drift). The engine SHALL capture the adopted style once into state and expose it as a `[NARRATOR STYLE]` context block so later turns keep it pinned.

The narration text committed to history, the save file, and the extraction queue SHALL be sanitized: echoed context blocks (derived from the narrator-context registry) and the raw status line SHALL be stripped before commit. The raw assistant text MAY be retained for debugging but SHALL NOT be replayed as context.

The game engine SHALL advance `score` deterministically as the adventure progresses, independent of whether the narrator happens to emit a new Score value on the status line. Score SHALL be computed by an engine-side rule (over extracted milestone events) and committed through the same shared status-line path used for location and moves, so a missed status line cannot silently freeze score.

The committed Location SHALL resolve through the spatial room resolver: after the status line is parsed and passes the forged-status guard, the engine SHALL reconcile the proposed name against the persisted room graph (classify transition, extract direction, resolve name → node, grow/retract edges) and commit the canonical location plus `currentRoomId`. The engine SHALL be authoritative over room identity (first visit wins on re-traversal of a confirmed edge) and SHALL fall back to the narrator's proposed location, logging and completing the turn, if reconciliation cannot write to the store.

The memory-extraction path (invoked after turns) SHALL validate the event extractor's output against a schema before any row is written to the structured store. Malformed events, inventory changes, or lore facts SHALL be rejected or quarantined, not persisted as ground truth.

Player action text SHALL be wrapped in explicit delimiters when placed in the prompt, with an instruction that the content inside is in-fiction player input and never instructions to the narrator. The status parser SHALL NOT adopt a status line that conflicts with plausible engine state (e.g., a forged `Score: 9999`); on a suspect status line the engine SHALL fall back to its own committed state.

The narration call SHALL be routed through the LLM call adapter (`llmCall`): the request body (messages, model, temperature, `max_tokens`, the openrouter `reasoning`/`stream_options` block, and the `stream` flag) SHALL be identical to a direct `chat.completions.create`, and the mock SHALL dispatch the canned narration stream by the `narration` intent. The `for await (chunk of stream)` loop, the caller-owned `recordUsage`/`endCall` on the sanitized narration, the fallback-model retry, and the error event SHALL be preserved.

#### Scenario: Processing player action
- **WHEN** user sends an action of type 'do', 'say', or 'story' with text
- **THEN** the action is formatted and validated against the synchronous inventory and barter engines, a stream of response chunks is retrieved from the LLM provider through the adapter, status updates are parsed from the last status line anywhere in the response (Location, Score, Moves), and final narration is appended to history

#### Scenario: Producers emit the canonical three-field line
- **WHEN** the mock narrator, the web fallback opening scene, the default system prompt, or a story preset produces a status line
- **THEN** the line is the canonical three-field `[Status: <Location Name> | Score: <Current Score> | Moves: <Moves>]` shape composed from the shared `STATUS_FORMAT` constant (or, in the zero-build frontend default, the identical literal), and the frontend strip removes that same shape from rendered narration

#### Scenario: Narrator advances the location when it moves the player
- **WHEN** the narrator's prose narrates travel to a new place
- **THEN** the status line's `Location` names that new place (the prompt mandate requires it), so the engine reconciles a new room and the spatial map grows

#### Scenario: Player input is delimited as in-fiction
- **WHEN** the player's action text is inserted into the prompt
- **THEN** it is wrapped in explicit delimiters with an instruction that the content is in-fiction input and never instructions, so instruction-style text is framed as player dialogue/action

#### Scenario: Forged status line is not adopted
- **WHEN** the narrator response contains a status line that contradicts engine state (e.g., `Score: 9999` with no plausible cause, or a mechanical Location like `Admin Room`)
- **THEN** the engine does not commit the forged values, keeping its own committed location/score/moves

#### Scenario: Pre-action barter intent detection
- **WHEN** user sends an action of type 'do' containing barter verbs (`trade`, `barter`, `exchange`)
- **THEN** the engine extracts the item name, validates ownership via SQLite `hasItem()`, and rejects locally with a user message if the item is not held

#### Scenario: Pre-action multi-match ambiguity
- **WHEN** user sends an action with a barter verb and an ambiguous item name matching multiple held items
- **THEN** the engine rejects locally with a disambiguation prompt listing the matching items, without invoking the LLM

#### Scenario: Status line with trailing content is still parsed
- **WHEN** the narrator appends content after the status line (e.g., an echoed context block or additional prose) so the status line is not the last line
- **THEN** the last status line in the response is located and parsed, location/score/moves are committed, and the status line is not persisted as narration

#### Scenario: Echoed context blocks are stripped from history
- **WHEN** the assistant response echoes an injected context block verbatim
- **THEN** the block is removed from the narration before it is committed to history, and the history entry contains only the sanitized narration

#### Scenario: Score advances on a quest milestone
- **WHEN** a playtest session completes a quest objective (e.g., delivering a quest datachip, purging a criminal record)
- **THEN** the engine's score increases deterministically and `dungeon_inspect_state` reflects the new score, independent of the narrator's status-line wording

#### Scenario: Score does not stay frozen across a full arc
- **WHEN** a multi-act adventure runs to completion
- **THEN** `score` reflects accumulated milestones (non-zero), rather than remaining at the initial value for the entire session

#### Scenario: Invalid extractor output is rejected
- **WHEN** the event extractor returns a row that fails schema validation (missing fields, invalid type, invalid trigger words)
- **THEN** the row is not written to SQLite, the vector index, or `state.cards`, and extraction continues with the valid rows

#### Scenario: Narration streams through the adapter
- **WHEN** the engine starts a narration turn
- **THEN** the adapter returns the streaming response and the caller consumes it with the same `for await` generator loop, records usage, and ends the tracker call with the sanitized narration

#### Scenario: Committed location resolves through the room graph
- **WHEN** the status line proposes a location and passes the forged-status guard
- **THEN** the engine reconciles the proposal against the persisted room graph and commits the canonical location plus `currentRoomId` (creating/resolving rooms and growing/retracting edges as the reconciliation dictates)

#### Scenario: Reconciliation failure degrades gracefully
- **WHEN** spatial reconciliation cannot write to the store during a turn
- **THEN** the engine keeps the narrator's proposed location, logs the failure, and completes the turn without error

### Requirement: Single Ownership of the Moves Counter
The game engine SHALL track `moves` through a single, defined owner rather than letting the model's status-line number and the engine's fallback increments both mutate the counter independently.

#### Scenario: Moves increment is deterministic
- **WHEN** a turn completes and the status line omits a Moves field (e.g., mock-mode two-field line) or the status line is unparseable
- **THEN** the engine applies exactly one deterministic increment (per-turn), and the committed `moves` matches the value returned by `dungeon_inspect_state` and the MCP `dungeon_send_action` fallback

### Requirement: Sanitized History Commit
The game engine SHALL apply a single sanitization step to assistant text before committing it to history, the save file, or the extraction queue, and SHALL keep the raw assistant text available for debugging without feeding it back as context.

The sanitization scope SHALL include the auto-summarized `state.summary`: the summary is serialized to the save file and injected as `[ADVENTURE SUMMARY]` into the system message on every subsequent turn, so it SHALL NOT contain raw status lines or echoed context blocks.

The sanitization scope SHALL cover **all** injected context blocks, not only `[CURRENT STATUS]` / `[CURRENT INVENTORY]`: the strip-set SHALL be derived from the narrator-context registry headers, so any registered block (e.g. `[ADVENTURE SUMMARY]`, `[WORLD INFO & LORE]`, `[RECALLED MEMORIES]`) is stripped when echoed.

#### Scenario: History commit is sanitized
- **WHEN** an assistant narration response is finalized
- **THEN** the text pushed to `state.history` is the cleaned, sanitized narration (echoed context blocks and raw status line removed), and the same sanitized text is what gets serialized to the save file and queued for extraction

#### Scenario: Raw text available for debugging
- **WHEN** a turn is analyzed for debugging
- **THEN** the raw assistant output is available (e.g., via diagnostics/logs) but is not included in the context replayed on subsequent turns

#### Scenario: Summarized summary is sanitized
- **WHEN** the auto-summarizer produces a summary that echoes a status line or context blocks
- **THEN** the committed `state.summary`, the save-file `summary` field, and the `[ADVENTURE SUMMARY]` context injection contain only the cleaned summary with no raw `[Status: ...]` or registered context-block lines

#### Scenario: Any registered block echo is stripped
- **WHEN** assistant text echoes the header and body of any registered context block, including `[ADVENTURE SUMMARY]`, `[WORLD INFO & LORE]`, or `[RECALLED MEMORIES]`
- **THEN** the header line and its following bullet lines are removed from the committed narration

