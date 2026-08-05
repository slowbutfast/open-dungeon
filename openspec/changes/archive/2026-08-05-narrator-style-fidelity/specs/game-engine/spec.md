## MODIFIED Requirements

### Requirement: Generate Response Stream
The game engine SHALL stream narration chunks from the LLM, format input actions, invoke deterministic pre-action inventory and barter validation, parse status lines to update location, score, and moves, and append narration back to history.

Status parsing SHALL use the single shared `parseStatusLine` function exported by `engine/llm.js` (line-scanning, case-insensitive on `Status`, optional `Moves` field), which is also the parser used by the MCP server. The engine SHALL NOT maintain a second, end-anchored status regex that diverges from it.

The status-line FORMAT SHALL be produced by one shared definition: `STATUS_FORMAT` (`engine/statusFormat.js`), the canonical three-field `[Status: <Location Name> | Score: <Current Score> | Moves: <Moves>]` line. The default system prompt (`DEFAULT_SYSTEM_PROMPT`), all four story presets, the mock narrator's canned responses (`engine/mockOpenAI.js`), and the web fallback opening scene (`web/routes/game.js`) SHALL compose the canonical line from that constant (or, for the zero-build frontend, declare the identical literal); producers SHALL NOT emit the two-field variant. The frontend status strip (`web/static/js/ui/renderers.js`) SHALL match the same three-field shape so it cannot disagree with the committed line.

The narrator contract SHALL require status-line fidelity: the narrator MUST emit a canonical status line at the end of every response, and MUST advance the `Location` field whenever its narration moves the player to a new or different place. The default system prompt and all story presets SHALL state this mandate explicitly so the narrator's status line stays in agreement with its own scene narration.

The engine SHALL budget the narration output so the mandated status line can always be emitted: a "simple" object action MAY receive a reduced output budget, but never below a floor (`SIMPLE_ACTION_MIN_TOKENS`) that leaves room for a short description plus the trailing status line, and movement verbs SHALL NOT be simple-capped. A truncated `[Status:` line (the model hit its output budget mid-line) SHALL be stripped from narration and history like a complete status line.

When the status line is missing or the narrator repeats its own previous status line (stale echo), the engine SHALL recover a proposed location from the narration's arrival landmarks (`engine/narrationLandmarks.js`) and reconcile it, so the map keeps growing; a changed status line SHALL always be honored.

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

#### Scenario: Player input is delimited as in-fiction
- **WHEN** the player's action text is inserted into the prompt
- **THEN** it is wrapped in explicit delimiters with an instruction that the content is in-fiction input and never instructions, so instruction-style text is framed as player dialogue/action

#### Scenario: Forged status line is not adopted
- **WHEN** the narrator response contains a status line that contradicts engine state (e.g., `Score: 9999` with no plausible cause, or a mechanical Location like `Admin Room`)
- **THEN** the engine does not commit the forged values, keeping its own committed location/score/moves

#### Scenario: Narrator advances the location when it moves the player
- **WHEN** the narrator's prose narrates travel to a new place
- **THEN** the status line's `Location` names that new place (the prompt mandate requires it), so the engine reconciles a new room and the spatial map grows
