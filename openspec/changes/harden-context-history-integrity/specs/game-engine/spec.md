## MODIFIED Requirements

### Requirement: Generate Response Stream
The game engine SHALL stream narration chunks from the LLM, format input actions, invoke deterministic pre-action inventory and barter validation, parse status lines to update location, score, and moves, and append narration back to history.

Status parsing SHALL use the single shared `parseStatusLine` function exported by `engine/llm.js` (line-scanning, case-insensitive on `Status`, optional `Moves` field), which is also the parser used by the MCP server. The engine SHALL NOT maintain a second, end-anchored status regex that diverges from it.

The narration text committed to history, the save file, and the extraction queue SHALL be sanitized: echoed `[CURRENT STATUS]` / `[CURRENT INVENTORY]` blocks and the raw status line SHALL be stripped before commit. The raw assistant text MAY be retained for debugging but SHALL NOT be replayed as context.

#### Scenario: Processing player action
- **WHEN** user sends an action of type 'do', 'say', or 'story' with text
- **THEN** the action is formatted and validated against the synchronous inventory and barter engines, a stream of response chunks is retrieved from the LLM provider, status updates are parsed from the last status line anywhere in the response (Location, Score, Moves), and final narration is appended to history

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

## ADDED Requirements

### Requirement: Single Ownership of the Moves Counter
The game engine SHALL track `moves` through a single, defined owner rather than letting the model's status-line number and the engine's fallback increments both mutate the counter independently.

#### Scenario: Moves increment is deterministic
- **WHEN** a turn completes and the status line omits a Moves field (e.g., mock-mode two-field line) or the status line is unparseable
- **THEN** the engine applies exactly one deterministic increment (per-turn), and the committed `moves` matches the value returned by `dungeon_inspect_state` and the MCP `dungeon_send_action` fallback

### Requirement: Sanitized History Commit
The game engine SHALL apply a single sanitization step to assistant text before committing it to history, the save file, or the extraction queue, and SHALL keep the raw assistant text available for debugging without feeding it back as context.

#### Scenario: History commit is sanitized
- **WHEN** an assistant narration response is finalized
- **THEN** the text pushed to `state.history` is the cleaned, sanitized narration (echoed context blocks and raw status line removed), and the same sanitized text is what gets serialized to the save file and queued for extraction

#### Scenario: Raw text available for debugging
- **WHEN** a turn is analyzed for debugging
- **THEN** the raw assistant output is available (e.g., via diagnostics/logs) but is not included in the context replayed on subsequent turns
