## ADDED Requirements

### Requirement: Status-Line Fidelity
The narrator SHALL emit a canonical status line at the end of every response, and SHALL advance the `Location` field whenever its narration moves the player to a new or different place. The engine SHALL commit location from that line as before; the prompt contract is the mechanism that keeps the line honest.

#### Scenario: Narrator moves the player and advances the location
- **WHEN** the narrator's prose describes the player traveling to a new place
- **THEN** the status line's `Location` field names that new place (not the previous one), so the engine reconciles a new room

#### Scenario: Narrator stays put
- **WHEN** the narrator does not move the player (scene continues in place)
- **THEN** the status line repeats the current location and no new room is created

#### Scenario: Status line always emitted
- **WHEN** a turn completes
- **THEN** a canonical `[Status: ...]` line is present (never silently dropped), keeping the engine's reconciliation path fed

### Requirement: Stable Narrator Style
The narrator SHALL adopt the tone/register implied by the player's opening and SHALL hold that style consistently for the session (no mid-session tonal drift).

#### Scenario: Style adopted from the player's opening
- **WHEN** the player opens in a particular tone (e.g. grim, whimsical, terse, florid)
- **THEN** the narrator adopts a matching style for the session

#### Scenario: Style held across turns
- **WHEN** the session continues across many turns
- **THEN** the narrator does not switch tone partway through (stays consistent with the adopted style)

### Requirement: Pinned Style Context
The engine SHALL expose the adopted narrator style as a `[NARRATOR STYLE]` context block so later turns keep it pinned. The block SHALL be registry-driven (a single entry in `engine/contextBlocks.js`) and SHALL be strip-eligible by the sanitizer like every other registered block.

#### Scenario: Style block is injected and strip-eligible
- **WHEN** a narrator style has been adopted
- **THEN** the `[NARRATOR STYLE]` block appears in the composed system message and, if echoed back, is stripped from history by the registry-derived sanitizer
