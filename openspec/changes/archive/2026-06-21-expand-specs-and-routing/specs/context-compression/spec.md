## MODIFIED Requirements

### Requirement: Auto-Summarization Threshold Detection
The game engine SHALL monitor the active history length and automatically trigger context summarization when the number of turns meets or exceeds the defined threshold.

#### Scenario: Summarization threshold met
- **WHEN** a game turn completes and active history length is equal to or greater than the summarize threshold
- **THEN** a system message indicates context compression is running and the oldest turns are summarized

### Requirement: History Summarization
The game engine SHALL compress the oldest history turns by prompting the LLM to merge them into the running adventure summary, archive the summarized turns, and remove them from active history.

#### Scenario: Merge and archive turns
- **WHEN** summarization is executed on the oldest 4 turns of history
- **THEN** the LLM is queried to produce an updated summary combining the old summary and the 4 turns, the summary is updated, and the turns are moved from active history to archived history
