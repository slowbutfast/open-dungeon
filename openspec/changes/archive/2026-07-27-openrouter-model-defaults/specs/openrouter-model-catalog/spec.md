## ADDED Requirements

### Requirement: Curated OpenRouter Model List
The system SHALL expose a hard-coded, easily editable list of default OpenRouter models, each consisting of a model slug (identifier) and a brief one-line caption describing its strengths and weaknesses.

#### Scenario: Model list contains expected entries
- **WHEN** the OpenRouter backend is active
- **THEN** the model list SHALL contain at minimum the following slugs with captions: `google/gemini-2.5-flash`, `deepseek/deepseek-chat`, `meta-llama/llama-3.3-70b-instruct`, `qwen/qwen-2.5-72b-instruct`, `google/gemini-2.5-pro`, `deepseek/deepseek-r1`

### Requirement: Env Model First and Deduplicated
The system SHALL place the environment-configured model (`OPENROUTER_MODEL` or fallback `deepseek/deepseek-v4-flash`) at the first position of the returned model list, and SHALL NOT duplicate it if it already exists in the curated list.

#### Scenario: Env model is first in list
- **WHEN** `OPENROUTER_MODEL` is set to `google/gemini-2.5-flash`
- **THEN** the returned `models` array SHALL have `google/gemini-2.5-flash` at index 0
- **AND** `google/gemini-2.5-flash` SHALL appear exactly once in the array

#### Scenario: Env model not in curated list
- **WHEN** `OPENROUTER_MODEL` is set to a model not in the curated list (e.g., `custom/model-x`)
- **THEN** the returned `models` array SHALL have `custom/model-x` at index 0
- **AND** the curated list entries SHALL follow in their original order

### Requirement: Model Captions Exposed via API
The `/api/ping` endpoint SHALL return a `modelCaptions` array parallel to the `models` array, where each index in `modelCaptions` corresponds to the caption for the model at the same index in `models`.

#### Scenario: Captions array matches models array length
- **WHEN** `/api/ping` is called with OpenRouter backend
- **THEN** `modelCaptions.length` SHALL equal `models.length`
- **AND** each element in `modelCaptions` SHALL be a non-empty string

### Requirement: Frontend Dropdown Displays Slug and Caption
The frontend model selection dropdown SHALL render each `<option>` element with text in the format `slug — caption`, where `slug` is the model identifier and `caption` is its one-line description.

#### Scenario: Dropdown shows slug and caption
- **WHEN** the model selection dropdown is populated from `/api/ping` response
- **THEN** each option's display text SHALL be `slug — caption`
- **AND** each option's `value` attribute SHALL be the slug only

### Requirement: Env Model Selected by Default
The frontend SHALL select the environment-configured model (returned as `data.model` from `/api/ping`) as the default selected option in the dropdown.

#### Scenario: Default selection matches env model
- **WHEN** the model selection dropdown is populated
- **THEN** the selected option SHALL be the model returned in `data.model`
