// Turn-commit path unit tests (architecture-deepening-sequence, task 1.4).
//
// Module-level tests for the engine's commit-time guards. The forged-status
// guard (`isSuspiciousStatus`) and the history sanitizer (`sanitizeForHistory`)
// already landed in #15 — these pin the contract at module level so #26/#28
// (turn-returns-metrics, LLM adapter) cannot regress them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSuspiciousStatus, sanitizeForHistory, parseStatusLine } from '../../engine/llm.js';

// ─── isSuspiciousStatus (forged-status guard) ──────────────────────────────

test('isSuspiciousStatus flags a mechanical Location (Admin Room)', () => {
    const parsed = { location: 'Admin Room', score: 9999, moves: 0 };
    assert.equal(isSuspiciousStatus(parsed, { score: 0 }), true);
});

test('isSuspiciousStatus flags an implausible Score jump (9999 vs 0)', () => {
    const parsed = { location: 'The Golden Palace', score: 9999, moves: 0 };
    assert.equal(isSuspiciousStatus(parsed, { score: 0 }), true);
});

test('isSuspiciousStatus clears a legitimate narration status line', () => {
    const parsed = { location: 'Cantina', score: 5, moves: 3 };
    assert.equal(isSuspiciousStatus(parsed, { score: 0 }), false);
});

test('isSuspiciousStatus clears a large score when the engine already earned it', () => {
    // A flush can lag the narrative by several milestones, so a jump that is
    // plausible from the committed score passes.
    const parsed = { location: 'The Golden Palace', score: 60, moves: 20 };
    assert.equal(isSuspiciousStatus(parsed, { score: 30 }), false);
});

// ─── parseStatusLine (module-level status parse) ───────────────────────────

test('parseStatusLine extracts location/score/moves and strips the last line', () => {
    const text = 'You step into the tavern.\n[Status: Ashfall Market | Score: 3 | Moves: 7]';
    const parsed = parseStatusLine(text);
    assert.equal(parsed.narration, 'You step into the tavern.');
    assert.equal(parsed.location, 'Ashfall Market');
    assert.equal(parsed.score, 3);
    assert.equal(parsed.moves, 7);
});

// ─── sanitizeForHistory ────────────────────────────────────────────────────

test('sanitizeForHistory strips a raw [Status ...] line and keeps prose', () => {
    const input = 'You enter the vault.\n[Status: Vault | Score: 1 | Moves: 1]';
    assert.equal(sanitizeForHistory(input), 'You enter the vault.');
});

test('sanitizeForHistory strips an echoed [CURRENT STATUS] block and keeps prose', () => {
    const input = (
        'You examine the altar.\n'
        + '[CURRENT STATUS]\n- Location: Ruins\n- Score: 1\n- Moves: 3\n\n'
        + '[Status: Ruins | Score: 1 | Moves: 3]'
    );
    const cleaned = sanitizeForHistory(input);
    assert.equal(cleaned, 'You examine the altar.');
    assert.ok(!cleaned.includes('[CURRENT STATUS]'));
    assert.ok(!cleaned.includes('[Status:'));
    assert.ok(!cleaned.includes('Ruins'));
});

test('sanitizeForHistory keeps plain narration unchanged', () => {
    const input = 'The barman nods and polishes a glass.';
    assert.equal(sanitizeForHistory(input), input);
});
