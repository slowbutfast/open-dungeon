## Automated Tests

- `python3 -m unittest discover -s tests`: Runs the Python unittest suite verifying:
  - Integration of backend REST endpoints (`test_api_endpoints.py`).
  - Context summarize extraction and lore keyword activations (`test_memory_features.py`).
- `pytest tests/e2e/`: Verifies browser screens, preset loader, settings dashboard, and save files.

## Manual Verification

### LLM Routing Checks
- **WHEN** environment variable `LLM_BACKEND` is set to "openrouter" with valid keys and a prompt is sent
- **THEN** requests are routed to OpenRouter, cost estimate updates are streamed, and the prompt completion is narrated correctly.
- **WHEN** `LLM_BACKEND` is set to "lmstudio"
- **THEN** requests are directed to local port 1234, the server queries the model list, auto-detects the active model key, and narrations type out in CRT style.
