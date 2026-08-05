// Narration output-budget tests (narrator-style-fidelity).
//
// The status-line mandate applies to EVERY turn: the narrator MUST append the
// trailing `[Status: ...]` line. A "simple" object action gets a reduced
// output budget, but it must NEVER drop below a floor that leaves room for a
// short description PLUS the status line — otherwise a longish simple action
// (e.g. "turn around, walk west") truncates the status line mid-emission, the
// status parse finds nothing, and the spatial map freezes. This pins the
// budget function and its floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    computeNarrationBudget,
    SIMPLE_ACTION_MIN_TOKENS,
    sanitizeForHistory,
} from '../../engine/llm.js';

// ─── computeNarrationBudget ─────────────────────────────────────────────────

test('movement actions are NOT simple-capped (full budget)', () => {
    assert.deepEqual(computeNarrationBudget('do', 'go north', 300), { maxTokens: 300, isSimpleAction: false });
    assert.deepEqual(computeNarrationBudget('do', 'walk west toward the gate', 300), { maxTokens: 300, isSimpleAction: false });
});

test('simple object actions are capped but floored above the old 60/3 value', () => {
    const budget = computeNarrationBudget('do', 'take the sword', 300);
    assert.equal(budget.isSimpleAction, true);
    // 300/3 = 100 would truncate a description + status line; the floor keeps
    // room for the mandated status line.
    assert.equal(budget.maxTokens, SIMPLE_ACTION_MIN_TOKENS);
    assert.ok(SIMPLE_ACTION_MIN_TOKENS >= 200, 'simple-action floor must leave room for prose + status line');
});

test('a large maxTokens scales the simple budget without dropping below the floor', () => {
    assert.equal(computeNarrationBudget('do', 'examine the door', 900).maxTokens, 300);
    assert.equal(computeNarrationBudget('do', 'turn around', 150).maxTokens, SIMPLE_ACTION_MIN_TOKENS);
});

test('non-do actions keep the full budget', () => {
    assert.deepEqual(computeNarrationBudget('say', 'hello', 300), { maxTokens: 300, isSimpleAction: false });
    assert.deepEqual(computeNarrationBudget('story', 'The wind howls.', 300), { maxTokens: 300, isSimpleAction: false });
});

// ─── sanitizeForHistory: truncated [Status: fragments ───────────────────────

test('sanitizeForHistory strips a truncated [Status: fragment (no closing bracket)', () => {
    const input = 'You turn and walk back onto the open moor.\n[Status: Desolate Moor';
    assert.equal(sanitizeForHistory(input), 'You turn and walk back onto the open moor.');
});

test('sanitizeForHistory still strips the full canonical status line', () => {
    assert.equal(sanitizeForHistory('You enter the vault.\n[Status: Vault | Score: 1 | Moves: 1]'),
        'You enter the vault.');
});
