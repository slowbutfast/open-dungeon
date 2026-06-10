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
    create(options) {
        const stream = options.stream;
        const messages = options.messages || [];
        const userMsg = messages.length > 0 ? messages[messages.length - 1].content : "";
        
        if (stream) {
            return (async function*() {
                if (userMsg.includes("JSON array of objects") || userMsg.includes("Lore Card") || userMsg.includes("autoGenerateCards")) {
                    yield { choices: [{ delta: { content: '[{"name": "Korr", "type": "character", "description": "A legendary smuggler.", "trigger_words": ["korr"]}]' } }] };
                    return;
                }
                
                if (userMsg.includes("CHARACTER GENESIS") || userMsg.toLowerCase().includes("starting scene") || userMsg.toLowerCase().includes("character description")) {
                    yield { choices: [{ delta: { content: "You stand on the desert sands of Tatooine." } }] };
                    return;
                }
                
                if (userMsg.toLowerCase().includes("compress the following log")) {
                    yield { choices: [{ delta: { content: "A summary of the adventure." } }] };
                    return;
                }
                
                const narrative = "You walk south into the noisy cantina.\n[Status: Cantina | Score: 5]";
                const words = narrative.split(" ");
                for (const word of words) {
                    yield { choices: [{ delta: { content: word + " " } }] };
                    await new Promise(r => setTimeout(r, 10));
                }
                yield { choices: [{ delta: { content: "\n[Status: Cantina | Score: 5]" } }] };
            })();
        } else {
            return (async () => {
                if (userMsg.includes("JSON array of objects") || userMsg.includes("Lore Card") || userMsg.includes("autoGenerateCards")) {
                    return new MockCompletionResponse('[{"name": "Korr", "type": "character", "description": "A legendary smuggler.", "trigger_words": ["korr"]}]');
                }
                
                if (userMsg.includes("CHARACTER GENESIS") || userMsg.toLowerCase().includes("starting scene") || userMsg.toLowerCase().includes("character description")) {
                    return new MockCompletionResponse("You stand on the desert sands of Tatooine.");
                }
                
                if (userMsg.toLowerCase().includes("compress the following log")) {
                    return new MockCompletionResponse("A summary of the adventure.");
                }
                
                if (userMsg.toLowerCase().includes("suggestion")) {
                    const options = [
                        ["Search the room", "Open the chest", "Examine the symbols"],
                        ["Attack the shadow", "Cast light spell", "Listen at the door"],
                        ["Talk to the merchant", "Inspect the goods", "Leave the shop"],
                        ["Investigate the wall", "Look for traps", "Push the button"]
                    ];
                    const set = options[Math.floor(Math.random() * options.length)];
                    const content = `1. ${set[0]}\n2. ${set[1]}\n3. ${set[2]}`;
                    return new MockCompletionResponse(content);
                }
                
                return new MockCompletionResponse("You walk south into the noisy cantina.\n[Status: Cantina | Score: 5]");
            })();
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
