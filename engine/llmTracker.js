let activeCalls = []; // Array of { id, type, prompt, status, timestamp, duration, response, error, tokens }
let debugLogs = [];
let nextCallId = 1;

const DEEPSEEK_V4_FLASH_COST = {
    input: 0.40,   // $ per 1M tokens
    output: 1.10   // $ per 1M tokens
};

let sessionTotals = { input_tokens: 0, output_tokens: 0 };

export const llmTracker = {
    startCall(type, promptOrMessages) {
        const id = nextCallId++;
        const call = {
            id,
            type, // 'narration', 'summarization', 'extraction', 'opening_scene', 'embedding', 'embedding_batch'
            prompt: typeof promptOrMessages === 'string' ? promptOrMessages : JSON.stringify(promptOrMessages, null, 2),
            status: 'active',
            timestamp: new Date().toISOString(),
            duration: null,
            response: null,
            error: null,
            tokens: { input: 0, output: 0 }
        };
        activeCalls.push(call);
        if (activeCalls.length > 50) {
            activeCalls.shift();
        }
        return id;
    },

    endCall(id, responseText = null) {
        const call = activeCalls.find(c => c.id === id);
        if (call) {
            call.status = 'completed';
            call.duration = Date.now() - new Date(call.timestamp).getTime();
            call.response = typeof responseText === 'string' ? responseText : JSON.stringify(responseText, null, 2);
        }
    },

    failCall(id, error) {
        const call = activeCalls.find(c => c.id === id);
        if (call) {
            call.status = 'failed';
            call.duration = Date.now() - new Date(call.timestamp).getTime();
            call.error = error?.message || String(error);
        }
    },

    recordUsage(id, usage) {
        const call = activeCalls.find(c => c.id === id);
        if (call && usage) {
            const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
            const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
            call.tokens = { input: inputTokens, output: outputTokens };
            sessionTotals.input_tokens += inputTokens;
            sessionTotals.output_tokens += outputTokens;
        }
    },

    getSessionCost() {
        const total = sessionTotals;
        const inputCost = (total.input_tokens / 1_000_000) * DEEPSEEK_V4_FLASH_COST.input;
        const outputCost = (total.output_tokens / 1_000_000) * DEEPSEEK_V4_FLASH_COST.output;
        return {
            input_tokens: total.input_tokens,
            output_tokens: total.output_tokens,
            total_tokens: total.input_tokens + total.output_tokens,
            estimated_cost_usd: parseFloat((inputCost + outputCost).toFixed(6)),
            breakdown: `$${(inputCost + outputCost).toFixed(6)} = ${total.input_tokens} in × $${DEEPSEEK_V4_FLASH_COST.input}/1M + ${total.output_tokens} out × $${DEEPSEEK_V4_FLASH_COST.output}/1M`
        };
    },

    resetSessionCost() {
        sessionTotals = { input_tokens: 0, output_tokens: 0 };
    },

    getCalls() {
        return activeCalls;
    },

    clear() {
        activeCalls = [];
        sessionTotals = { input_tokens: 0, output_tokens: 0 };
    }
};

export function addDebugLog(msg) {
    debugLogs.push({
        timestamp: new Date().toLocaleTimeString(),
        message: msg
    });
    if (debugLogs.length > 100) {
        debugLogs.shift();
    }
}

export function getDebugLogs() {
    return debugLogs;
}

export function clearDebugLogs() {
    debugLogs = [];
}
