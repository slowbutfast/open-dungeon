## Why

System prompt status line examples currently omit `| Moves: <Moves>`, causing reasoning models (e.g. DeepSeek-R1) to deliberate and omit turn move counts from their generated status lines. This causes move count drift in `engine/llm.js`. Additionally, the OpenRouter model catalog requires the addition of top-tier roleplay model `sao10k/l3.3-euryale-70b` with verified pricing metadata.

## What Changes

- **Update Default System Prompt Examples**: Update `DEFAULT_SYSTEM_PROMPT` in `engine/index.js` examples to include `| Moves: <Moves>` (e.g., `[Status: West of House | Score: 0 | Moves: 0]`).
- **Add Euryale 70B Roleplay Model**: Add `sao10k/l3.3-euryale-70b` ("Sao10K: Llama 3.3 Euryale 70B") with pricing `$0.65/1M in · $0.75/1M out` to `OPENROUTER_MODELS` in `web/openrouterModels.js`.
- **Update Test Assertions**: Update `tests/test_openrouter_models.py` curated model list assertion to include `sao10k/l3.3-euryale-70b`.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `llm-routing`: Include `sao10k/l3.3-euryale-70b` in curated OpenRouter models catalog and align status line moves counter instructions.

## Impact

- Affected code: `engine/index.js`, `web/openrouterModels.js`, `tests/test_openrouter_models.py`.
- No breaking API changes.
