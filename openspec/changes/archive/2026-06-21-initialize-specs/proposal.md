## Why

Establish and document the initial specifications for the current version of the Retro AIDungeon terminal adventure game and diagnostics suite to serve as a baseline for future features and modifications.

## What Changes

No functional code changes are being made. This change defines the requirements and specifications for the existing components of the workspace, including the retro terminal CLI, adventure engine, auto-summarization, lore context cards, AI lore scanner, and diagnostics tools.

## Capabilities

### New Capabilities
- `game-engine`: Handles adventure logic, action formatting, LLM requests, location/score/moves tracking, and saving/loading game state.
- `context-compression`: Automatically compresses old game history turns into a running summary to prevent context bloat.
- `lore-cards`: Manages lorebook cards and scans user input to inject triggered lore card descriptions into the game system prompt.
- `ai-lore-scanner`: Uses LLM prompts to scan adventure history logs and automatically extract new character, location, item, or lore cards.
- `terminal-cli`: Provides a retro-styled CRT command-line terminal with keyboard shortcuts, command parsing, and typewriter printing effect.
- `diagnostics-suite`: Diagnostic scripts to verify connections, loaded models, response streaming, and environment variables.

### Modified Capabilities

## Impact

None. This is a specifications-only change.
