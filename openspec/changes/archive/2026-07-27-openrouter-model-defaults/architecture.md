## Context

The `/api/ping` endpoint in `web/routes/game.js` returns a `models` array used by the frontend to populate the model selection dropdown. For LM Studio, this array is populated dynamically by querying the local server. For OpenRouter, the array currently contains only the single model from `OPENROUTER_MODEL` (or fallback `deepseek/deepseek-v4-flash`).

The frontend at `web/static/js/api/settings.js:13-30` already iterates over `data.models` to build `<option>` elements. The `/api/settings` POST endpoint at `web/routes/game.js:369-373` already accepts a `model` field and applies it to the active engine. Thus, the plumbing for dynamic model switching is already in place.

## Goals / Non-Goals

**Goals:**
- Expose a curated list of cost-effective OpenRouter models to the frontend.
- Display each model with a brief caption (strengths/weaknesses) in the dropdown.
- Preserve existing behavior: env-configured model is first and selected by default.

**Non-Goals:**
- Fetching models dynamically from OpenRouter's `/api/v1/models` endpoint (out of scope; may be a future enhancement).
- Making the list configurable via environment variable (out of scope; hard-coded constant is sufficient for now).
- Adding per-model pricing or token-limit metadata.

## Decisions

1. **Hard-coded constant in a dedicated module**: Define the model list as an exported array of `{ id, caption }` objects in a new file `web/openrouterModels.js`. This keeps the list easily editable and co-located with the route that uses it, without polluting `game.js`.
   - Alternative considered: Inline constant in `game.js`. Rejected because a separate file is cleaner and easier to find/edit.
   - Alternative considered: Env-var configurable list. Rejected as over-engineering for a small, curated set.

2. **Parallel `modelCaptions` array in API response**: Return `modelCaptions` as a separate array parallel to `models` in the `/api/ping` response. The frontend zips them when building `<option>` elements.
   - Alternative considered: Return `models` as an array of objects `{ id, caption }`. Rejected because it would break the existing frontend contract where `models` is a string array (LM Studio and mock backends return string arrays).

3. **Env model always first, deduplicated**: The env-configured model is placed at index 0. If it already exists in the curated list, it is not duplicated. This ensures the user's configured default is always prominent.

## Risks / Trade-offs

- **Stale model list**: Hard-coded list may become outdated as OpenRouter adds/removes models. → Mitigation: The list is in a single file (`web/openrouterModels.js`), making updates trivial. A future enhancement could fetch from OpenRouter's API.
- **Caption accuracy**: Captions describing strengths/weaknesses may become inaccurate over time. → Mitigation: Captions are high-level and unlikely to change rapidly; easy to edit in the same file.
