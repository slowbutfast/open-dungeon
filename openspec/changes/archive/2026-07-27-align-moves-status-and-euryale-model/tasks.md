## 1. Test Scaffolding (TDD)

- [x] 1.1 Update `tests/test_openrouter_models.py` assertion to include `sao10k/l3.3-euryale-70b` in `curated_ids`.

## 2. Core Implementation

- [x] 2.1 Update `DEFAULT_SYSTEM_PROMPT` in `engine/index.js` examples to include `| Moves: <Moves>`.
- [x] 2.2 Add `sao10k/l3.3-euryale-70b` with pricing `$0.65/1M in · $0.75/1M out` to `OPENROUTER_MODELS` in `web/openrouterModels.js`.
- [x] 2.3 Run test suite and verify implementation.
