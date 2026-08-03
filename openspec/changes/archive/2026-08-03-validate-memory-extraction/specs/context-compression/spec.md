## MODIFIED Requirements

### Requirement: History Summarization
The game engine SHALL compress the oldest history turns by prompting the LLM to merge them into the running adventure summary, archive the summarized turns, and remove them from active history.

The summarization prompt SHALL require second-person narrative voice, consistent with the game's prompt contract, so the injected summary does not pull narration toward third person over a long session.

#### Scenario: Merge and archive turns
- **WHEN** summarization is executed on the oldest 4 turns of history
- **THEN** the LLM is queried to produce an updated summary combining the old summary and the 4 turns, the summary is updated, and the turns are moved from active history to archived history

#### Scenario: Summary holds second person
- **WHEN** a summary is generated and injected as context
- **THEN** it uses the same second-person perspective mandated by the game prompts (e.g., "you", not "the protagonist")
