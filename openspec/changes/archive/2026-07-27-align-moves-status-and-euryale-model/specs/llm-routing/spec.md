## MODIFIED Requirements

### Requirement: Loaded Model Auto-Detection
The client orchestrator SHALL auto-detect the active model identifier by querying the models REST endpoint, or fallback to returning the default model configurations. For the OpenRouter backend, the `/api/ping` endpoint SHALL return a curated list of default models in the `models` array (including `sao10k/l3.3-euryale-70b`), with the environment-configured model first.

#### Scenario: Detect loaded model in LM Studio
- **WHEN** backend is LM Studio and models query succeeds
- **THEN** the system parses the first loaded instance of type "llm" and returns its key identifier

#### Scenario: Return curated model list for OpenRouter
- **WHEN** backend is OpenRouter
- **THEN** the `/api/ping` endpoint SHALL return a `models` array containing the curated list of default OpenRouter models (including `sao10k/l3.3-euryale-70b`)
- **AND** the environment-configured model (`OPENROUTER_MODEL` or fallback) SHALL be at index 0
- **AND** a parallel `modelCaptions` array SHALL be returned with one-line descriptions and per-MTok pricing for each model
