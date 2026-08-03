## MODIFIED Requirements

### Requirement: Sanitized History Commit
The game engine SHALL apply a single sanitization step to assistant text before committing it to history, the save file, or the extraction queue, and SHALL keep the raw assistant text available for debugging without feeding it back as context.

The sanitization scope SHALL include the auto-summarized `state.summary`: the summary is serialized to the save file and injected as `[ADVENTURE SUMMARY]` into the system message on every subsequent turn, so it SHALL NOT contain raw status lines or echoed `[CURRENT STATUS]` / `[CURRENT INVENTORY]` blocks.

#### Scenario: History commit is sanitized
- **WHEN** an assistant narration response is finalized
- **THEN** the text pushed to `state.history` is the cleaned, sanitized narration (echoed context blocks and raw status line removed), and the same sanitized text is what gets serialized to the save file and queued for extraction

#### Scenario: Raw text available for debugging
- **WHEN** a turn is analyzed for debugging
- **THEN** the raw assistant output is available (e.g., via diagnostics/logs) but is not included in the context replayed on subsequent turns

#### Scenario: Summarized summary is sanitized
- **WHEN** the auto-summarizer produces a summary that echoes a status line or context blocks
- **THEN** the committed `state.summary`, the save-file `summary` field, and the `[ADVENTURE SUMMARY]` context injection contain only the cleaned summary with no raw `[Status: ...]` or `[CURRENT ...]` lines
