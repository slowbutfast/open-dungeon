## Why

Restore the accidentally cleared game and diagnostics specifications with detailed requirements and purpose descriptions, and add a specification defining local (LM Studio) and online (OpenRouter) LLM routing and fallback logic.

## What Changes

No code changes are made. The proposal restores specifications for:
- `game-engine`
- `context-compression`
- `lore-cards`
- `ai-lore-scanner`
- `terminal-cli`
- `diagnostics-suite`

It also introduces the new `llm-routing` capability to specify local/online model selection, client setup, and failover behavior.

## Capabilities

### New Capabilities
- `llm-routing`: Specifies system logic for connecting to and routing requests between local LLM backends (LM Studio) and online hosts (OpenRouter), including model fallback recovery.

### Modified Capabilities
- `game-engine`: Restore full specification and detailed purpose.
- `context-compression`: Restore full specification and detailed purpose.
- `lore-cards`: Restore full specification and detailed purpose.
- `ai-lore-scanner`: Restore full specification and detailed purpose.
- `terminal-cli`: Restore full specification and detailed purpose.
- `diagnostics-suite`: Restore full specification and detailed purpose.

## Impact

None. This is a specifications-only change.
