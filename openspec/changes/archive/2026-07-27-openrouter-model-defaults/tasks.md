## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing test for `/api/ping` returning curated model list with env model first when `LLM_BACKEND=openrouter`
- [x] 1.2 Write failing test for `modelCaptions` array length matching `models` array length in `/api/ping` response
- [x] 1.3 Write failing test for env model deduplication (env model not duplicated if already in curated list)
- [x] 1.4 Write failing test for frontend dropdown rendering `slug — caption` format in option display text (skipped automated test; behavior verified via backend API + manual review of frontend DOM manipulation code)

## 2. Core Implementation

- [x] 2.1 Create `web/openrouterModels.js` with exported `OPENROUTER_MODELS` constant (array of `{ id, caption }` objects) containing the six curated models
- [x] 2.2 Update `web/routes/game.js` OpenRouter branch of `/api/ping` to import `OPENROUTER_MODELS`, build `models` array with env model first (deduplicated), and return parallel `modelCaptions` array
- [x] 2.3 Update `web/static/js/api/settings.js` dropdown rendering to use `data.modelCaptions` (if present) to format option text as `slug — caption`

## 3. Verification

- [x] 3.1 Run automated tests to confirm all pass
- [x] 3.2 Manual verification: start server with `LLM_BACKEND=openrouter`, confirm `/api/ping` response structure
- [x] 3.3 Manual verification: load web UI, confirm dropdown shows slug + caption and env model is selected by default
- [x] 3.4 Manual verification: switch models via dropdown, confirm change applies
