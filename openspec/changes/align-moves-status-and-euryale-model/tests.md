## Automated Tests

- `python3 -m pytest tests/test_openrouter_models.py -v`: Verifies `/api/ping` includes `sao10k/l3.3-euryale-70b` in curated model catalog with captions and pricing metadata.
- `python3 -m pytest tests/test_api_endpoints.py -v`: Verifies status line parsing and response streaming across REST API.

## Manual Verification

- **Model Selection Dropdown**:
  - **WHEN** user selects `sao10k/l3.3-euryale-70b` from the model selector in settings
  - **THEN** dropdown displays `sao10k/l3.3-euryale-70b — Sao10K: Llama 3.3 Euryale 70B ($0.65/1M in · $0.75/1M out)` and toast notification confirms selection.
