# Narrator Response Shape Specification

## Purpose
The narrator's system prompt carries complete-turn response examples so the narrator emits a well-formed turn (in-fiction prose + the canonical status line as the final line) without inferring or guessing the expected output anatomy.

## Requirements

### Requirement: Complete-Turn Response Examples
The narrator system prompt SHALL carry complete-turn response-shape examples so the narrator does not have to infer the expected output anatomy. The examples SHALL be provided by a single shared `RESPONSE_SHAPE` constant (`engine/statusFormat.js`), interpolated by the default system prompt and all four story presets and declared as the identical literal by the zero-build frontend default.

Each example SHALL demonstrate the full turn shape: in-fiction second-person prose, nothing written for the player character, no trailing questions, and the canonical status line as the very last line with nothing after it. The examples SHALL cover the exploring-a-new-place, dialogue, and simple-action turn types, and SHALL keep the status line's `Location` consistent with the prose (advancing on movement, repeating when nothing moved).

#### Scenario: Examples present in every prompt producer
- **WHEN** the default system prompt, a story preset, or the zero-build frontend default is composed
- **THEN** it contains the `RESPONSE_SHAPE` exemplar — either via `${RESPONSE_SHAPE}` interpolation or the identical inlined literal — covering the three turn types

#### Scenario: Examples teach the final status line
- **WHEN** the narrator is prompted
- **THEN** the examples show the canonical `[Status: ...]` line as the final line of a complete turn, with no content after it

#### Scenario: Examples are tone-neutral and grounded
- **WHEN** the narrator is prompted
- **THEN** the example prose does not lean toward any single narrator style, does not reference items the example scene never establishes, and does not end with a question to the player
