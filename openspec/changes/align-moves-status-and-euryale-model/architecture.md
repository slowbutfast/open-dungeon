## Context

System prompt status line examples in `engine/index.js` currently omit `| Moves: <Moves>`, causing reasoning models to omit turn move counts from status output. Additionally, `web/openrouterModels.js` requires the addition of top-tier roleplay model `sao10k/l3.3-euryale-70b` ($0.65/1M in · $0.75/1M out).

## System Architecture Diagram

```mermaid
flowchart TD
    SP[DEFAULT_SYSTEM_PROMPT in engine/index.js] -->|Includes Moves in Examples| LLM[LLM Output Stream]
    LLM -->|Status Line with Moves| REGEX[Status Regex Match in engine/llm.js]
    REGEX -->|Updates state.moves| STATE[AdventureState]
    
    API[/api/ping] -->|Includes Euryale 70B| UI[Model Selection Dropdown]
```

## Goals / Non-Goals

**Goals:**
- Update `DEFAULT_SYSTEM_PROMPT` examples in `engine/index.js` to include `| Moves: <Moves>`.
- Add `sao10k/l3.3-euryale-70b` to curated models list in `web/openrouterModels.js` and test assertions in `tests/test_openrouter_models.py`.

**Non-Goals:**
- Refactoring memory state or engine state stores.

## Decisions

- **Consistent System Examples**: Aligns few-shot examples with system instructions so reasoning models do not omit status line fields.
- **Model Addition**: Verified live API pricing ($0.65/1M in · $0.75/1M out) added to `OPENROUTER_MODELS`.

## Risks / Trade-offs

- [Risk] Existing saved status prompts might differ → Mitigation: Regex parser falls back gracefully if `Moves` is omitted.
