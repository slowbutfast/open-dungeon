# Narrator Fidelity

## Purpose
The narrator must keep its status line honest (emitting it every turn and advancing `Location` when it moves the player) and hold a stable style once adopted, so the engine's committed state and the narration stay in agreement — the prompt-contract + pinned-style mechanism that keeps the spatial map growing.

## Requirements
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

### Requirement: Stale-Status Recovery
When the status line is missing (truncated/empty) or the narrator repeats its own previous status line (the stale-echo signature), the engine SHALL recover a proposed location from the narration's (or the player action's) arrival landmarks and reconcile it, so the spatial map keeps growing even when the narrator will not comply with the mandate. A CHANGED status line SHALL always be honored; the fallback SHALL be deterministic (no extra LLM call) and SHALL NOT fabricate a location from prose that does not narrate arrival.

#### Scenario: Missing status line recovers a landmark
- **WHEN** the narrator truncates or omits the status line but its prose narrates travel
- **THEN** the engine proposes a location from the narration's arrival landmark and reconciles it, growing the map

#### Scenario: Repeated status line recovers a landmark
- **WHEN** the narrator repeats its own previous status line while its prose narrates travel to a new place
- **THEN** the engine proposes the narration's landmark instead of the repeated (stale) location

#### Scenario: Honest status always wins
- **WHEN** the narrator emits a CHANGED status line
- **THEN** that location is committed even if the prose words differ from it

#### Scenario: Non-arrival prose fabricates nothing
- **WHEN** the status line is missing or repeated but the prose does not narrate arrival (refusal, scene description, same-place description)
- **THEN** no location is recovered and the engine holds position
