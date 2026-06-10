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

class MockChatCompletions {
    async *create(options) {
        const stream = options.stream;
        const messages = options.messages || [];
        const userMsg = messages.length > 0 ? messages[messages.length - 1].content : "";
        
        if (userMsg.includes("CHARACTER GENESIS") || userMsg.toLowerCase().includes("starting scene") || userMsg.toLowerCase().includes("character description")) {
            const content = "You stand on the desert sands of Tatooine.";
            if (stream) {
                yield { choices: [{ delta: { content } }] };
            } else {
                return new MockCompletionResponse(content);
            }
            return;
        }
        
        if (userMsg.includes("JSON array of objects") || userMsg.includes("Lore Card")) {
            const content = '[{"name": "Korr", "type": "character", "description": "A legendary smuggler.", "trigger_words": ["korr"]}]';
            if (stream) {
                yield { choices: [{ delta: { content } }] };
            } else {
                return new MockCompletionResponse(content);
            }
            return;
        }
        
        if (userMsg.toLowerCase().includes("compress the following log")) {
            const content = "A summary of the adventure.";
            if (stream) {
                yield { choices: [{ delta: { content } }] };
            } else {
                return new MockCompletionResponse(content);
            }
            return;
        }
        
        const narrative = "You walk south into the noisy cantina.\n[Status: Cantina | Score: 5]";
        if (stream) {
            const words = narrative.split(" ");
            for (const word of words) {
                yield { choices: [{ delta: { content: word + " " } }] };
                await new Promise(r => setTimeout(r, 10));
            }
            yield { choices: [{ delta: { content: "\n[Status: Cantina | Score: 5]" } }] };
        } else {
            return new MockCompletionResponse(narrative);
        }
    }
}

class MockChat {
    constructor() {
        this.completions = new MockChatCompletions();
    }
}

export class MockOpenAI {
    constructor() {
        this.baseURL = "http://mock-url/v1";
        this.models = new MockModels();
        this.chat = new MockChat();
    }
}
