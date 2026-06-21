## ADDED Requirements

### Requirement: Model Backend Selection
The system SHALL resolve the active LLM backend based on environment configurations, defaulting to local LM Studio, while enabling online OpenRouter or mock configurations when requested.

#### Scenario: Route to mock backend
- **WHEN** environment variable `MOCK_LLM` is set to "1"
- **THEN** backend type is resolved as "mock"

#### Scenario: Route to OpenRouter backend
- **WHEN** `MOCK_LLM` is not "1" and `LLM_BACKEND` is set to "openrouter"
- **THEN** backend type is resolved as "openrouter"

#### Scenario: Route to LM Studio backend
- **WHEN** `MOCK_LLM` is not "1" and `LLM_BACKEND` is not "openrouter"
- **THEN** backend type is resolved as "lmstudio"

### Requirement: Client Construction
The orchestrator SHALL construct the OpenAI SDK client instance using the appropriate baseURL, headers, and api key configurations suited for the resolved backend.

#### Scenario: Construct OpenRouter client
- **WHEN** backend type is "openrouter"
- **THEN** client is built with baseURL "https://openrouter.ai/api/v1", using the `OPENROUTER_API_KEY`, referer header, and reasoning effort parameters

#### Scenario: Construct LM Studio client
- **WHEN** backend type is "lmstudio"
- **THEN** client is built with baseURL using dynamic `LM_STUDIO_HOST` and `LM_STUDIO_PORT` values, with API key set to "lm-studio"

### Requirement: Loaded Model Auto-Detection
The client orchestrator SHALL auto-detect the active model identifier by querying the models REST endpoint, or fallback to returning the default model configurations.

#### Scenario: Detect loaded model in LM Studio
- **WHEN** backend is LM Studio and models query succeeds
- **THEN** the system parses the first loaded instance of type "llm" and returns its key identifier

### Requirement: Failover/Fallback Recovery
When a streaming completion request fails on the active model, the system SHALL attempt to query the list of available models and automatically fallback to retrying execution on a different loaded model.

#### Scenario: Failover on completion error
- **WHEN** chat completion fails on the active model and a different loaded model is available
- **THEN** the active model is updated to the fallback model key, the state is saved, and the request is retried and executed successfully
