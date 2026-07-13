## ADDED Requirements

### Requirement: Retro CRT Console Rendering
The terminal interface SHALL utilize rich console features to display a split terminal window, an active top status bar containing location, score, and moves, and a green phosphor style text renderer.

#### Scenario: Drawing status bar
- **WHEN** status bar needs updating during the game loop
- **THEN** the system draws a formatted, inverse-video header line at the top with location, score, and moves, preserving the terminal margins

### Requirement: Command Shortcut Processing
The input handler SHALL parse user actions prefixed with `/` as terminal command commands and execute the corresponding action or menu toggle.

#### Scenario: Running help command
- **WHEN** user inputs `/help`
- **THEN** the system displays the help menu handbook screen with available controls

#### Scenario: Running undo command
- **WHEN** user inputs `/undo`
- **THEN** the engine reverts the last turns and displays a success notification

#### Scenario: Saving via command
- **WHEN** user inputs `/save`
- **THEN** the engine saves the state and prints the adventure ID

### Requirement: Vintage Terminal Typewriter Streaming
The console interface SHALL stream LLM chunks character-by-character with a small sleep delay to simulate a vintage typewriter effect, while stripping status lines from raw narration text.

#### Scenario: Narrating stream chunks
- **WHEN** engine yields narrative chunks from LLM completion
- **THEN** the typewriter prints characters to stdout with flush and delay, omitting matches of the status line pattern `[Status: ... | Score: ...]`
