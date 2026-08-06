## MODIFIED Requirements

### Requirement: Status-Line Fidelity
The narrator SHALL emit a canonical status line at the end of every response, and SHALL advance the `Location` field whenever its narration moves the player to a new or different place. The engine SHALL commit location from that line as before; the prompt contract is the mechanism that keeps the line honest.

The prompt contract SHALL reinforce the mandate with complete-turn response-shape examples: the `RESPONSE_SHAPE` constant demonstrates the full response anatomy — in-fiction prose followed by the canonical status line as the very last line, with no trailing questions — so the narrator emits a well-formed turn without inferring the shape.

#### Scenario: Narrator moves the player and advances the location
- **WHEN** the narrator's prose describes the player traveling to a new place
- **THEN** the status line's `Location` field names that new place (not the previous one), so the engine reconciles a new room

#### Scenario: Narrator stays put
- **WHEN** the narrator does not move the player (scene continues in place)
- **THEN** the status line repeats the current location and no new room is created

#### Scenario: Status line always emitted
- **WHEN** a turn completes
- **THEN** a canonical `[Status: ...]` line is present (never silently dropped), keeping the engine's reconciliation path fed

#### Scenario: Response-shape examples teach the full turn anatomy
- **WHEN** the narrator is prompted
- **THEN** the system message carries complete-turn examples whose prose is in-fiction, names no action for the player, ends without a trailing question, and closes with the canonical status line as the final line
