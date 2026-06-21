# diagnostics-suite Specification

## Purpose
Defines the developer utility tools, enabling rapid connectivity checks, listing currently loaded models, and interactive API chat capability to isolate neural link performance.
## Requirements
### Requirement: Interactive Connection Chat Tool
The interactive chat utility SHALL allow running lightweight completions with customizable temperature parameters and system prompts directly from the CLI.

#### Scenario: Running interactive chat
- **WHEN** developer runs chat.py with `-s` system prompt option and `-t` temperature option
- **THEN** it initializes the connection and hosts a basic conversation loop with the LLM

### Requirement: Network Diagnostic Checking
The diagnostics suite SHALL check host reachability on the configured port and return helpful recommendations if network packets are blocked.

#### Scenario: Running network diagnosis
- **WHEN** developer executes diagnose_network.py
- **THEN** it validates host PC network settings and displays connection recommendations

### Requirement: Loaded Model Identification
The diagnostic tools SHALL query the LM Studio endpoint to retrieve loaded models and display their identifiers.

#### Scenario: Listing models
- **WHEN** developer executes list_models.py
- **THEN** the system queries the server and displays loaded model identifiers

