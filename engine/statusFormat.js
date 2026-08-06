// Single source of truth for the canonical status-line format
// (status-line-contract-residue).
//
// The engine commit path parses the three-field line via the shared
// `parseStatusLine` (engine/llm.js), so every producer — the default system
// prompt, the story presets, the mock narrator, and the web fallback opening
// scene — composes this exact string, and the frontend strip matches it. A
// single edit to this constant cannot silently drift any producer.
export const STATUS_FORMAT = '[Status: <Location Name> | Score: <Current Score> | Moves: <Moves>]';

// Complete-turn response exemplar (system-prompt-response-shape): three
// tone-neutral examples teaching the full response anatomy — in-fiction
// second-person prose followed by the canonical status line as the very last
// line, with nothing after it and nothing written for the player. The default
// system prompt and the story presets interpolate `${RESPONSE_SHAPE}`; the
// zero-build frontend default (web/static/js/app.js) inlines the identical
// literal, held honest by source-text pins in tests/test_engine_status_parsing.py.
// A single edit here cannot silently drift any producer.
export const RESPONSE_SHAPE = `RESPONSE SHAPE
Every response is narration prose followed by the canonical status line as the very last line — nothing comes after it, and nothing is written for the player. Match the prose's location to the status line's Location field.

Example 1 — exploring a new place:
Player: I follow the lantern light through the trees.
Narrator: The lantern light leads you to a mossy clearing where an old stone well stands beneath a twisted oak.
[Status: The Clearing by the Well | Score: 1 | Moves: 1]

Example 2 — talking to someone (no movement):
Player: I ask the innkeeper about the north road.
Narrator: The innkeeper wipes a mug and shrugs. "The north road's been swallowed by brambles for a generation, but there's a way through the cellar." He nods toward a trapdoor at the back.
[Status: The Broken Lantern Inn | Score: 3 | Moves: 2]

Example 3 — a simple action (no movement):
Player: I set my pack by the door.
Narrator: You set your pack down by the door and stamp the mud off your boots.
[Status: The Broken Lantern Inn | Score: 3 | Moves: 3]`;
