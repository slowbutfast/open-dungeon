// Helper classes for offline/PTY testing mode when MOCK_LLM=1
import { readFileSync } from 'fs';

// Scripted narration (scriptable-mock-narrator): when MOCK_SCRIPT_FILE is set
// to a readable JSON array of canonical status-line strings (each a canonical
// three-field `Status / Score / Moves` line matching the shared STATUS_FORMAT
// contract), the narration intent serves the next line per turn and holds the
// last line when the script is exhausted. Read lazily on the first narration
// use so a bad path never fails startup; unset, unreadable, or invalid input
// falls back to the canned narration with a warning (D4), so the default path
// stays byte-identical.
function loadScriptedNarration() {
    const scriptPath = process.env.MOCK_SCRIPT_FILE;
    if (!scriptPath) {
        return null;
    }
    try {
        const parsed = JSON.parse(readFileSync(scriptPath, 'utf-8'));
        if (!Array.isArray(parsed) || parsed.length === 0 ||
                parsed.some(line => typeof line !== 'string' || !line.trim())) {
            console.warn(`[MOCK] MOCK_SCRIPT_FILE ${scriptPath} is not a non-empty JSON array of status-line strings; using canned narration.`);
            return null;
        }
        return parsed;
    } catch (err) {
        console.warn(`[MOCK] MOCK_SCRIPT_FILE ${scriptPath} could not be read (${err.message}); using canned narration.`);
        return null;
    }
}

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
    constructor() {
        // Script state is loaded lazily on the first narration call so a bad
        // MOCK_SCRIPT_FILE never breaks startup (D4). `undefined` = not yet
        // loaded; `null` = no script (unset/unreadable/invalid) -> canned.
        this._script = undefined;
        this._scriptIndex = 0;
    }

    _nextScriptedLine() {
        if (this._script === undefined) {
            this._script = loadScriptedNarration();
            this._scriptIndex = 0;
        }
        if (!this._script) {
            return null;
        }
        // Hold the last line on exhaustion (mirrors spatialIntegration.test.mjs).
        const line = this._script[Math.min(this._scriptIndex, this._script.length - 1)];
        this._scriptIndex += 1;
        return line;
    }

    _cannedNarration(stream) {
        // The default path — byte-identical to the pre-change canned narration
        // (env unset or bad script). Streaming fragments it word-by-word and
        // repeats the trailing status line (both consumers parse it via the
        // shared parseStatusLine); non-streaming returns the whole narration.
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
            case 'narration': {
                // Scripted narration: serve the next scripted canonical status
                // line through the same delta-chunk stream shape canned
                // narration uses, so parseStatusLine and history sanitization
                // behave identically (D3).
                const scriptedLine = this._nextScriptedLine();
                if (scriptedLine !== null) {
                    if (stream) {
                        return (async function* () {
                            yield { choices: [{ delta: { content: scriptedLine } }] };
                        })();
                    }
                    return new MockCompletionResponse(scriptedLine);
                }
                return this._cannedNarration(stream);
            }
            default:
                // Unknown/missing intent falls back to the default narration so
                // the mock never serves nothing. Scripting is strictly
                // narration-scoped; other intents keep their canned behavior.
                return this._cannedNarration(stream);
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
