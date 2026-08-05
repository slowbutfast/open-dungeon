// Narrator style fidelity contract tests (narrator-style-fidelity).
//
// TDD-first (tasks 1.1-1.2): pin the `[NARRATOR STYLE]` registry block and the
// deterministic style detector. These fail until `engine/contextBlocks.js`
// registers the block and `engine/narratorStyle.js` exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXT_BLOCKS } from '../../engine/contextBlocks.js';
import { LlmOrchestrator, sanitizeForHistory } from '../../engine/llm.js';
import { detectNarratorStyle } from '../../engine/narratorStyle.js';

// ─── [NARRATOR STYLE] block registration ───────────────────────────────────

test('CONTEXT_BLOCKS registers a NARRATOR STYLE block', () => {
    const block = CONTEXT_BLOCKS.find(b => b.header === 'NARRATOR STYLE');
    assert.ok(block, '[NARRATOR STYLE] block must be registered');
    assert.equal(typeof block.enabled, 'function');
    assert.equal(typeof block.build, 'function');
});

test('[NARRATOR STYLE] block is excluded when no style is captured', () => {
    const block = CONTEXT_BLOCKS.find(b => b.header === 'NARRATOR STYLE');
    assert.equal(block.enabled({ narratorStyle: null }, {}), false);
    assert.equal(block.enabled({ narratorStyle: undefined }, {}), false);
});

test('[NARRATOR STYLE] block renders when a style is set', () => {
    const block = CONTEXT_BLOCKS.find(b => b.header === 'NARRATOR STYLE');
    assert.equal(block.enabled({ narratorStyle: 'whimsical' }, {}), true);
    const body = block.build({ narratorStyle: 'whimsical' });
    assert.ok(body.includes('Whimsical'), `body must carry the style directive: ${body}`);
    assert.ok(body.includes('do not drift'), `body must pin session consistency: ${body}`);
});

// ─── Style detection (deterministic keyword classifier) ────────────────────

test('detectNarratorStyle maps opening tone keywords to a style label', () => {
    assert.equal(detectNarratorStyle('A grim, rain-slicked world awaits.'), 'grim');
    assert.equal(detectNarratorStyle('A whimsical fairy-tale forest'), 'whimsical');
    assert.equal(detectNarratorStyle('epic and heroic quest'), 'heroic');
    assert.equal(detectNarratorStyle('Keep it terse and curt'), 'terse');
});

test('detectNarratorStyle defaults to direct for neutral openings', () => {
    assert.equal(detectNarratorStyle('look around'), 'direct');
    assert.equal(detectNarratorStyle('', ''), 'direct');
});

// ─── Sanitizer covers the new block automatically (registry-derived) ───────

test('sanitizeForHistory strips an echoed [NARRATOR STYLE] block', () => {
    const input = (
        'The wind howls.\n'
        + '[NARRATOR STYLE]\n'
        + '- Adopted style: Grim\n'
        + '- Hold this tone consistently for the entire session; do not drift.\n\n'
        + 'Then the door creaks.'
    );
    const cleaned = sanitizeForHistory(input);
    assert.equal(cleaned, 'The wind howls.\nThen the door creaks.');
    assert.ok(!cleaned.includes('[NARRATOR STYLE]'));
    assert.ok(!cleaned.includes('do not drift'));
});

// ─── Composition: the block appears once a style is captured ───────────────

test('composed message includes [NARRATOR STYLE] once a style is captured', () => {
    const orchestrator = new LlmOrchestrator();
    const state = {
        systemPrompt: 'You are the narrator.',
        title: 'Wanderer',
        location: 'Starting Location',
        score: 0,
        moves: 1,
        summary: '',
        narratorStyle: 'grim',
    };
    const composed = orchestrator.buildSystemMessage(state, [], [], []);
    assert.ok(composed.content.includes('[NARRATOR STYLE]'));
    assert.ok(composed.content.includes('Grim'));
});
