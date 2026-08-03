import { llmTracker } from './llmTracker.js';
import { MockOpenAI } from './mockOpenAI.js';

/**
 * Shared player-input formatter (llm-adapter-unification).
 *
 * Single definition used by both the engine's public method
 * (`AdventureEngine.formatUserInput`) and the live turn path
 * (`generateResponseStream`). `continue` turns carry no player text; `do`,
 * `say`, and `story` turns are prefixed with `>` unless already prefixed.
 *
 * @param {string} actionType - 'do' | 'say' | 'story' | 'continue' | ...
 * @param {string} val - raw player text
 * @returns {string} formatted text
 */
export function formatUserInput(actionType, val) {
    if (actionType === "continue") return "";
    const cleaned = val.trim();
    if (actionType === "do" || actionType === "say" || actionType === "story") {
        if (cleaned.startsWith(">")) return cleaned;
        return `> ${cleaned}`;
    }
    return cleaned;
}

function isMockClient(client) {
    return client instanceof MockOpenAI;
}

function summarizeEmbeddingResponse(kind, response) {
    if (kind === 'embedding') {
        const size = response.data?.[0]?.embedding?.length;
        if (size) return `[Vector of size ${size}]`;
    } else {
        if (Array.isArray(response.data)) {
            return `[${response.data.length} vectors of size ${response.data[0]?.embedding?.length || 0}]`;
        }
    }
    return null;
}

/**
 * One LLM wire path for every chat call site (llm-adapter-unification).
 *
 * Builds the request body exactly as the pre-adapter call sites did — model,
 * messages, temperature, `max_tokens`, the openrouter
 * `reasoning = { effort }` / `stream_options = { include_usage: true }` block
 * for openrouter, and `stream` only for narration — so real-mode bodies stay
 * byte-identical. In mock mode the body is additionally tagged with the intent
 * so `mockOpenAI.js` dispatches by intent, never by prompt substring.
 *
 * Non-streaming calls get the full tracker wrap here (startCall/endCall/
 * failCall). Streaming (`narration`) returns `{ stream, callId }`: the caller
 * owns the semantic end — recording usage, ending the call with the sanitized
 * narration, and the fallback-model retry reusing one call record — so the
 * `for await (chunk of stream)` generator loop is preserved untouched.
 *
 * @param {object} client - the OpenAI-compatible client (real or mock)
 * @param {string} kind - tracker kind label ('narration', 'summarization',
 *   'card_extraction', 'extraction', 'opening_scene', 'suggestion', ...)
 * @param {object} opts
 * @param {Array<{role: string, content: string}>} opts.messages - chat messages
 * @param {string} opts.model - model id
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {boolean} [opts.stream=false]
 * @param {boolean} [opts.isOpenRouter=false]
 * @param {string|null} [opts.reasoningEffort=null]
 * @param {number|null} [opts.callId=null] - reuse an existing tracker call id
 *   (narration retry); when absent a new call is started
 * @returns {Promise<object>} for non-streaming: the create response; for
 *   streaming: `{ stream, callId }`
 */
export async function llmCall(client, kind, opts = {}) {
    const { messages, model, temperature, maxTokens, stream = false, isOpenRouter = false, reasoningEffort = null } = opts;
    const callId = opts.callId ?? llmTracker.startCall(kind, messages);

    const requestBody = { model, messages };
    if (temperature !== undefined) requestBody.temperature = temperature;
    if (maxTokens !== undefined) requestBody.max_tokens = maxTokens;
    if (stream) requestBody.stream = true;
    if (isOpenRouter) {
        requestBody.reasoning = { effort: reasoningEffort };
        requestBody.stream_options = { include_usage: true };
    }
    if (isMockClient(client)) {
        requestBody.intent = kind;
    }

    if (stream) {
        // Streaming: the caller owns endCall/failCall (semantic end + retry
        // reuse), so a create failure propagates without a tracker write here.
        const response = await client.chat.completions.create(requestBody);
        return { stream: response, callId };
    }

    try {
        const response = await client.chat.completions.create(requestBody);
        llmTracker.endCall(callId, response.choices?.[0]?.message?.content ?? null);
        return response;
    } catch (e) {
        llmTracker.failCall(callId, e);
        throw e;
    }
}

/**
 * One LLM wire path for the embedding call sites (llm-adapter-unification).
 *
 * Owns the tracker wrap (startCall/endCall/failCall) and tags the request with
 * the intent in mock mode. Response validation and the fallback behavior stay
 * at the call site (`engine/memory/embeddings.js`).
 *
 * @param {object} client - the OpenAI-compatible client (real or mock)
 * @param {string} kind - 'embedding' | 'embedding_batch'
 * @param {object} opts
 * @param {string} opts.model - embedding model id
 * @param {string|string[]} opts.input - text (or array of texts) to embed
 * @returns {Promise<object>} the embeddings.create response
 */
export async function llmEmbed(client, kind, opts = {}) {
    const callId = llmTracker.startCall(kind, opts.input);
    const requestBody = { model: opts.model, input: opts.input, encoding_format: 'float' };
    if (isMockClient(client)) {
        requestBody.intent = kind;
    }
    try {
        const response = await client.embeddings.create(requestBody);
        llmTracker.endCall(callId, summarizeEmbeddingResponse(kind, response));
        return response;
    } catch (e) {
        llmTracker.failCall(callId, e);
        throw e;
    }
}
