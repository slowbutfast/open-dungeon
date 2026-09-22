import { AsyncLocalStorage } from 'node:async_hooks';

let activeCalls = []; // Array of { id, type, prompt, status, timestamp, duration, response, error, tokens, model }
let debugLogs = [];
let nextCallId = 1;

const DEEPSEEK_V4_FLASH_COST = {
    input: 0.40,   // $ per 1M tokens
    output: 1.10   // $ per 1M tokens
};

// Model pricing catalog in USD per 1M tokens (vercel-deployment-and-auth,
// task 3.1). Mirrors web/openrouterModels.js plus the default narration model.
export const MODEL_PRICING = {
    'deepseek/deepseek-v4-flash': { prompt: 0.40, completion: 1.10 },
    'google/gemini-2.5-flash': { prompt: 0.30, completion: 2.50 },
    'deepseek/deepseek-v4-pro': { prompt: 0.44, completion: 0.87 },
    'sao10k/l3.3-euryale-70b': { prompt: 0.65, completion: 0.75 },
    'meta-llama/llama-3.3-70b-instruct': { prompt: 0.13, completion: 0.40 },
    'qwen/qwen-2.5-72b-instruct': { prompt: 0.36, completion: 0.40 },
    'google/gemini-2.5-pro': { prompt: 1.25, completion: 10.00 },
    'deepseek/deepseek-r1': { prompt: 0.70, completion: 2.50 }
};

// Conservative fallback for unlisted models: $0.002 / 1K tokens (the spec's
// anti-zero-cost-drain default), applied to both directions.
export const FALLBACK_PRICING = { prompt: 2.00, completion: 2.00 };

export function getModelPricing(model) {
    return MODEL_PRICING[model] || FALLBACK_PRICING;
}

/** Exact cost in USD of a single completion from prompt/completion tokens. */
export function computeCost({ model, promptTokens = 0, completionTokens = 0 }) {
    const p = getModelPricing(model);
    return (promptTokens / 1_000_000) * p.prompt + (completionTokens / 1_000_000) * p.completion;
}

/** Aggregate cost of every operation executed within one turn. */
export function computeTurnCost(operations = []) {
    return operations.reduce((sum, op) => sum + computeCost(op), 0);
}

let sessionTotals = { input_tokens: 0, output_tokens: 0 };

// Active turn accumulator, scoped to the request's async context.
//
// The in-flight lock serializes turns per user, but a warm serverless instance
// can still serve concurrent requests for DIFFERENT users. A module-global
// accumulator would let one request's LLM usage land in another's turn (or be
// dropped when the first `endTurn()` clears it), mis-attributing spend. Tying
// the turn to the async context keeps each request's operations isolated.
// `fallbackTurn` preserves the synchronous call pattern used by unit tests and
// any code running outside an async context.
const turnStorage = new AsyncLocalStorage();
let fallbackTurn = null;

function getActiveTurn() {
    return turnStorage.getStore() || fallbackTurn;
}

function openTurn(key) {
    const turn = { key, operations: [] };
    fallbackTurn = turn;
    turnStorage.enterWith(turn);
    return turn;
}

function closeTurn() {
    fallbackTurn = null;
    turnStorage.enterWith(undefined);
}

function snapshotTurn(turn) {
    if (!turn) return { key: null, operations: [], estimated_cost_usd: 0 };
    return {
        key: turn.key,
        operations: [...turn.operations],
        estimated_cost_usd: computeTurnCost(turn.operations)
    };
}

export const llmTracker = {
    beginTurn(key = 'default') {
        return openTurn(key);
    },

    setActiveTurn(key) {
        const existing = getActiveTurn();
        if (!existing || existing.key !== key) {
            return openTurn(key);
        }
        return existing;
    },

    recordTurnOperation(op) {
        const turn = getActiveTurn();
        if (!turn || !op) return;
        turn.operations.push({
            kind: op.kind || 'unknown',
            model: op.model || null,
            promptTokens: op.promptTokens || 0,
            completionTokens: op.completionTokens || 0
        });
    },

    getTurnCost(key = null) {
        const turn = getActiveTurn();
        if (key && (!turn || turn.key !== key)) {
            return { key, operations: [], estimated_cost_usd: 0 };
        }
        return snapshotTurn(turn);
    },

    endTurn() {
        const result = snapshotTurn(getActiveTurn());
        closeTurn();
        return result;
    },

    resetTurn() {
        closeTurn();
    },

    startCall(type, promptOrMessages, model = null) {
        const id = nextCallId++;
        const call = {
            id,
            type, // 'narration', 'summarization', 'extraction', 'opening_scene', 'embedding', 'embedding_batch'
            model,
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
            // Feed the active turn so the cost of narration, summarization,
            // and extraction are aggregated into one ledger commit.
            if (getActiveTurn()) {
                this.recordTurnOperation({
                    kind: call.type,
                    model: call.model,
                    promptTokens: inputTokens,
                    completionTokens: outputTokens
                });
            }
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
        closeTurn();
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
