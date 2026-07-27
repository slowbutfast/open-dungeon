## MODIFIED Requirements

### Requirement: OpenRouter Provider Support
The client orchestrator SHALL support routing narration requests through OpenRouter with custom model names, reasoning parameters, token usage tracking, and curated model options including `sao10k/l3.3-euryale-70b`.

#### Scenario: OpenRouter backend initialized
- **WHEN** environment variables specify `LLM_BACKEND=openrouter` and `OPENROUTER_API_KEY` is present
- **THEN** client is built with OpenRouter base URL, default headers, and model options array containing `sao10k/l3.3-euryale-70b` with verified pricing metadata
