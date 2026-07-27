## Why

When using the OpenRouter backend, the model selection dropdown in the sidebar is populated with only the single model specified in `OPENROUTER_MODEL`. Users cannot switch models dynamically from the interface, limiting flexibility for cost/performance tradeoffs during gameplay.

## What Changes

- Add a curated list of default OpenRouter models (with slug + caption) to the `/api/ping` response when backend is `openrouter`.
- The env-configured model (`OPENROUTER_MODEL` or fallback `deepseek/deepseek-v4-flash`) is always first in the list and selected by default.
- Update the frontend dropdown to display each model's slug alongside a brief one-line caption describing its strengths and weaknesses.
- The existing `/api/settings` POST endpoint already supports dynamic model switching; no backend changes needed there.

## Capabilities

### New Capabilities
- `openrouter-model-catalog`: Curated list of default OpenRouter models with slugs and captions, exposed via `/api/ping` and rendered in the frontend dropdown.

### Modified Capabilities
- `llm-routing`: The `/api/ping` endpoint for OpenRouter backend now returns a `models` array with multiple entries instead of a single-element array.

## Impact

- **Backend**: `web/routes/game.js` — OpenRouter branch of `/api/ping` (lines 34-49) updated to return expanded `models` array and new `modelCaptions` field.
- **Frontend**: `web/static/js/api/settings.js` — dropdown rendering updated to display slug + caption.
- **API contract**: `/api/ping` response gains a `modelCaptions` array (parallel to `models`) for OpenRouter backend. Frontend already handles `models` array correctly.
- **Dependencies**: None. No new libraries or external API calls.
