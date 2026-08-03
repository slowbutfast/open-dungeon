## MODIFIED Requirements

### Requirement: Generate Response Stream
The game engine SHALL stream narration chunks from the LLM, format input actions, invoke deterministic pre-action inventory and barter validation, parse status lines to update location, score, and moves, and append narration back to history.

Status parsing SHALL use the single shared `parseStatusLine` function exported by `engine/llm.js` (line-scanning, case-insensitive on `Status`, optional `Moves` field), which is also the parser used by the MCP server. The engine SHALL NOT maintain a second, end-anchored status regex that diverges from it.

The status-line FORMAT SHALL be produced by one shared definition: `STATUS_FORMAT` (`engine/statusFormat.js`), the canonical three-field `[Status: <Location Name> | Score: <Current Score> | Moves: <Moves>]` line. The default system prompt (`DEFAULT_SYSTEM_PROMPT`), all four story presets, the mock narrator's canned responses (`engine/mockOpenAI.js`), and the web fallback opening scene (`web/routes/game.js`) SHALL compose the canonical line from that constant (or, for the zero-build frontend, declare the identical literal); producers SHALL NOT emit the two-field variant. The frontend status strip (`web/static/js/ui/renderers.js`) SHALL match the same three-field shape so it cannot disagree with the committed line.

The narration text committed to history, the save file, and the extraction queue SHALL be sanitized: echoed `[CURRENT STATUS]` / `[CURRENT INVENTORY]` blocks and the raw status line SHALL be stripped before commit. The raw assistant text MAY be retained for debugging but SHALL NOT be replayed as context.

The game engine SHALL advance `score` deterministically as the adventure progresses, independent of whether the narrator happens to emit a new Score value on the status line. Score SHALL be computed by an engine-side rule (over extracted milestone events) and committed through the same shared status-line path used for location and moves, so a missed status line cannot silently freeze score.

The memory-extraction path (invoked after turns) SHALL validate the event extractor's output against a schema before any row is written to the structured store. Malformed events, inventory changes, or lore facts SHALL be rejected or quarantined, not persisted as ground truth.

Player action text SHALL be wrapped in explicit delimiters when placed in the prompt, with an instruction that the content inside is in-fiction player input and never instructions to the narrator. The status parser SHALL NOT adopt a status line that conflicts with plausible engine state (e.g., a forged `Score: 9999`); on a suspect status line the engine SHALL fall back to its own committed state.

#### Scenario: Processing player action
- **WHEN** user sends an action of type 'do', 'say', or 'story' with text
- **THEN** the action is formatted and validated against the synchronous inventory and barter engines, a stream of response chunks is retrieved from the LLM provider, status updates are parsed from the last status line anywhere in the response (Location, Score, Moves), and final narration is appended to history

#### Scenario: Producers emit the canonical three-field line
- **WHEN** the mock narrator, the web fallback opening scene, the default system prompt, or a story preset produces a status line
- **THEN** the line is the canonical three-field `[Status: <Location Name> | Score: <Current Score> | Moves: <Moves>]` shape composed from the shared `STATUS_FORMAT` constant (or, in the zero-build frontend default, the identical literal), and the frontend strip removes that same shape from rendered narration

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
- **WHEN** the narrator appends content after the status line (e.g., an echoed `[CURRENT INVENTORY]` block or additional prose) so the status line is not the last line
- **THEN** the last status line in the response is located and parsed, location/score/moves are committed, and the status line is not persisted as narration

#### Scenario: Echoed context blocks are stripped from history
- **WHEN** the assistant response echoes the injected `[CURRENT STATUS]` or `[CURRENT INVENTORY]` blocks verbatim
- **THEN** the blocks are removed from the narration before it is committed to history, and the history entry contains only the sanitized narration

#### Scenario: Score advances on a quest milestone
- **WHEN** a playtest session completes a quest objective (e.g., delivering a quest datachip, purging a criminal record)
- **THEN** the engine's score increases deterministically and `dungeon_inspect_state` reflects the new score, independent of the narrator's status-line wording

#### Scenario: Score does not stay frozen across a full arc
- **WHEN** a multi-act adventure runs to completion
- **THEN** `score` reflects accumulated milestones (non-zero), rather than remaining at the initial value for the entire session

#### Scenario: Invalid extractor output is rejected
- **WHEN** the event extractor returns a row that fails schema validation (missing fields, invalid type, invalid trigger words)
- **THEN** the row is not written to SQLite, the vector index, or `state.cards`, and extraction continues with the valid rows
