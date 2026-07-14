## Why

The default system prompt's examples in the game engine omit the `Moves` field from the status line, while the prompt's instructions request it. This mismatch confuses reasoning models (like DeepSeek-R1), causing them to omit `Moves` from the status line. When omitted, the engine falls back to blindly incrementing the moves count by 1 on every turn, causing state drift during non-move turns or when semantic moves differ.

## What Changes

- Update the default system prompt (`DEFAULT_SYSTEM_PROMPT` in `engine/index.js`) examples to include the `Moves` field.
- Align the prompts to match the parser's expectation of `[Status: <Location Name> | Score: <Current Score> | Moves: <Current Moves>]`.

## Capabilities

### New Capabilities

*(None)*

### Modified Capabilities

- `game-engine`: The system prompt format requirements are updated to ensure all default prompt examples include the Moves counter, aligning with engine expectations.

## Impact

- Affects `engine/index.js` (specifically `DEFAULT_SYSTEM_PROMPT`).
- Does not affect the deprecated game management/CLI code or Python test files.
