## Automated Tests

- `python -m pytest tests/ -v -k openrouter`: Verify that the `/api/ping` endpoint returns the expected model list when `LLM_BACKEND=openrouter`. Check that the env-configured model is first, deduplicated, and that `modelCaptions` array length matches `models` array length.
- `python -m pytest tests/ -v -k model_dropdown`: Verify frontend dropdown rendering logic (if unit tests exist for `settings.js`). Check that each `<option>` has `value` set to the slug and display text in `slug — caption` format.

## Manual Verification

- **Model list in API response**:
  - **WHEN** server is started with `LLM_BACKEND=openrouter` and `OPENROUTER_MODEL=google/gemini-2.5-flash`
  - **THEN** `curl http://localhost:3000/api/ping` returns `models` array with `google/gemini-2.5-flash` at index 0, followed by the other curated models (no duplicates), and `modelCaptions` array of equal length with non-empty strings.

- **Dropdown displays slug and caption**:
  - **WHEN** the web UI is loaded and the sidebar model dropdown is opened
  - **THEN** each option displays text in the format `slug — caption` (e.g., `google/gemini-2.5-flash — fast, cost-efficient`)
  - **AND** the env-configured model is selected by default.

- **Model switching applies change**:
  - **WHEN** a different model is selected from the dropdown
  - **THEN** the `/api/settings` POST is called with the new model
  - **AND** subsequent LLM requests use the newly selected model (verifiable via debug logs or response headers).

- **Env model not in curated list**:
  - **WHEN** `OPENROUTER_MODEL` is set to a custom model not in the curated list (e.g., `custom/model-x`)
  - **THEN** the dropdown shows `custom/model-x` first, followed by the curated list in original order.
