// Single source of truth for the canonical status-line format
// (status-line-contract-residue).
//
// The engine commit path parses the three-field line via the shared
// `parseStatusLine` (engine/llm.js), so every producer — the default system
// prompt, the story presets, the mock narrator, and the web fallback opening
// scene — composes this exact string, and the frontend strip matches it. A
// single edit to this constant cannot silently drift any producer.
export const STATUS_FORMAT = '[Status: <Location Name> | Score: <Current Score> | Moves: <Moves>]';
