// Helper classes for offline/PTY testing mode when MOCK_LLM=1
class MockChoiceMessage {
    constructor(content) {
        this.content = content;
    }
}

class MockChoice {
    constructor(content) {
        this.message = new MockChoiceMessage(content);
    }
}

class MockCompletionResponse {
    constructor(content) {
        this.choices = [new MockChoice(content)];
    }
}

class MockModels {
    async list() {
        return {
            data: [{ id: 'mock-gemma' }]
        };
    }
}

// The canned per-intent responses (llm-adapter-unification). The adapter tags
// each mock-mode request with an `intent`, so dispatch is keyed by intent, not
// by prompt substring: a prompt edit can no longer silently change or break
// mock behavior. The narration stream is the fragmented cantina narrative with
// the canonical three-field status line (status-line-contract-residue).
const KORR_CARD_JSON = '[{"name": "Korr", "type": "character", "description": "A legendary smuggler.", "trigger_words": ["korr"]}]';

const EVENT_EXTRACTION_JSON = '{"events":[{"type":"movement","summary":"Travelled through the area.","entities":[],"location":"Unknown"}],"inventory_changes":[],"lore_facts":[],"offers":[],"goals":[]}';

const CANONICAL_STATUS_LINE = '[Status: Cantina | Score: 5 | Moves: 0]';

const SUGGESTION_SETS = [
    ["Search the room", "Open the chest", "Examine the symbols"],
    ["Attack the shadow", "Cast light spell", "Listen at the door"],
    ["Talk to the merchant", "Inspect the goods", "Leave the shop"],
    ["Investigate the wall", "Look for traps", "Push the button"]
];

function suggestionContent() {
    const set = SUGGESTION_SETS[Math.floor(Math.random() * SUGGESTION_SETS.length)];
    return `1. ${set[0]}\n2. ${set[1]}\n3. ${set[2]}`;
}

function* fragmentedNarrationChunks() {
    const narrative = `You walk south into the noisy cantina.\n${CANONICAL_STATUS_LINE}`;
    const words = narrative.split(" ");
    for (const word of words) {
        yield { choices: [{ delta: { content: word + " " } }] };
    }
    yield { choices: [{ delta: { content: `\n${CANONICAL_STATUS_LINE}` } }] };
}

class MockChatCompletions {
    create(options) {
        const stream = options.stream;
        const intent = options.intent;

        const makeContent = (content) => {
            if (stream) {
                return (async function* () {
                    yield { choices: [{ delta: { content } }] };
                })();
            }
            return new MockCompletionResponse(content);
        };

        switch (intent) {
            case 'card_extraction':
                return makeContent(KORR_CARD_JSON);
            case 'event_extraction':
            case 'extraction':
                return makeContent(EVENT_EXTRACTION_JSON);
            case 'summarization':
                return makeContent("A summary of the adventure.");
            case 'opening_scene':
                return makeContent("You stand on the desert sands of Tatooine.");
            case 'suggestion':
                return makeContent(suggestionContent());
            case 'narration':
            default:
                // Unknown/missing intent falls back to the default narration so
                // the mock never serves nothing. Non-streaming returns the whole
                // canned narration; streaming fragments it word-by-word and
                // repeats the trailing status line (both consumers parse it via
                // the shared parseStatusLine).
                if (stream) {
                    return (async function* () {
                        for (const chunk of fragmentedNarrationChunks()) {
                            yield chunk;
                            await new Promise(r => setTimeout(r, 10));
                        }
                    })();
                }
                return new MockCompletionResponse(`You walk south into the noisy cantina.\n${CANONICAL_STATUS_LINE}`);
        }
    }
}

class MockChat {
    constructor() {
        this.completions = new MockChatCompletions();
    }
}

class MockEmbeddings {
    async create(options) {
        const inputs = Array.isArray(options.input) ? options.input : [options.input];
        const data = inputs.map((inp, idx) => ({
            embedding: Array(768).fill(0).map((_, i) => Math.sin(idx + i) * 0.1),
            index: idx
        }));
        return { data };
    }
}

export class MockOpenAI {
    constructor() {
        this.baseURL = "http://mock-url/v1";
        this.models = new MockModels();
        this.chat = new MockChat();
        this.embeddings = new MockEmbeddings();
    }
}
