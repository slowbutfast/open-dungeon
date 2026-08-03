// LLM adapter unit tests (architecture-deepening-sequence, #28 llm-adapter-unification).
//
// The adapter (engine/llmAdapter.js) owns the LLM wire path: request shaping,
// the tracker wrap, and mock-intent dispatch. These tests pin the intent-keyed
// mock contract — the mock must respond by intent, never by prompt substring —
// plus the streaming-narration return shape and the tracker kind labels.
//
// INTENDED TO FAIL TODAY: engine/llmAdapter.js does not exist yet, and the mock
// (engine/mockOpenAI.js) still dispatches on prompt substrings, so the
// event_extraction test below cannot pass. These assertions are the TDD floor
// for #28.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { llmCall, llmEmbed } from '../../engine/llmAdapter.js';
import { MockOpenAI } from '../../engine/mockOpenAI.js';
import { llmTracker } from '../../engine/llmTracker.js';

function makeMessages(prompt) {
    return [
        { role: 'system', content: 'You are a test assistant.' },
        { role: 'user', content: prompt }
    ];
}

test('llmCall narration with stream:true returns an async iterable and records a narration tracker call', async (t) => {
    llmTracker.clear();
    const client = new MockOpenAI();

    const result = await llmCall(client, 'narration', {
        messages: makeMessages('look around'),
        model: 'mock-gemma',
        temperature: 0.5,
        maxTokens: 300,
        stream: true
    });

    assert.ok(result.stream, 'narration must return a stream');
    assert.equal(typeof result.stream[Symbol.asyncIterator], 'function',
        'stream must be an async iterable');

    const chunks = [];
    for await (const chunk of result.stream) {
        chunks.push(chunk);
    }
    assert.ok(chunks.length > 0, 'stream must yield chunks');
    const text = chunks.map(c => c.choices?.[0]?.delta?.content || '').join('');
    assert.ok(text.includes('cantina'), 'canned narration must stream the cantina text');

    const narrationCalls = llmTracker.getCalls().filter(c => c.type === 'narration');
    assert.equal(narrationCalls.length, 1, 'exactly one narration tracker call must be recorded');
});

test('llmCall event_extraction returns the canned extraction JSON WITHOUT the prompt containing "JSON array of objects" (intent dispatch — fails today)', async (t) => {
    llmTracker.clear();
    const client = new MockOpenAI();

    // The prompt deliberately does NOT contain any of the old mock's substring
    // keys ("JSON array of objects", "Lore Card", "autoGenerateCards",
    // "CHARACTER GENESIS", "compress the following log", "suggestion"). Today
    // the prompt-keyed mock falls through to the default narration, so this
    // fails until the mock dispatches by intent.
    const response = await llmCall(client, 'event_extraction', {
        messages: makeMessages('Extract gameplay events, inventory changes, lore facts, offers, and goals from this adventure log.'),
        model: 'mock-gemma',
        temperature: 0.1,
        maxTokens: 2048
    });

    const text = response.choices[0].message.content;
    assert.doesNotMatch(text, /JSON array of objects/);
    const parsed = JSON.parse(text);
    assert.ok(Array.isArray(parsed.events), 'canned extraction must be parseable JSON with an events array');
    assert.ok(Array.isArray(parsed.inventory_changes));
    assert.ok(Array.isArray(parsed.lore_facts));

    const extractionCalls = llmTracker.getCalls().filter(c => c.type === 'event_extraction');
    assert.equal(extractionCalls.length, 1, 'exactly one extraction tracker call must be recorded');
});

test('each intent maps to its canned mock response', async (t) => {
    const client = new MockOpenAI();

    async function textFor(kind, prompt) {
        const response = await llmCall(client, kind, {
            messages: makeMessages(prompt),
            model: 'mock-gemma',
            temperature: 0.5,
            maxTokens: 800
        });
        return response.choices[0].message.content;
    }

    const summarization = await textFor('summarization', 'compress the history into a summary');
    assert.equal(summarization, 'A summary of the adventure.');

    const cards = await textFor('card_extraction', 'identify key characters and locations');
    assert.ok(cards.includes('"name": "Korr"'), 'card_extraction must return the Korr JSON');

    const opening = await textFor('opening_scene', 'Write the opening scene');
    assert.equal(opening, 'You stand on the desert sands of Tatooine.');

    const suggestion = await textFor('suggestion', 'give me a suggestion');
    assert.match(suggestion, /^1\. .+\n2\. .+\n3\. .+$/, 'suggestion must be numbered options');
});

test('llmEmbed returns a mock embedding vector and records an embedding tracker call', async (t) => {
    llmTracker.clear();
    const client = new MockOpenAI();

    const response = await llmEmbed(client, 'embedding', {
        model: 'mock-embedding-model',
        input: 'a glowing blue crystal'
    });

    assert.ok(response.data?.[0]?.embedding, 'llmEmbed must return a data[0].embedding');
    assert.equal(response.data[0].embedding.length, 768);

    const embeddingCalls = llmTracker.getCalls().filter(c => c.type === 'embedding');
    assert.equal(embeddingCalls.length, 1, 'exactly one embedding tracker call must be recorded');
});
