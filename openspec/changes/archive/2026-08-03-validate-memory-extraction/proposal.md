## Why

The event extractor takes raw model JSON and writes it straight into permanent SQLite state (lore cards, inventory rows, events) with no validation, sanity checks, or filtering. Whatever the narration says becomes ground truth forever, and lore cards are auto-injected back into prompts. Confirmed failures: lore cards with single common-word triggers that fire on nearly every turn (`trade` on `wandering trader`, bogus `West of a Forest Path` from an echoed status), quantity double-encoded into both name and column, item names drifting from narration (Rusty vs Rusted), and a summarizer prompt that violates the second-person contract every prompt variant mandates.

## What Changes

- **Validate extractor output before it touches SQLite.** Schema-check `events`/`inventory_changes`/`lore_facts`; reject or quarantine malformed rows rather than persisting them.
- **Filter trigger tokens.** Reject single common words, tokens below a length threshold, and game-mechanical vocabulary (`score`, `inventory`, `status`, `admin`, `system`, `prompt`).
- **Parse leading quantities out of `item_name`** into the `quantity` column so counts aren't double-encoded.
- **Canonicalize item names on write** and match case/stem-insensitively on read, so narration names and store names resolve to the same item.
- **Fix the summarization prompt** to hold second person.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `lore-cards`: modify `Keyword Trigger Scan` (reject invalid/common-word triggers) and `Lore Card Management` (store rejects malformed cards).
- `inventory-system`: modify `Synchronous SQLite Inventory Storage` (name canonicalization + quantity parsing on write).
- `context-compression`: modify `History Summarization` (second-person summary prompt).
- `game-engine`: modify `Generate Response Stream` / extraction path (validate extractor output before store writes).

## Impact

- `engine/memory/eventExtractor.js` — output schema + validation
- `engine/memory/memoryManager.js` — write-through path guards
- `engine/context.js` — trigger filtering + summarization prompt
- `engine/memory/structuredStore.js` — name normalization helpers
- Tests: extractor validation, trigger filtering, quantity parsing, name canonicalization
- No new dependencies (reuse `zod` already in `mcp/`, or a lightweight validator).
